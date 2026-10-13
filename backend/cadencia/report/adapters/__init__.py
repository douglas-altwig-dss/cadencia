"""Concrete data sources behind `report.ports.DeckSource`.

One adapter per system the deck can be filled from. They are the only place that knows both the
engine's vocabulary and somebody else's — which is exactly why they live outside `core/`.
"""
