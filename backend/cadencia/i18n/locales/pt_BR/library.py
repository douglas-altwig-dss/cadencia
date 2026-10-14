"""Biblioteca da Apresentação (report/library.py): blocos, imagens, histórico de slides,
diagnóstico do modelo e dicas de uso."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "block.name_required": "O bloco precisa de um nome.",
    "block.no_shapes": "Um bloco guarda formas inseridas no editor; selecione ao menos uma.",
    "block.not_found": "Bloco não encontrado.",
    "image.not_found": "Imagem não encontrada.",
    "version.not_found": "Versão não encontrada.",
    "version.before_restoring_slide": "antes de restaurar o slide {key}",
    "diagnostics.fonts": "{count} fonte(s) sem equivalente métrico: o texto pode quebrar diferente "
    "no editor.",
    "diagnostics.orphan_markers": "{count} marcador(es) {{…}} que nenhum campo ou variável responde.",
    "diagnostics.unbound_areas": "{count} área(s) de texto, tabela ou gráfico sem vínculo.",
    "diagnostics.unnamed_slides": "{count} slide(s) sem nome nem título.",
    "diagnostics.silent_images": "{count} imagem(ns) do modelo sem texto alternativo.",
    "usage.often_empty": "“{name}” saiu vazio em {count} de {runs} gerações: vale remover?",
    "usage.skipped": "“{name}” fica menos de 3 s na tela ao apresentar: é pulado.",
}
