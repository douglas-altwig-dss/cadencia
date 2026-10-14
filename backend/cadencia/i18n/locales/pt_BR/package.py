"""Conferência do .pptx como pacote OOXML (RF-50, report/core/package_check.py)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "zip_backslash": "Entrada do pacote com barra invertida: {name!r}",
    "zip_path": "Caminho de entrada inválido: {name!r}",
    "zip_duplicada": "Entrada duplicada no pacote: {name!r}",
    "sem_content_types": "O pacote não tem [Content_Types].xml.",
    "content_types_ilegivel": "[Content_Types].xml não pôde ser lido: {error}",
    "sem_content_type": (
        "A parte {part} não tem tipo de conteúdo (nem Override nem Default para .{extension})."
    ),
    "override_orfao": "[Content_Types].xml declara {part}, que não existe no pacote.",
    "rels_ilegivel": "{part} não é XML válido: {error}",
    "rid_duplicado": "{part}: Id {rid} declarado duas vezes.",
    "rel_quebrado": "{part}: {rid} aponta para {target}, que não existe no pacote.",
    "parte_sem_relacionamento": "A parte {part} não é alcançável por nenhuma relação.",
    "xml_malformado": "{part} não é XML bem formado: {error}",
    "rid_pendente": "{part}: <{element}> usa {rid}, ausente de {rels}.",
    "sem_presentation": "O pacote não tem ppt/presentation.xml.",
    "sldid_duplicado": "presentation.xml lista o slide id {id} duas vezes.",
    "sldid_invalido": "O slide id {id} está fora da faixa permitida (256–2147483647).",
    "sldid_sem_rel": "presentation.xml referencia {rid}, ausente do .rels.",
    "slide_ausente": "A lista de slides aponta para {part}, que não existe.",
    "slide_fora_da_lista": "{part} existe no pacote mas não está em sldIdLst.",
    "ordem_de_esquema": "{part}: <{element}> tem filhos fora da ordem exigida pelo esquema: {children}",
    "id_de_forma_duplicado": "{part}: duas formas usam o id {id} (deve ser único no slide).",
    "id_de_forma_invalido": "{part}: forma com id {id!r}.",
    "txbody_sem_bodypr": "{part}: corpo de texto sem <a:bodyPr>.",
    "txbody_vazio": "{part}: corpo de texto sem nenhum parágrafo.",
    "run_sem_texto": "{part}: <a:r> sem <a:t>.",
    "tabela_sem_linhas": "{part}: tabela sem nenhuma linha.",
    "linha_sem_altura": "{part}: linha {row} sem o atributo 'h'.",
    "tabela_inconsistente": "{part}: linha {row} cobre {span} colunas, mas a grade tem {columns}.",
    "id_de_extensao_duplicado": "{part}: tabela {table} repete o id de {what} {id} em {count} lugares.",
    "identity.row": "linha de tabela",
    "identity.column": "coluna de tabela",
    "caractere_ilegal": "{part}: caractere {char} não é permitido em XML 1.0.",
    "zip_corrompido": "Entrada corrompida no pacote: {name}",
    "zip_invalido": "O arquivo não é um pacote ZIP válido: {error}",
    "io": "Não foi possível ler o arquivo: {error}",
}
