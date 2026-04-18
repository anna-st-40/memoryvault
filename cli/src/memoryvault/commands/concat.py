"""Concatenate videos using ffmpeg and preserve the youngest source timestamp."""

import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated

import typer

from memoryvault.shared import get_file_creation_time


def find_youngest_video(video_paths: list[Path]) -> tuple[Path, float]:
    """Find the most recently created video in the list."""
    if not video_paths:
        raise ValueError("No videos were provided")

    youngest_path = video_paths[0]
    youngest_time = get_file_creation_time(youngest_path)

    for video_path in video_paths:
        creation_time = get_file_creation_time(video_path)
        if creation_time > youngest_time:
            youngest_time = creation_time
            youngest_path = video_path

    return youngest_path, youngest_time


def concat_videos(video_paths: list[Path], output_path: Path) -> Path:
    """Concatenate videos with ffmpeg concat demuxer and preserve youngest timestamp."""
    if len(video_paths) < 2:
        raise ValueError("Need at least 2 videos to concatenate")

    for video_path in video_paths:
        if not video_path.exists():
            raise FileNotFoundError(f"Input file '{video_path}' does not exist")

    youngest_video, youngest_time = find_youngest_video(video_paths)
    youngest_dt = datetime.fromtimestamp(youngest_time)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as concat_file:
        concat_list_path = concat_file.name
        for video_path in video_paths:
            abs_path = video_path.resolve()
            escaped_path = str(abs_path).replace("'", "'\\''")
            concat_file.write(f"file '{escaped_path}'\n")

    try:
        cmd = [
            "ffmpeg",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_list_path,
            "-c",
            "copy",
            str(output_path),
        ]

        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Error running ffmpeg: {exc}\n{exc.stderr}") from exc

        stat_info = youngest_video.stat()
        atime = stat_info.st_atime
        mtime = stat_info.st_mtime
        os.utime(output_path, (atime, mtime))

        try:
            touch_format = youngest_dt.strftime("%Y%m%d%H%M.%S")
            subprocess.run(["touch", "-mt", touch_format, str(output_path)], check=True)
        except Exception:
            pass

    finally:
        try:
            os.unlink(concat_list_path)
        except Exception:
            pass

    return output_path


def concat_command(
    videos: Annotated[
        list[Path],
        typer.Argument(help="Input video files in concatenation order."),
    ],
    output: Annotated[
        Path,
        typer.Option("--output", "-o", help="Output file path."),
    ],
    overwrite: Annotated[
        bool,
        typer.Option("--overwrite", "-y", help="Overwrite output without prompting."),
    ] = False,
) -> None:
    """Concatenate videos with ffmpeg and preserve the youngest source timestamp."""
    try:
        video_paths = videos

        if output.exists() and not overwrite:
            should_overwrite = typer.confirm(
                f"Output file '{output}' already exists. Overwrite?",
                default=False,
            )
            if not should_overwrite:
                typer.echo("Cancelled.")
                raise typer.Exit(code=0)

        output.parent.mkdir(parents=True, exist_ok=True)

        youngest_video, youngest_time = find_youngest_video(video_paths)
        youngest_dt = datetime.fromtimestamp(youngest_time)

        typer.echo(f"\nConcatenating {len(video_paths)} videos:")
        for i, video_path in enumerate(video_paths, 1):
            creation_time = get_file_creation_time(video_path)
            creation_dt = datetime.fromtimestamp(creation_time)
            marker = " ← youngest" if video_path == youngest_video else ""
            typer.echo(f"  {i}. {video_path.name} (created: {creation_dt}){marker}")

        concat_videos(video_paths, output)
        typer.echo("\nConcatenation successful!")
        typer.echo(f"Created: {output}\n")

    except (FileNotFoundError, ValueError, RuntimeError) as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1) from e
