"""Validação das configurações do board (BoardProfile.check, RF-05). Textos de antes (R8)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "invalid": lambda problems: "; ".join(problems),
    "problem": "{key}: {problem}",
    "integer": "precisa ser um número inteiro",
    "number": "precisa ser um número",
    "between": "precisa estar entre {low} e {high}",
    "timezone": "fuso horário desconhecido: {value}",
    "names": "precisa ser uma lista de textos",
    "dates": "precisa ser uma lista de datas AAAA-MM-DD",
    "date": "data inválida: {value} (use AAAA-MM-DD)",
    "affinity": "precisa mapear cada pessoa a uma lista de textos",
}
