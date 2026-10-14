"""Notificações: eventos, mensagens enviadas aos canais e falhas de entrega."""

from __future__ import annotations

from cadencia.i18n.fmt import day_month_year
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "event.deck": "apresentação gerada",
    "event.digest": "resumo de riscos",
    "event.collection_failed": "coleta com falha",
    "channel.bad_email": "endereço de e-mail inválido: {addresses}",
    "channel.bad_url": "o destino de um webhook precisa ser uma URL http(s)",
    "channel.not_found": "O canal {id} não existe.",
    "open_in_app": "Abrir na Cadência",
    "error.smtp_missing": "SMTP não configurado (CADENCIA_SMTP_HOST)",
    "error.http": "HTTP {status}: {body}",
    "deck.title": "Apresentação gerada: {name}",
    "deck.approved": "Aprovada na validação e pronta para baixar.",
    "deck.refused": "Reprovada na validação ({errors} erro(s)); abra para ver o que falta.",
    "deck.field.reference": "Referência",
    "deck.field.slides": "Slides",
    "deck.field.warnings": "Avisos",
    "deck.reference_at": lambda at: f"{day_month_year(at, 'pt-BR', time=True)} UTC",
    "digest.title": "Riscos novos — {space}: {count}",
    "collection.failed": "Coleta com falha",
    "collection.partial": "Coleta parcial",
    "collection.failed_text": "A coleta agendada falhou.",
    "test.title": "Teste da Cadência",
    "test.text": "Se você está lendo isto, o canal está configurado certo.",
}
