"""Copy a profile's database to backups/, e.g. `make backup` or `uv run python -m backend.backup testing`."""

from __future__ import annotations

import sys
from datetime import datetime

from backend import db

BACKUP_DIR = db.BASE_DIR / "backups"


def main(profile: str = db.DEFAULT_PROFILE) -> None:
    db.use_profile(profile)
    source = db.active_profile().db
    if not source.exists():
        sys.exit(f"No database at {source}, nothing to back up.")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    print(db.backup_to(BACKUP_DIR / f"{source.stem}-{stamp}.db"))


if __name__ == "__main__":
    main(*sys.argv[1:2])
