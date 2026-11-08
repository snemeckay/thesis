"""Loopback-only web API. Private files are never exposed by static mounts."""

import importlib.metadata
import json
import logging
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from mining_app.preparation import ValidationError, fingerprint, normalize, preview, select_cohort
from mining_app.storage import Store, read_json, write_json


ROOT = Path(__file__).resolve().parents[1]
MAX_UPLOAD = 20 * 1024 * 1024
log = logging.getLogger(__name__)


def engine_versions(engine):
    names = ["pm4py"] + (["Declare4Py"] if engine == "declare4py" else [])
    result = {}
    for name in names:
        try:
            result[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError as exc:
            raise ValidationError(f"{name} is not installed. Install requirements.txt in the local environment; no engine has run.") from exc
    return result


def configuration(raw, dataset):
    engine = raw.get("engine", "discover")
    level = raw.get("label_level", "activity")
    if engine not in ("discover", "declare4py") or level not in ("activity", "category", "both"):
        raise ValidationError("Choose a supported engine and activity/category/both label level.")
    if level != "activity" and not dataset["metadata"]["category_available"]:
        raise ValidationError("Category mining requires a mapped, complete activity-category column.")
    cfg = {"engine": engine, "label_level": level}
    for key, default in (("min_support", 0.0), ("min_confidence", 0.0), ("itemsets_support", 0.1)):
        value = raw.get(key, default)
        if not isinstance(value, (int, float)) or isinstance(value, bool) or not 0 <= value <= 1:
            raise ValidationError(f"{key} must be a number between 0 and 1.")
        cfg[key] = value
    if engine == "declare4py" and cfg["itemsets_support"] <= 0:
        raise ValidationError("Declare4Py itemset support must be greater than zero (its library rejects zero).")
    cardinality = raw.get("max_cardinality", 2)
    if not isinstance(cardinality, int) or isinstance(cardinality, bool) or not 1 <= cardinality <= 10:
        raise ValidationError("Maximum cardinality must be an integer from 1 to 10.")
    cfg["max_cardinality"] = cardinality
    return cfg


def create_app(data_dir=None):
    store = Store(data_dir or ROOT / ".mining-local")
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mining")

    @asynccontextmanager
    async def lifespan(app):
        yield
        executor.shutdown(wait=True)

    app = FastAPI(title="Local research mining", docs_url=None, redoc_url=None, lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost"])
    app.state.store = store

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        origin = request.headers.get("origin")
        expected = f"{request.url.scheme}://{request.headers.get('host', '')}"
        if origin and origin != expected:
            return JSONResponse({"error": "Only same-origin local requests are allowed."}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site" and (
                request.url.path.startswith("/api/") or request.method not in {"GET", "HEAD"}):
            return JSONResponse({"error": "Cross-site local access is not allowed."}, status_code=403)
        if request.method in {"POST", "PUT"}:
            length = request.headers.get("content-length")
            if not length or not length.isdigit() or int(length) > MAX_UPLOAD + 65536:
                return JSONResponse({"error": "Request must have a length and fit within 20 MiB."}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response

    @app.exception_handler(ValidationError)
    async def validation_error(request, exc):
        return JSONResponse({"error": str(exc)}, status_code=422)

    async def json_body(request):
        try:
            return await request.json()
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError("Request body must be valid UTF-8 JSON.") from exc

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        log.exception("Local application request failed")
        return JSONResponse({"error": "Local application error. See the server terminal for details; no result was substituted."}, status_code=500)

    @app.get("/api/health")
    def health():
        return {"status": "ready"}

    @app.get("/api/datasets")
    def datasets():
        return store.summaries()

    @app.post("/api/preview")
    async def upload(file: UploadFile = File(...), delimiter: str | None = None):
        content = await file.read(MAX_UPLOAD + 1)
        if len(content) > MAX_UPLOAD:
            raise ValidationError("CSV exceeds the 20 MiB local upload limit.")
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError("Save the CSV as UTF-8 before uploading.") from exc
        result = preview(text, delimiter)
        identifier = store.upload(text, Path(file.filename or "Dataset").name)
        return {**result, "upload_id": identifier}

    @app.post("/api/prepare")
    async def prepare(request: Request):
        body = await json_body(request)
        if not isinstance(body, dict) or not isinstance(body.get("profile"), dict):
            raise ValidationError("Provide an upload identifier and a preparation profile.")
        path = store.path("uploads", body.get("upload_id", "")) / "upload.json"
        if not path.exists():
            raise ValidationError("Upload not found. Select the CSV again.")
        raw = read_json(path)
        return store.save_dataset(normalize(raw["text"], body["profile"]), raw["name"])

    @app.get("/api/profiles")
    def profiles():
        return [read_json(path) for path in store.root.glob("profiles/*/profile.json")]

    @app.post("/api/profiles")
    async def save_profile(request: Request):
        body = await json_body(request)
        if not isinstance(body, dict) or not isinstance(body.get("profile"), dict) or not isinstance(body.get("name"), str) or not body["name"].strip():
            raise ValidationError("Provide a profile name and mapping object.")
        identifier = fingerprint(body)
        result = {**body, "id": identifier}
        write_json(store.path("profiles", identifier) / "profile.json", result)
        return result

    def execute(identifier):
        path = store.path("models", identifier)
        job = store.job(identifier)
        write_json(path / "job.json", {**job, "status": "running", "progress": "Mining complete cases. Large activity sets can take several minutes."})
        try:
            with (path / "engine.log").open("w", encoding="utf-8") as output:
                subprocess.run([sys.executable, "-m", "mining_app.worker", str(path)],
                               cwd=ROOT, stdout=output, stderr=subprocess.STDOUT,
                               check=True, timeout=3600)
            metadata = read_json(path / "metadata.json")
            write_json(path / "job.json", {**job, "status": "complete", "progress": "Results ready",
                                         "metadata": metadata, "artifacts": metadata["artifacts"]})
        except (subprocess.SubprocessError, OSError, ValueError) as exc:
            log.exception("Mining job %s failed", identifier)
            message = "Mining failed. Review the local engine log and settings. No replacement model was generated."
            if isinstance(exc, subprocess.TimeoutExpired):
                message = "Mining exceeded the one-hour limit. Reduce label complexity or use categories."
            write_json(path / "job.json", {**job, "status": "failed", "error": message,
                                         "log_url": f"/api/models/{identifier}/file/engine.log"})

    @app.post("/api/mine")
    async def mine(request: Request):
        body = await json_body(request)
        if not isinstance(body, dict) or not isinstance(body.get("configuration", {}), dict):
            raise ValidationError("Provide a dataset, cohort, and mining configuration.")
        dataset = store.dataset(body.get("dataset_id", ""))
        cfg = configuration(body.get("configuration", {}), dataset)
        cohort = body.get("cohort", [])
        events, count = select_cohort(dataset, cohort)
        versions = engine_versions(cfg["engine"])
        identity = {"dataset_id": dataset["id"], "configuration": cfg, "cohort": cohort,
                    "versions": versions, "workflow_version": 1}
        identifier = fingerprint(identity)
        path = store.path("models", identifier)
        with store.lock:
            if (path / "job.json").exists():
                existing = store.job(identifier)
                if existing["status"] in {"complete", "queued", "running"}:
                    return {**existing, "cached": existing["status"] == "complete"}
            job = {**identity, "id": identifier, "status": "queued",
                   "population": {"cases": count, "events": len(events)},
                   "progress": "Waiting for the local mining worker", "cached": False}
            write_json(path / "input.json", dataset)
            write_json(path / "job.json", job)
            executor.submit(execute, identifier)
        return job

    @app.get("/api/jobs/{identifier}")
    def job(identifier: str):
        return store.job(identifier)

    @app.get("/api/models")
    def models(dataset_id: str | None = None):
        return store.models(dataset_id)

    @app.get("/api/models/{identifier}/file/{filename}")
    def model_file(identifier: str, filename: str):
        job = store.job(identifier)
        allowed = {"metadata.json", "engine.log"}
        for artifact in job.get("artifacts", []):
            allowed.update({artifact["csv"], artifact["json"]})
        if filename not in allowed:
            raise ValidationError("Model artifact not available.")
        path = store.path("models", identifier) / filename
        if not path.is_file():
            raise ValidationError("Artifact has not been written yet.")
        return FileResponse(path, filename=filename)

    @app.get("/api/datasets/{identifier}/bundle")
    def bundle(identifier: str):
        return Response(store.bundle(identifier), media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="research-{identifier[:12]}.zip"'})

    @app.get("/")
    def index():
        return FileResponse(ROOT / "mining_app" / "web" / "index.html")

    app.mount("/app", StaticFiles(directory=ROOT / "mining_app" / "web"), name="application")
    app.mount("/visualization", StaticFiles(directory=ROOT / "visualization"), name="visualization")

    @app.get("/output/{filename}")
    def bundled(filename: str):
        if filename not in {"preprocessed_dcr_constraints.csv", "preprocessed_declare4py_constraints.csv"}:
            raise ValidationError("Only bundled sample model files are available here.")
        return FileResponse(ROOT / "output" / filename)

    return app


def main():
    import argparse
    import uvicorn
    parser = argparse.ArgumentParser(description="Run private local research mining on loopback.")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(create_app(), host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
