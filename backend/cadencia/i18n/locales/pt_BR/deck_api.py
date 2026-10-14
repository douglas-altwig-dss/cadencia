"""Rotas da Apresentação (api/routes_reports.py, api/routes_deck.py) e perguntas da plateia
(report/qanda.py): corpos 400/404/409/413/503."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "too_large.message": "Limite de {mb} MB.",
    "template_too_large.cause": "modelo grande demais",
    "image_too_large.cause": "imagem grande demais",
    "template_not_found.cause": "modelo não encontrado",
    "template_not_found.message": "Modelo {template_id}.",
    "template_file_not_found.cause": "arquivo do modelo não encontrado",
    "template_file_gone.cause": "o arquivo do modelo não está mais no disco",
    "template_image_not_found.cause": "imagem não encontrada no modelo",
    "format_invalid.cause": "formato inválido",
    "format_invalid.message": "Envie um arquivo .pptx.",
    "variable_invalid.cause": "variável inválida",
    "variable_invalid.action": "Use um nome em minúsculas, sem espaços (ex.: definicao_do_espaco).",
    "variable_not_found.cause": "variável não encontrada",
    "value_invalid.cause": "valor inválido",
    "value_not_found.cause": "valor não encontrado",
    "slide_not_found.cause": "slide não encontrado",
    "slide_not_found.message": "Slide {slide_id} do modelo {template_id}.",
    "unknown_areas.cause": "áreas inexistentes no modelo",
    "clone_without_mapping": "O modelo de origem não tem mapeamento salvo.",
    "area_lost_after_remap.cause": "área não encontrada após o remapeamento",
    "font_unavailable.cause": "fonte não disponível",
    "run_not_found.cause": "geração não encontrada",
    "run_file_not_found.cause": "arquivo da geração não encontrado",
    "deck_not_found.cause": "apresentação não encontrada",
    "deck_not_found.message": "Geração {run_id}.",
    "edits_conflict.cause": "as edições mudaram enquanto você editava",
    "edits_conflict.action": "Recarregue o editor para pegar a versão atual antes de salvar.",
    "image_not_found.cause": "imagem não encontrada",
    "slide_image_not_found.cause": "imagem não encontrada no slide",
    "version_not_found.cause": "versão não encontrada",
    "version_not_found.message": "Versão {version_id}.",
    "version_name_missing.cause": "nome ausente",
    "version_name_missing.message": "Dê um nome à versão.",
    "comment_not_found.cause": "comentário não encontrado",
    "nothing_to_regenerate.cause": "nada a regerar",
    "nothing_to_regenerate.message": "Escolha slides ou boards.",
    "share_not_found.cause": "link não encontrado",
    "share_unavailable.cause": "link inexistente, expirado ou revogado",
    "anonymous": "Alguém sem nome",
    "board_without_data.cause": "board sem dados",
    "ai_unavailable.cause": "sugestão por IA indisponível",
    "ai_unavailable.action": "Escreva o texto à mão, ou peça a quem administra para ligar "
    "CADENCIA_AI_ENABLED.",
    "question_empty": "A pergunta está vazia.",
    "question_not_found": "Pergunta não encontrada.",
}
