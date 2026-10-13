"""Snapshot a real generated deck, for the stage 0–8 refactor.

`tests/test_golden.py` pins the sample template against demo data and runs in CI. It cannot pin
the *corporate* template: that is a large binary built by `build_dss_template.py` from a file the
test suite has no business depending on. This does the same job from the outside — generate from a
real database and write the same digest — so every stage can also be checked against the deck that
actually goes to a meeting.

    .venv/bin/python tools/golden_snapshot.py --template 2 --out /tmp/before.json
    ...make the change...
    .venv/bin/python tools/golden_snapshot.py --template 2 --out /tmp/after.json
    diff -u /tmp/before.json /tmp/after.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from cadencia.config import get_settings
from cadencia.report.service import generate_report
from cadencia.runtime import default_sessions
from cadencia.store.db import session_scope

# `tests/` is not a package on the install path, and the digest belongs beside the tests that own
# it rather than duplicated here.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))
from golden import run_digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template", type=int, required=True, help="id do modelo a gerar")
    parser.add_argument("--out", type=Path, help="arquivo a escrever; sem ele, imprime")
    parser.add_argument(
        "--now",
        default="2026-09-10T18:00:00+00:00",
        help="instante fixo, para que duas execuções sejam comparáveis",
    )
    args = parser.parse_args()

    now = datetime.fromisoformat(args.now).astimezone(UTC)
    settings = get_settings()
    with session_scope(default_sessions()) as session:
        run = generate_report(session, settings, args.template, render=False, now=now)
        digest = run_digest(run.validation["produced"], run.validation, run.path)
    rendered = json.dumps(digest, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    if args.out:
        args.out.write_text(rendered, encoding="utf-8")
        deck = digest["deck"]
        print(f"{args.out}: {deck['slide_count']} slides, ok={digest['validation']['ok']}")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
