#!/usr/bin/env python3
"""Backfill file_hash for existing Video rows and populate known_file_hashes.

Run this once after deploying the duplicate-detection feature to cover videos
that were processed before hashing was added.

Usage:
    python3 scripts/backfill_hashes.py [--db ./database/app.db] [--dry-run]

The script is idempotent: it skips videos that already have file_hash set.
"""

import argparse
import hashlib
import sqlite3
import sys
from pathlib import Path


def compute_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default="./database/app.db",
        help="Path to the SQLite database file (default: ./database/app.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute hashes and report what would change without writing anything",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        sys.exit(f"Database not found: {db_path}")

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row

    rows = con.execute(
        "SELECT id, path, filename FROM videos WHERE file_hash IS NULL ORDER BY id"
    ).fetchall()

    if not rows:
        print("All videos already have file_hash set. Nothing to do.")
        con.close()
        return

    print(f"Found {len(rows)} video(s) without a hash. {'(dry run)' if args.dry_run else ''}")

    updated = 0
    skipped_missing = 0
    skipped_collision = 0

    for row in rows:
        vid_id = row["id"]
        path = row["path"]
        filename = row["filename"]

        if not Path(path).exists():
            print(f"  [SKIP] id={vid_id} {filename!r} — file not found on disk: {path}")
            skipped_missing += 1
            continue

        try:
            file_hash = compute_hash(path)
        except OSError as exc:
            print(f"  [ERROR] id={vid_id} {filename!r} — could not read file: {exc}")
            skipped_missing += 1
            continue

        # Check for hash collision with an already-processed video
        collision = con.execute(
            "SELECT id, filename FROM videos WHERE file_hash = ? AND id != ?",
            (file_hash, vid_id),
        ).fetchone()
        if collision:
            print(
                f"  [COLLISION] id={vid_id} {filename!r} has the same hash as "
                f"id={collision['id']} {collision['filename']!r} — skipping"
            )
            skipped_collision += 1
            continue

        print(f"  [{'DRY' if args.dry_run else 'OK'}] id={vid_id} {filename!r} → {file_hash[:12]}…")

        if not args.dry_run:
            con.execute(
                "UPDATE videos SET file_hash = ? WHERE id = ?",
                (file_hash, vid_id),
            )
            # Insert into known_file_hashes; ignore if already present (e.g. partial earlier run)
            con.execute(
                """
                INSERT OR IGNORE INTO known_file_hashes (file_hash, video_id)
                VALUES (?, ?)
                """,
                (file_hash, vid_id),
            )
            con.commit()

        updated += 1

    con.close()

    print()
    print(f"Done. Updated: {updated}, skipped (file missing): {skipped_missing}, "
          f"skipped (hash collision): {skipped_collision}")
    if args.dry_run:
        print("Dry run — no changes written.")


if __name__ == "__main__":
    main()
