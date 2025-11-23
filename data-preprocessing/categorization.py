from config import IDLE_THRESHOLD_SECONDS, CATEGORY_DOMAIN, CATEGORY_ACTIVITY

def categorize_activity_row(row):
    """
    Heuristic categorization of events into higher-level activity categories.
    Uses both 'activity' and 'domain' (for web events).
    """
    act = (row.get("activity") or "").lower()
    dom = (row.get("domain") or "").lower()

    if row.get("is_idle", False):
        return "IDLE"

    # domain-based rules
    if dom in CATEGORY_DOMAIN:
        return CATEGORY_DOMAIN[dom]

    # activity-name-based rules
    for category, substrings in CATEGORY_ACTIVITY.items():
        for sub in substrings:
            if sub in act:
                return category

    if act.startswith("web:"):
        return "WEB_OTHER"

    return "OTHER"


def mark_idle(df):
    """
    Add 'is_idle' boolean column and turn idle events into 'Idle' activity.
    Idle definition: seconds_since_last_input >= IDLE_THRESHOLD_SECONDS.
    """
    # rows with NaN = 0 (not idle)
    s = df["seconds_since_last_input"].fillna(0)
    df["is_idle"] = s >= IDLE_THRESHOLD_SECONDS

    df.loc[df["is_idle"], "activity"] = "Idle"
    df.loc[df["is_idle"], "object"] = None

    return df