"""Problemas da geração, da validação, das edições manuais, da prévia e da sugestão de mapeamento.

Cópias literais dos textos de antes (R8): o texto guardado em ``report_run.validation`` é este.
"""

from __future__ import annotations

from cadencia.i18n.render import Entry


def _in_template(template: str) -> str:
    return f" no modelo “{template}”" if template else ""


MESSAGES: dict[str, Entry] = {
    # report/core/generate.py
    "repeat.out_of_scope": "Nenhum board alcança o escopo deste bloco: slides repetíveis removidos.",
    "repeat.no_board": "Nenhum board na geração: slides repetíveis removidos.",
    "board_without_data": "Slide {slide}: o board {board} não tem dados nesta geração.",
    "variable_unregistered": lambda slide, marker, template: (
        f"Slide {slide}: a variável {marker}{_in_template(template)} não está registrada. "
        "Registre-a no gerenciador de variáveis antes de usá-la no modelo."
    ),
    "unknown_field": "Slide {slide}: o campo {field} não existe no catálogo.",
    "variable_unfilled": lambda slide, marker, template, target: (
        f"Slide {slide}: a variável {marker}{_in_template(template)} não tem valor para "
        f"“{target or 'o relatório'}” e o registro não define um padrão."
    ),
    "unknown_modifier": "Slide {slide}: {marker} usa um modificador desconhecido; use {modifiers}.",
    "marker_empty": "Marcador {marker} ficou vazio.",
    "no_rows": "Slide {slide}: {field} não tem linhas.",
    "truncated": "Slide {slide}: {count} linha(s) não couberam e foram omitidas.",
    "missing_area": "Slide {slide}: a área {target} não existe no modelo.",
    "not_text": "Slide {slide}: {target} não aceita texto.",
    "empty": lambda slide, field: f"Slide {slide}: {field or 'valor'} ficou vazio.",
    # report/core/validate.py
    "table_overflow": "Slide {slide}: a tabela “{area}” ultrapassa o fim do slide.",
    "text_exceeds_area": "Slide {slide}: o texto de “{area}” excede a área prevista.",
    "text_does_not_fit": "Slide {slide}: o texto de “{area}” não cabe na caixa.",
    "libreoffice_missing": "LibreOffice não instalado: conferência visual automática indisponível.",
    "libreoffice_failed": "Falha ao renderizar com LibreOffice: {error}",
    "template_changed": "O modelo mudou desde que o mapeamento foi salvo; confira as áreas.",
    "area_missing_in_template": "A área {target} não existe na versão atual do modelo.",
    "leftover_marker": "Slide {slide}: marcador {marker} não foi substituído.",
    # report/core/edits.py
    "edit.table_gone": "A tabela {table} não existe mais neste slide.",
    "edit.cell_outside": "A célula {row},{column} saiu da tabela {table}.",
    "edit.group_gone": "O grupo {group} não existe mais neste slide.",
    "edit.shape_gone": "A forma {shape} não existe mais neste slide; a edição foi ignorada.",
    "edit.image_gone": "A imagem da forma {shape} não está mais disponível.",
    "edit.duplicate_orphaned": "O slide duplicado {slide} perdeu a origem; não foi recriado.",
    # report/core/resolve_preview.py
    "preview.fixed_board_unset": "Este slide é de um board fixo, mas nenhum board foi escolhido.",
    "preview.no_board_data": "Sem dados do board: a prévia mostra apenas o modelo.",
    "preview.variable_unregistered": lambda marker, template: (
        f"A variável {marker} não está registrada{_in_template(template)}. "
        "Registre-a no gerenciador de variáveis antes de usá-la."
    ),
    "preview.variable_unfilled": (
        "A variável {marker} não tem valor para “{target}” e o registro não define um padrão."
    ),
    "preview.unknown_field": "O campo {field} não existe no catálogo.",
    "preview.empty": lambda field: f"{field or 'Texto fixo'} está vazio agora.",
    # report/core/suggest.py
    "suggest.continuation": (
        "Slide {slide} parece continuação do anterior: marcado para remoção "
        "(a paginação recria as continuações)."
    ),
    "suggest.choose_board": lambda slide, headline: (
        f"Slide {slide} ({headline or 'sem título'}): escolha o board."
    ),
}
