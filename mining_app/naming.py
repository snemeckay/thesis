"""Portable researcher-chosen download names, separate from private file paths."""

import re

from mining_app.preparation import ValidationError


def output_name(value):
    if not isinstance(value, str):
        raise ValidationError("Enter a name for the mined CSV before mining.")
    name = re.sub(r"\.csv$", "", value.strip(), flags=re.IGNORECASE)
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _-]{0,79}", name) or name.endswith(" "):
        raise ValidationError("CSV name must use 1-80 letters, digits, spaces, hyphens or underscores, optionally ending in .csv. Do not include a folder path.")
    if name.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
                       *(f"LPT{i}" for i in range(1, 10))}:
        raise ValidationError("That CSV name is reserved by Windows. Choose a different name.")
    return name


def artifact_download_name(job, artifact, extension):
    if not job.get("output_name"):
        return artifact[extension]
    suffix = f"_{artifact['level']}" if len(job["artifacts"]) > 1 else ""
    return f"{job['output_name']}{suffix}.{extension}"
