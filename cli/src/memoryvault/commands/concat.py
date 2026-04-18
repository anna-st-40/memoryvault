"""Concatenate videos using ffmpeg and preserve the youngest source timestamp."""

import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Annotated

import typer

from cli.src.memoryvault.shared import get_file_creation_time

def find_youngest_video(video_paths: list[Path]) -> tuple[Path, float]:
    """
    Find the video with the most recent (youngest) creation date.
    
    Args:
        video_paths: List of Path objects to video files
    
    Returns:
        Tuple of (youngest_path, youngest_timestamp)
    """
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
    """
    Concatenate multiple video files using ffmpeg concat demuxer.
    Sets the output file's creation date to match the youngest input video.
    
    Args:
        video_paths: List of Path objects to input video files
        output_path: Path object for the output file
    
    Returns:
        Path to the output file
    """
    if len(video_paths) < 2:
        raise ValueError("Need at least 2 videos to concatenate")
    
    # Verify all input files exist
    for video_path in video_paths:
        if not video_path.exists():
            raise FileNotFoundError(f"Input file '{video_path}' does not exist")
    
    # Find the youngest video
    youngest_video, youngest_time = find_youngest_video(video_paths)
    youngest_dt = datetime.fromtimestamp(youngest_time)
    
    typer.echo(f"\nConcatenating {len(video_paths)} videos:")
    for i, video_path in enumerate(video_paths, 1):
        creation_time = get_file_creation_time(video_path)
        creation_dt = datetime.fromtimestamp(creation_time)
        marker = " ← youngest" if video_path == youngest_video else ""
        typer.echo(f"  {i}. {video_path.name} (created: {creation_dt}){marker}")

    # Create a temporary concat list file
    # Format: file '/path/to/file1.mp4'
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as concat_file:
        concat_list_path = concat_file.name
        for video_path in video_paths:
            # Use absolute paths and escape single quotes
            abs_path = video_path.resolve()
            escaped_path = str(abs_path).replace("'", "'\\''")
            concat_file.write(f"file '{escaped_path}'\n")
    
    try:
        # Run ffmpeg with concat demuxer
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_list_path,
            '-c', 'copy',  # Copy codec (no re-encoding)
            str(output_path)
        ]
        
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            typer.echo("\nConcatenation successful!")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Error running ffmpeg: {e}\n{e.stderr}") from e
        
        # Set the output file's timestamps to match the youngest video
        stat_info = youngest_video.stat()
        atime = stat_info.st_atime
        mtime = stat_info.st_mtime
        
        # Set modification and access times
        os.utime(output_path, (atime, mtime))
        
        # On macOS, try to set the creation date using touch -t
        try:
            # Format: [[CC]YY]MMDDhhmm[.ss]
            touch_format = youngest_dt.strftime('%Y%m%d%H%M.%S')
            subprocess.run(['touch', '-mt', touch_format, str(output_path)], check=True)
            typer.echo(f"Set creation date to: {youngest_dt}")
        except Exception as e:
            typer.echo(f"Warning: Could not set creation date: {e}", err=True)
        
        typer.echo(f"Created: {output_path}\n")
        
    finally:
        # Clean up temporary concat list file
        try:
            os.unlink(concat_list_path)
        except Exception as e:
            typer.echo(
                f"Warning: Could not delete temporary file {concat_list_path}: {e}",
                err=True,
            )
    
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
        concat_videos(video_paths, output)

    except (FileNotFoundError, ValueError, RuntimeError) as e:
        typer.echo(f"Error: {e}", err=True)
        raise typer.Exit(code=1) from e
