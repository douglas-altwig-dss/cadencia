"""The deck engine: everything that turns a template plus data into a .pptx.

Pure by construction — nothing in here imports the store, the analytics layer, the domain modules,
Jira or the app's settings. It works on the plain structures in `context.py` (`DeckData`,
`BoardDeck`) and on files, which is what lets it be lifted into another project by copying this
directory and `../ports.py`. `tests/test_boundaries.py` enforces that, so the rule cannot rot.
"""
