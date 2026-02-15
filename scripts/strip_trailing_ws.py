"""Strip trailing whitespace and whitespace-only lines from .py files in workspace.

Usage: python scripts/strip_trailing_ws.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def clean_file(path: Path) -> bool:
    changed = False
    with path.open("r", encoding="utf-8") as f:
        lines = f.readlines()
    new_lines = []
    for ln in lines:
        # remove trailing whitespace
        new = ln.rstrip("\n").rstrip(" \t")
        # if line becomes empty, keep a single newline (no spaces)
        if new == "":
            new_lines.append("\n")
        else:
            new_lines.append(new + "\n")
    if new_lines != lines:
        with path.open("w", encoding="utf-8", newline="\n") as f:
            f.writelines(new_lines)
        changed = True
    return changed


def main():
    py_files = list(ROOT.rglob("*.py"))
    changed_files = []
    for p in py_files:
        if p.name.startswith("."):
            continue
        if clean_file(p):
            changed_files.append(str(p.relative_to(ROOT)))
    print(f"Processed {len(py_files)} .py files, modified {len(changed_files)} files.")
    if changed_files:
        print("Modified files:")
        for f in changed_files:
            print(" -", f)


if __name__ == "__main__":
    main()
