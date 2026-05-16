#!/usr/bin/env python3
"""Backfill file_hash for existing Video rows and populate known_file_hashes.

Run this once after deploying the duplicate-detection feature to cover videos
that were processed before hashing was added.

Usage (host, outside Docker):
    python3 scripts/backfill_hashes.py \
        --db ./database/app.db \
        --media-dir /path/to/your/media

    --media-dir is the host path that maps to the container's /data mount.
    Example: if compose.yml has "${MEDIA_DIR}:/data", pass the value of MEDIA_DIR.
    Paths stored in the DB look like /data/raw/... — the script rewrites them to
    <media-dir>/raw/... before opening the file.

Usage (inside the running container):
    docker compose exec worker python3 /app/scripts/backfill_hashes.py \
        --db /app/database/app.db

The script is idempotent: it skips videos that already have file_hash set.
"""

import argparse
import hashlib
import sqlite3
import sys
from pathlib import Path

CONTAINER_BASE = "/data"


def resolve_path(db_path: str, media_dir: str | None) -> str:
    """Rewrite a container-internal path to its host equivalent if needed."""
    if media_dir is None:
        return db_path
    p = Path(db_path)
    try:
        relative = p.relative_to(CONTAINER_BASE)
    except ValueError:
        # Path doesn't start with /data — use as-is (already a host path or unknown prefix)
        return db_path
    return str(Path(media_dir) / relative)


def compute_hash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--db",
        default="./database/app.db",
        help="Path to the SQLite database file (default: ./database/app.db)",
    )
    parser.add_argument(
        "--media-dir",
        default=None,
        metavar="PATH",
        help=(
            "Host path that corresponds to /data inside the container "
            "(i.e. the value of MEDIA_DIR in your .env). "
            "Omit when running inside the container."
        ),
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
    if args.media_dir:
        print(f"Remapping {CONTAINER_BASE!r} → {args.media_dir!r}")

    updated = 0
    skipped_missing = 0
    skipped_collision = 0

    for row in rows:
        vid_id = row["id"]
        db_stored_path = row["path"]
        filename = row["filename"]

        host_path = resolve_path(db_stored_path, args.media_dir)

        if not Path(host_path).exists():
            print(f"  [SKIP] id={vid_id} {filename!r} — file not found: {host_path}")
            skipped_missing += 1
            continue

        try:
            file_hash = compute_hash(host_path)
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
                "INSERT OR IGNORE INTO known_file_hashes (file_hash, video_id) VALUES (?, ?)",
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
