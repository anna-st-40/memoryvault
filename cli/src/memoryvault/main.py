from __future__ import annotations

import typer

from cli.src.memoryvault.commands.remux import remux_command
from cli.src.memoryvault.commands.concat import concat_command

app = typer.Typer(help="MemoryVault command-line tools.", add_completion=False)

app.command("remux")(remux_command)
app.command("concat")(concat_command)
