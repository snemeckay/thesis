"""Configuration parameters for data preprocessing pipeline.

Defines time windows for behavioral day detection, gap thresholds, and output schema.
These values are used throughout the preprocessing module to control day segmentation behavior.
"""

RAW_COL_USER = "user_id"
RAW_COL_START = "start_time"
RAW_COL_END = "end_time"
RAW_COL_APP = "app_in_focus"
RAW_COL_URL = "url3"

# Behavioral day boundaries: gaps ending in this window are primary candidate boundaries
WAKING_WINDOW_START = 4      # 04:00 (4am)
WAKING_WINDOW_END = 12       # 12:00 (noon)

# Fallback: if no waking-window gaps found, look for night-time gaps as boundaries
NIGHT_WINDOW_START = 20      # 20:00 (8pm)
NIGHT_WINDOW_END = 4         # 04:00 (4am)

# Last resort: late-sleep gaps (gap start in this window)
LATE_SLEEP_START = 3          # 03:00 (3am)
LATE_SLEEP_END = 10           # 10:00 (10am)

# Minimum gap length to be considered for boundary selection
MIN_INACTIVITY_GAP_HOURS = 4

OUTPUT_COLS = [
	"case_id",
	"activity_clean",
	"timestamp",
	RAW_COL_USER,
	RAW_COL_START,
	RAW_COL_END,
	"duration_secs",
	"source",
	"client",
	"audible",
	"incognito",
	"tab_count",
	RAW_COL_URL,
	RAW_COL_APP,
]
