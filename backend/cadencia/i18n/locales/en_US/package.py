"""The .pptx checked as an OOXML package (RF-50, report/core/package_check.py). Technical by
nature: part names, element names and ids are kept as they are in the file."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "zip_backslash": "Package entry with a backslash: {name!r}",
    "zip_path": "Invalid entry path: {name!r}",
    "zip_duplicada": "Duplicate entry in the package: {name!r}",
    "sem_content_types": "The package has no [Content_Types].xml.",
    "content_types_ilegivel": "[Content_Types].xml could not be read: {error}",
    "sem_content_type": (
        "The part {part} has no content type (neither an Override nor a Default for .{extension})."
    ),
    "override_orfao": "[Content_Types].xml declares {part}, which does not exist in the package.",
    "rels_ilegivel": "{part} is not valid XML: {error}",
    "rid_duplicado": "{part}: Id {rid} declared twice.",
    "rel_quebrado": "{part}: {rid} points to {target}, which does not exist in the package.",
    "parte_sem_relacionamento": "The part {part} is not reachable through any relationship.",
    "xml_malformado": "{part} is not well-formed XML: {error}",
    "rid_pendente": "{part}: <{element}> uses {rid}, which is missing from {rels}.",
    "sem_presentation": "The package has no ppt/presentation.xml.",
    "sldid_duplicado": "presentation.xml lists slide id {id} twice.",
    "sldid_invalido": "Slide id {id} is outside the allowed range (256–2147483647).",
    "sldid_sem_rel": "presentation.xml references {rid}, which is missing from the .rels.",
    "slide_ausente": "The slide list points to {part}, which does not exist.",
    "slide_fora_da_lista": "{part} exists in the package but is not in sldIdLst.",
    "ordem_de_esquema": "{part}: <{element}> has children out of the order the schema requires: {children}",
    "id_de_forma_duplicado": "{part}: two shapes use id {id} (it must be unique on the slide).",
    "id_de_forma_invalido": "{part}: shape with id {id!r}.",
    "txbody_sem_bodypr": "{part}: text body without <a:bodyPr>.",
    "txbody_vazio": "{part}: text body without any paragraph.",
    "run_sem_texto": "{part}: <a:r> without <a:t>.",
    "tabela_sem_linhas": "{part}: table without any row.",
    "linha_sem_altura": "{part}: row {row} has no 'h' attribute.",
    "tabela_inconsistente": "{part}: row {row} spans {span} columns, but the grid has {columns}.",
    "id_de_extensao_duplicado": "{part}: table {table} repeats the {what} id {id} in {count} places.",
    "identity.row": "table row",
    "identity.column": "table column",
    "caractere_ilegal": "{part}: character {char} is not allowed in XML 1.0.",
    "zip_corrompido": "Corrupted entry in the package: {name}",
    "zip_invalido": "The file is not a valid ZIP package: {error}",
    "io": "The file could not be read: {error}",
}
