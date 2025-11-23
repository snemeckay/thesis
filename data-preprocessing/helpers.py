import json
import re
from pathlib import Path
from urllib.parse import urlparse

from config import APP_CANONICAL

def load_json(path):
    path = Path(path)
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def canonicalize_app(app):
    if not app:
        return None

    app_lower = app.lower()
    if app_lower in APP_CANONICAL:
        return APP_CANONICAL[app_lower]

    base = re.sub(r"\.exe$", "", app_lower)
    return base.capitalize() if base else app


def normalize_title(title):
    if not title:
        return None

    t = title.strip()

    # leading '*' (unsaved file) etc.
    t = t.lstrip("*").strip()

    # collapse whitespace
    t = re.sub(r"\s+", " ", t)

    if "\\" in t or "/" in t:
        t = re.split(r"[\\/]", t)[-1]

    return t


def normalize_url(url):
    """
    Return (domain, top-level path) from url, e.g.
    'https://github.com/user/repo/issues' -> ('github.com', '/user')
    """
    if not url:
        return None, None

    if not url.startswith("http://") and not url.startswith("https://"):
        url_for_parse = "http://" + url
    else:
        url_for_parse = url

    parsed = urlparse(url_for_parse)
    domain = parsed.netloc.lower()

    # strip 'www.'
    if domain.startswith("www."):
        domain = domain[4:]

    # top-level path segment
    path_parts = parsed.path.split("/")
    if len(path_parts) > 1 and path_parts[1]:
        top_path = "/" + path_parts[1]
    else:
        top_path = "/"

    return domain, top_path