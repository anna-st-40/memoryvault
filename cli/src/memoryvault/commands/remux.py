"""Remux MTS files to MP4 while preserving timestamps."""

from __future__ import annotations

import os
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Annotated

import typer

from memoryvault.shared import get_file_creation_time


def remux_mts_to_mp4(input_path: Path, output_dir: Path | None = None) -> Path:
    """Remux a single MTS file to MP4 using ffmpeg."""
    if not input_path.exists():
        raise FileNotFoundError(f"Input file '{input_path}' does not exist")

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file = output_dir / input_path.with_suffix(".mp4").name
    else:
        output_file = input_path.with_suffix(".mp4")

    stat_info = input_path.stat()
    mtime = stat_info.st_mtime
    atime = stat_info.st_atime

    birthtime = get_file_creation_time(input_path)
    birthtime_dt = datetime.fromtimestamp(birthtime)

    typer.echo(f"Input: {input_path}")
    typer.echo(f"Output: {output_file}")
    typer.echo(f"Original creation time: {birthtime_dt}")

    cmd = [
        "ffmpeg",
        "-i",
        str(input_path),
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        str(output_file),
    ]

    typer.echo(f"\nRunning: {' '.join(cmd)}")

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Error running ffmpeg: {exc}\n{exc.stderr}") from exc

    os.utime(output_file, (atime, mtime))

    try:
        touch_format = birthtime_dt.strftime("%Y%m%d%H%M.%S")
        subprocess.run(["touch", "-mt", touch_format, str(output_file)], check=True)
        typer.echo(f"Restored modification time: {birthtime_dt}")
    except Exception as exc:
        typer.echo(f"Warning: Could not set creation date: {exc}", err=True)

    return output_file


def process_mts_directory(input_dir: Path, output_dir: Path | None = None) -> list[Path]:
    """Process every MTS file in a directory and return created outputs."""
    resolved_input = input_dir.resolve()

    typer.echo(f"Checking directory: {resolved_input}")
    typer.echo("Searching for MTS files...")

    all_items = os.listdir(resolved_input)
    mts_files = [resolved_input / item for item in all_items if item.upper().endswith(".MTS")]

    if not mts_files:
        typer.echo("No MTS files found")
        return []

    typer.echo(f"Found {len(mts_files)} MTS file(s) in '{input_dir}'")
    typer.echo("=" * 60)

    output_files: list[Path] = []
    successful = 0
    failed = 0

    for index, mts_file in enumerate(mts_files, 1):
        typer.echo(f"\n[{index}/{len(mts_files)}] Processing: {mts_file.name}")
        typer.echo("-" * 60)
        try:
            output_files.append(remux_mts_to_mp4(mts_file, output_dir))
            typer.echo("\nConversion successful!")
            successful += 1
        except Exception as exc:  # noqa: BLE001 - preserve best-effort directory processing.
            typer.echo(f"Failed to process {mts_file.name}: {exc}", err=True)
            failed += 1

    typer.echo("\n" + "=" * 60)
    typer.echo(f"Summary: {successful} successful, {failed} failed")
    return output_files


def remux_command(
    input_path: Annotated[
        Path,
        typer.Argument(help="Input .MTS file or directory."),
    ],
    output_dir: Annotated[
        Path | None,
        typer.Argument(help="Optional output directory."),
    ] = None,
) -> None:
    """Remux MTS files to MP4."""
    try:
        if input_path.is_dir():
            process_mts_directory(input_path, output_dir)
        elif input_path.is_file():
            if input_path.suffix.upper() != ".MTS":
                typer.echo("Warning: Input file does not have .MTS extension", err=True)

            output_path = remux_mts_to_mp4(input_path, output_dir)
            typer.echo("\nConversion successful!")
            typer.echo(f"\nCreated: {output_path}")
        else:
            raise FileNotFoundError(f"'{input_path}' is not a valid file or directory")
    except (FileNotFoundError, NotADirectoryError, PermissionError, RuntimeError) as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
