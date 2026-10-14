"""The command line (cli.py): help texts and the few messages it prints itself. JSON keys stay."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "description": "Cadência — delivery tracking on Jira",  # i18n: out of scope (product name)
    "no_space": "No space",
    "error.sprint_not_collected": "sprint {sprint} not collected",
    "error.template_not_found": "template {template} not found",
    "error.demo_not_empty": "the database already has boards; use --force to mix demo data into it "
    "or point CADENCIA_DATABASE_URL at another database",
    "help.db_upgrade": "applies the database migrations",
    "help.test_connection": "tests the Jira credential",
    "help.discover": "M0: the instance's boards, custom fields and statuses",
    "help.boards": "lists discovered boards and marks the tracked ones",
    "help.boards.q": "filter by board or space name",
    "help.boards.select": "ids to track (replaces the selection)",
    "help.spaces": "lists the spaces (teams) with each one's boards",
    "help.spaces.selected": "tracked boards only",
    "help.check_deck": "validates a .pptx as an OOXML package; exits with an error if invalid",
    "help.check_deck.file": ".pptx files to validate",
    "help.check_variables": "lists variables used in templates without a registration or a value; "
    "exits with an error if there are any",
    "help.template_filter": "restricts to one template",
    "help.migrate_bindings": "shows what converting old bindings (field:) into variables would do; "
    "writes nothing",
    "help.migrate_bindings.apply": "writes: registers the variables and rebinds",
    "help.migrate_palette": "shows templates whose palette is only a copy of the shared one; "
    "--apply makes them inherit it",
    "help.migrate_palette.apply": "writes: removes the redundant copies",
    "help.collect": "collects the selected boards",
    "help.collect.full": "full reconciliation",
    "help.collect.board": "restricts to one board (repeatable)",
    "help.checkpoint": "writes/re-runs checkpoint snapshots",
    "help.checkpoint.at": "ISO instant of a specific checkpoint",
    "help.checkpoint.force": "rewrites existing snapshots",
    "help.summary": "M1: a sprint summary as JSON",
    "help.manifest": "M0: manifest of a .pptx's replaceable areas",
    "help.template_add": "registers a .pptx template",
    "help.mapping": "a template's mapping",
    "help.mapping.file": "mapping JSON (for set)",
    "help.deck": "generates the presentation",
    "help.deck.reference": "reference instant (default: last checkpoint)",
    "help.deck.no_render": "does not render previews with LibreOffice",
    "help.serve": "starts the API",
    "help.scheduler": "scheduled collector service",
    "help.demo": "fills the database with the fictional demo instance",
    "help.demo.force": "accepts a database that already has boards",
}
