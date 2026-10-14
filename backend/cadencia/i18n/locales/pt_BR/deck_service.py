"""Textos do serviço de apresentações (report/service.py): erros, bloqueio de download, resumo de
acessibilidade, conflitos de variáveis, comparação de gerações e links compartilhados."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "writable.typed": (
        "{name} lê de {source}, que é do tipo “{kind}”. "
        "Variáveis desse tipo vêm inteiras da fonte e não recebem valor escrito à mão."
    ),
    "source.is_variable": (
        "{key} é outra variável. Ligue a variável a um campo de dados, não a outra variável."
    ),
    "source.unknown": "{key} não existe no catálogo de campos.",
    "upload.not_zip": "Arquivo não é um .pptx válido: não é um pacote zip.",
    "upload.too_big": (
        "O .pptx descompactado passa de {mb} MB; confira se o arquivo é mesmo o modelo da apresentação."
    ),
    "upload.not_pptx": "Arquivo não é um .pptx válido: {error}",
    "asset.not_image": (
        "O arquivo não é uma imagem que a apresentação aceite (PNG, JPEG, GIF, BMP, TIFF ou WMF)."
    ),
    "previews.file_missing": "O arquivo do modelo não está mais no disco.",
    "previews.nothing": "Nada foi renderizado.",
    "slide.not_found": "Slide {slide} do modelo {template}.",
    "template.not_found": "Modelo não encontrado.",
    "template.not_found_id": "Modelo {template}.",
    "template.file_missing": "O arquivo do modelo {template} não está mais no disco.",
    "run.file_missing": "O arquivo da geração {run} não está mais no disco.",
    "run.has_template": "Esta geração já tem um modelo; só uma órfã pode ser reassociada.",
    "version.before_restore": "antes de restaurar a versão {version}",
    "audience.unknown": "Público desconhecido neste modelo: {audience}.",
    "no_mapping": lambda: "Modelo sem mapeamento salvo: só os marcadores {{…}} foram preenchidos.",
    "a11y_summary.sem_texto_alternativo": "{n} imagem(ns) ou gráfico(s) sem texto alternativo.",
    "a11y_summary.contraste_baixo": "{n} texto(s) com contraste abaixo do mínimo de leitura.",
    "a11y_summary.ordem_de_leitura": "{n} slide(s) com o título fora da ordem de leitura.",
    "review.unknown_action": "Ação desconhecida: {action}.",
    "review.only_delivery": "Só uma apresentação de entrega passa por revisão, não uma prévia ou parcial.",
    "review.wrong_state": "Não é possível {action} uma apresentação em “{state}”.",
    "review.not_valid": "A apresentação foi reprovada na validação; corrija os erros antes de aprovar.",
    "review.open_comments": "Há {count} comentário(s) em aberto no modelo; resolva-os antes de aprovar.",
    "review.note_required": "Diga o que precisa mudar ao reprovar.",
    "blocker.invalid.cause": "apresentação reprovada na validação",
    "blocker.invalid.action": "Corrija os erros listados ou baixe mesmo assim com ?force=true.",
    "blocker.unapproved.cause": "apresentação ainda não aprovada",
    "blocker.unapproved.action": "Envie para revisão e aprove, ou baixe mesmo assim com ?force=true.",
    "pdf.failed": "Não foi possível gerar o PDF.",
    "compare.chart": "gráfico {name}: {values}",
    "compare.colors": "cores: {fills}",
    "share.only_delivery": "Só uma apresentação de entrega pode ser compartilhada.",
    "share.days": "O link vale de 1 a 90 dias.",
    "share.not_found": "Link inexistente, expirado ou revogado.",
    "audit.hide_when_empty": "ocultar quando vazio",
    "conflict.shadowed": lambda name, count, template_wins: (
        f"A variável {name} está registrada {count} vezes. "
        + ("A do modelo é a que vale." if template_wins else "A compartilhada é a que vale.")
    ),
    "conflict.field": "{key} é também um campo do catálogo; renomeie a variável.",
    "migration.name_taken": lambda name, source: (
        f"já existe uma variável chamada {name}"
        + (f", ligada a {source}" if source else "")
        + "; renomeie uma das duas antes de converter."
    ),
    "migration.conflicts": "há conflitos de nome; resolva-os antes de converter",
    "migration.description": "Convertida do campo {field} (RF-59).",
    "find.required": "informe o texto a procurar",
}
