# Web browser executables that used ActivityWatch web extension
# Events with these will be removed from the Window ActivityWatch logs to remove duplication.
BROWSER_EXES = {
    "opera.exe",
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
}

# Renaming dictionary for apps
APP_CANONICAL = {
    "code.exe": "VSCode",
    "devenv.exe": "VisualStudio",
    "notepad.exe": "Notepad",
    "powershell.exe": "PowerShell",
    "cmd.exe": "CommandPrompt",
    "photoshop.exe": "Photoshop",
    "opera.exe": "Browser",
    "chrome.exe": "Browser",
    "firefox.exe": "Browser",
    "msedge.exe": "Browser",
}

# Duration to filter micro-events
MIN_DURATION_SECONDS = 2.0

# Threshold for idle detection based on seconds_since_last_input
IDLE_THRESHOLD_SECONDS = 300  # 5 minutes

# Domain-based categorization of web events
CATEGORY_DOMAIN = {
    "DEV_REPOSITORY": ["github.com", "gitlab.com", "bitbucket.org"],
    "LLM_ASSISTANT": ["chatgpt.com", "openai.com"],
    "DEV_QA": ["stackoverflow.com", "stackexchange.com"],
    "ENTERTAINMENT": ["youtube.com", "netflix.com"],
    "COMMUNICATION": ["discord.com", "teams.microsoft.com", "slack.com"],
}

# Activity-name-based categorization of apps
CATEGORY_ACTIVITY = {
    "DEV_IDE": ["vscode", "visualstudio", "pycharm", "intellij", "idea"],
    "TEXT_EDITOR": ["notepad", "sublime", "notepad++"],
    "DESIGN": ["photoshop", "illustrator", "figma"],
    "FILE_MANAGER": ["explorer", "finder"],
    "TERMINAL": ["powershell", "cmd", "terminal", "bash"],
}

ACTIVITY_CLEAN_REGEX = r"[^A-Za-z0-9_]+"
