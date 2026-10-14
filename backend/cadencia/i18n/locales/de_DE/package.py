"""Prüfung der .pptx als OOXML-Paket (RF-50). Teilnamen, Elementnamen und IDs bleiben wie in der Datei."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "zip_backslash": "Paketeintrag mit umgekehrtem Schrägstrich: {name!r}",
    "zip_path": "Ungültiger Eintragspfad: {name!r}",
    "zip_duplicada": "Doppelter Eintrag im Paket: {name!r}",
    "sem_content_types": "Das Paket hat keine [Content_Types].xml.",
    "content_types_ilegivel": "[Content_Types].xml konnte nicht gelesen werden: {error}",
    "sem_content_type": (
        "Der Teil {part} hat keinen Inhaltstyp (weder Override noch Default für .{extension})."
    ),
    "override_orfao": "[Content_Types].xml deklariert {part}, das es im Paket nicht gibt.",
    "rels_ilegivel": "{part} ist kein gültiges XML: {error}",
    "rid_duplicado": "{part}: Id {rid} ist zweimal deklariert.",
    "rel_quebrado": "{part}: {rid} verweist auf {target}, das es im Paket nicht gibt.",
    "parte_sem_relacionamento": "Der Teil {part} ist über keine Beziehung erreichbar.",
    "xml_malformado": "{part} ist kein wohlgeformtes XML: {error}",
    "rid_pendente": "{part}: <{element}> verwendet {rid}, das in {rels} fehlt.",
    "sem_presentation": "Das Paket hat keine ppt/presentation.xml.",
    "sldid_duplicado": "presentation.xml führt die Folien-ID {id} zweimal auf.",
    "sldid_invalido": "Die Folien-ID {id} liegt außerhalb des zulässigen Bereichs (256–2147483647).",
    "sldid_sem_rel": "presentation.xml verweist auf {rid}, das in der .rels fehlt.",
    "slide_ausente": "Die Folienliste verweist auf {part}, das es nicht gibt.",
    "slide_fora_da_lista": "{part} ist im Paket enthalten, steht aber nicht in sldIdLst.",
    "ordem_de_esquema": (
        "{part}: <{element}> hat Kindelemente außerhalb der vom Schema verlangten Reihenfolge: {children}"
    ),
    "id_de_forma_duplicado": (
        "{part}: Zwei Formen verwenden die ID {id} (sie muss auf der Folie eindeutig sein)."
    ),
    "id_de_forma_invalido": "{part}: Form mit der ID {id!r}.",
    "txbody_sem_bodypr": "{part}: Textkörper ohne <a:bodyPr>.",
    "txbody_vazio": "{part}: Textkörper ohne Absatz.",
    "run_sem_texto": "{part}: <a:r> ohne <a:t>.",
    "tabela_sem_linhas": "{part}: Tabelle ohne Zeile.",
    "linha_sem_altura": "{part}: Zeile {row} ohne das Attribut 'h'.",
    "tabela_inconsistente": "{part}: Zeile {row} umfasst {span} Spalten, das Raster hat aber {columns}.",
    "id_de_extensao_duplicado": (
        "{part}: Tabelle {table} wiederholt die ID der {what} {id} an {count} Stellen."
    ),
    "identity.row": "Tabellenzeile",
    "identity.column": "Tabellenspalte",
    "caractere_ilegal": "{part}: Das Zeichen {char} ist in XML 1.0 nicht zulässig.",
    "zip_corrompido": "Beschädigter Eintrag im Paket: {name}",
    "zip_invalido": "Die Datei ist kein gültiges ZIP-Paket: {error}",
    "io": "Die Datei konnte nicht gelesen werden: {error}",
}
