from __future__ import annotations

import typer

from memoryvault.commands.remux import remux_command
from memoryvault.commands.concat import concat_command
from memoryvault.commands.transcribe import transcribe_command
from memoryvault.commands.thumbnail import thumbnail_command

app = typer.Typer(help="MemoryVault command-line tools.", add_completion=False)

app.command("remux")(remux_command)
app.command("concat")(concat_command)
app.command("transcribe")(transcribe_command)
app.command("thumbnail")(thumbnail_command)
