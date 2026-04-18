"""Transcribe a video file with Whisper and output the full JSON result."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Annotated, Any

import typer


def transcribe_video(
	video_path: Path,
	model_name: str = "turbo",
	language: str = "en",
	compression_ratio_threshold: float = 2.0,
) -> dict[str, Any]:
	"""Transcribe a video with Whisper and return the raw result dictionary."""
	try:
		import whisper
	except ImportError as exc:
		raise RuntimeError(
			"Whisper is not installed. Install dependencies with: pip install -e ."
		) from exc

	typer.echo(f"Loading Whisper model '{model_name}'...", err=True)
	model = whisper.load_model(model_name)

	typer.echo(f"Transcribing {video_path}...", err=True)
	return model.transcribe(
		str(video_path),
		verbose=True,
		language=language,
		compression_ratio_threshold=compression_ratio_threshold,
	)


def transcribe_command(
	video_path: Annotated[
		Path,
		typer.Argument(help="Path to the input video file."),
	],
	model: Annotated[
		str,
		typer.Option("--model", "-m", help="Whisper model to use (for example: turbo, base, small)."),
	] = "turbo",
	language: Annotated[
		str,
		typer.Option("--language", "-l", help="Language code for transcription."),
	] = "en",
	output: Annotated[
		str | None,
		typer.Option(
			"--output",
			"-o",
			metavar="PATH",
			help="Write output to PATH instead of stdout.",
		),
	] = None,
	overwrite: Annotated[
		bool,
		typer.Option("--overwrite", "-y", help="Overwrite the output file if it already exists."),
	] = False,
) -> None:
	"""Transcribe a single video file. Writes JSON to stdout by default."""
	try:
		if not video_path.exists() or not video_path.is_file():
			raise FileNotFoundError(f"Input file '{video_path}' does not exist")

		output_to_stdout = output is None or output == "-"
		output_path = Path(output) if output and output != "-" else None

		if output_path is not None and output_path.exists() and not overwrite:
			should_overwrite = typer.confirm(
				f"Output file '{output_path}' already exists. Overwrite?",
				default=False,
			)
			if not should_overwrite:
				typer.echo("Cancelled.")
				raise typer.Exit(code=0)

		result = transcribe_video(video_path=video_path, model_name=model, language=language)

		if output_to_stdout:
			json.dump(result, sys.stdout, indent=2)
			sys.stdout.write("\n")

		if output_path is not None:
			output_path.parent.mkdir(parents=True, exist_ok=True)
			with output_path.open("w", encoding="utf-8") as handle:
				json.dump(result, handle, indent=2)
			typer.echo(f"Saved transcription to: {output_path}", err=True)

		typer.echo(f"Transcript length: {len(result.get('text', ''))} characters", err=True)
		typer.echo(f"Segments: {len(result.get('segments', []))}", err=True)

	except (FileNotFoundError, RuntimeError) as exc:
		typer.echo(f"Error: {exc}", err=True)
		raise typer.Exit(code=1) from exc
