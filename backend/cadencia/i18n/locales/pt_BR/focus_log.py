"""Timeline de foco: conflito ao salvar e validação do documento."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "conflict.cause": "a timeline mudou enquanto você editava",
    "conflict.action": "Recarregue a página para pegar a versão atual antes de salvar.",
    "duplicate": "Há {what} repetido: {value}.",
    "subject.member_id": "membro (id)",
    "subject.member": "membro",
    "subject.theme": "tema",
    "subject.signal": "sinal",
    "subject.entry_uid": "registro (uid)",
    "task_needs_text": "Uma atividade precisa de descrição.",
    "switch_needs_themes": "Uma troca de foco diz de qual tema sai e para qual tema vai.",
}
