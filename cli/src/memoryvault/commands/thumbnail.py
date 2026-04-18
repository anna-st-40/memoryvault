"""Generate a JPEG thumbnail from a video file."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Annotated

import typer


def _default_output_path(video_path: Path) -> Path:
    """Build the default thumbnail output path next to the input video."""
    return video_path.with_suffix(".jpg")


def generate_thumbnail(
    video_path: Path,
    output_path: Path,
    timestamp_sec: float = 2.5,
    quality: int = 2,
    overwrite: bool = False,
) -> Path:
    """Extract a frame with ffmpeg and save it as a JPEG thumbnail."""
    if not video_path.exists() or not video_path.is_file():
        raise FileNotFoundError(f"Input file '{video_path}' does not exist")

    if timestamp_sec < 0:
        raise ValueError("Timestamp must be >= 0")

    if quality < 2 or quality > 31:
        raise ValueError("Quality must be between 2 (best) and 31 (worst)")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    ffmpeg_overwrite_flag = "-y" if overwrite else "-n"

    cmd = [
        "ffmpeg",
        ffmpeg_overwrite_flag,
        "-ss",
        str(timestamp_sec),
        "-i",
        str(video_path),
        "-vframes",
        "1",
        "-vf",
        "scale=trunc(iw*sar/2)*2:ih,setsar=1,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2",
        "-q:v",
        str(quality),
        str(output_path),
    ]

    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg was not found. Install ffmpeg and try again.") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip()
        raise RuntimeError(f"Error running ffmpeg: {stderr}") from exc

    return output_path


def thumbnail_command(
    video_path: Annotated[
        Path,
        typer.Argument(help="Input video file path."),
    ],
    output: Annotated[
        Path | None,
        typer.Option(
            "--output",
            "-o",
            help="Output JPEG path. Defaults to the input filename with .jpg extension.",
        ),
    ] = None,
    timestamp: Annotated[
        float,
        typer.Option(
            "--timestamp",
            "-t",
            help="Frame timestamp in seconds.",
        ),
    ] = 2.5,
    quality: Annotated[
        int,
        typer.Option(
            "--quality",
            "-q",
            help="JPEG quality from 2 (best) to 31 (worst).",
        ),
    ] = 2,
    overwrite: Annotated[
        bool,
        typer.Option("--overwrite", "-y", help="Overwrite output without prompting."),
    ] = False,
) -> None:
    """Generate a thumbnail image from a single video file."""
    try:
        output_path = output if output is not None else _default_output_path(video_path)

        if output_path.exists() and not overwrite:
            should_overwrite = typer.confirm(
                f"Output file '{output_path}' already exists. Overwrite?",
                default=False,
            )
            if not should_overwrite:
                typer.echo("Cancelled.")
                raise typer.Exit(code=0)

        created = generate_thumbnail(
            video_path=video_path,
            output_path=output_path,
            timestamp_sec=timestamp,
            quality=quality,
            overwrite=overwrite,
        )

        typer.echo(f"Thumbnail created: {created}")

    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        typer.echo(f"Error: {exc}", err=True)
        raise typer.Exit(code=1) from exc
