import os
from pathlib import Path

_base = os.environ["MEMORYVAULT_BASE"]
RAW_DIR: str = os.path.join(_base, "raw")


def parse_filename_title(filename: str) -> str | None:
    stem = Path(filename).stem
    if " " not in stem:
        return None
    candidate = stem.split(" ", 1)[1].strip()
    return candidate if candidate and not candidate.isdigit() else None
