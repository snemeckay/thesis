from config import BROWSER_EXES
from helpers import canonicalize_app, normalize_title, normalize_url


def extract_window_events(bucket_data):
    events = []

    for e in bucket_data.get("events", []):
        data = e.get("data", {})
        raw_app = (data.get("app") or "").lower()

        # skip browsers - handled by web watcher
        if raw_app in BROWSER_EXES:
            continue

        app = canonicalize_app(data.get("app"))
        title = normalize_title(data.get("title"))

        events.append({
            "source": "window",
            "timestamp": e["timestamp"],
            "duration": e["duration"],
            "activity": app,
            "object": title, 
            "app_raw": data.get("app"),
            "title_raw": data.get("title"),
            "current_apps": data.get("current_apps", []),
            "seconds_since_last_input": data.get("seconds_since_last_input"),
            "last_input_source": data.get("last_input_source"),
        })

    return events


def extract_web_events(bucket_data):
    events = []

    for e in bucket_data.get("events", []):
        data = e.get("data", {})
        url = data.get("url")
        domain, top_path = normalize_url(url)
        title = normalize_title(data.get("title"))

        activity = f"WEB:{domain}" if domain else "WEB:unknown"

        events.append({
            "source": "web",
            "timestamp": e["timestamp"],
            "duration": e["duration"],
            "activity": activity,
            "object": title,
            "domain": domain,
            "top_path": top_path,
            "url_raw": url,
            "title_raw": data.get("title"),
            "seconds_since_last_input": None,
            "last_input_source": None,
            "current_apps": None,
            "app_raw": None,
        })

    return events
