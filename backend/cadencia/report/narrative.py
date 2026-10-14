"""#7: a narrative paragraph for a board's slide, drafted by Claude from the deck's own numbers.

It is a *suggestion*: the API returns a draft, the person edits it, and only what they save (as
the value of a variable for that board) ever reaches a deck. Nothing here runs during generation.

What leaves Cadência is deliberately small — counts, percentages, dates and the sprint's own
goal, never a person's name or an item's title — and only when ``CADENCIA_AI_ENABLED`` is set.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from cadencia.config import Settings
from cadencia.errors import Invalid
from cadencia.i18n import Msg, render
from cadencia.report.core.context import BoardDeck

#: The numbers a narrative may cite: label for the model -> where it lives in the board's deck.
FACTS: tuple[tuple[str, str], ...] = (
    ("sprint", "sprint.nome"),
    ("objetivo_da_sprint", "sprint.objetivo"),
    ("janela", "janela.numero"),
    ("entregues_na_janela", "num.entregues"),
    ("variacao_da_vazao_vs_janela_anterior", "num.vazao_janela_delta"),
    ("comprometidos", "num.comprometidos"),
    ("entregues_na_sprint", "num.entregues_sprint"),
    ("aderencia", "resumo.aderencia"),
    ("variacao_da_aderencia_em_pontos", "num.aderencia_delta"),
    ("escopo_adicionado", "num.escopo_adicionado"),
    ("em_risco", "num.em_risco"),
    ("variacao_em_risco_vs_checkpoint", "num.em_risco_delta"),
    ("bloqueados", "num.bloqueados"),
    ("atrasados_ou_arrastados", "num.atrasados"),
    ("abertos", "num.abertos"),
    ("cycle_time_p85_dias", "num.cycle_p85"),
    ("previsao_85_por_cento", "previsao.p85_data"),
    ("chance_de_terminar_na_sprint", "previsao.chance_sprint"),
    ("novos_riscos_desde_o_checkpoint", "num.mudancas_novos_riscos"),
    ("riscos_resolvidos", "num.mudancas_resolvidos"),
)

SYSTEM = (  # deck text: pt-BR by design (docs/i18n.md) — the draft becomes the deck variable
    "Você escreve o parágrafo de abertura do slide de um time numa reunião semanal de "
    "acompanhamento de entregas. Escreva em português do Brasil, em 2 a 4 frases, tom factual e "
    "direto, sem markdown, sem listas e sem saudação. Use apenas os números fornecidos; quando um "
    "número não estiver presente, não fale dele. Não invente causas nem nomes. Destaque primeiro o "
    "que mudou desde a semana anterior e o que merece atenção agora."
)


class NarrativeUnavailable(RuntimeError):
    """The feature is off, the SDK is missing, or the API could not be reached.

    Carries a ``Msg``; ``str(exc)`` renders it in the ambient locale (the request's, in the API).
    """

    def __init__(self, message: Msg) -> None:
        super().__init__(message)
        self.msg = message

    def __str__(self) -> str:
        return render(self.msg)


def narrative_facts(board: BoardDeck) -> dict[str, Any]:
    """The subset of a board's deck the model sees; empty values are left out, not sent as zero."""
    facts: dict[str, Any] = {"time": board.space_name or board.space_key or "", "board": board.name}
    for label, key in FACTS:
        if key in board.numbers:
            facts[label] = board.numbers[key]
        elif board.texts.get(key):
            facts[label] = board.texts[key]
    return {k: v for k, v in facts.items() if v not in ("", None)}


def draft_narrative(settings: Settings, facts: Mapping[str, Any], *, client: Any = None) -> str:
    """One paragraph from ``facts``. ``client`` is injectable for tests."""
    if not settings.ai_enabled:
        raise NarrativeUnavailable(Msg("narrative.disabled"))
    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover - the package is a dependency
        raise NarrativeUnavailable(Msg("narrative.package_missing")) from exc
    if client is None:
        key = settings.anthropic_api_key.get_secret_value()
        client = anthropic.Anthropic(api_key=key or None, timeout=settings.ai_timeout_seconds, max_retries=2)
    try:
        response = client.beta.messages.create(
            model=settings.ai_model,
            max_tokens=2000,
            system=SYSTEM,
            # A short factual paragraph: low effort is enough, and cheaper. On a policy decline
            # the API retries on a fallback model by itself (server-side fallbacks).
            output_config={"effort": "low"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[
                {
                    "role": "user",
                    "content": "Números do time nesta semana (JSON):\n"  # deck text: pt-BR by design
                    + json.dumps(dict(facts), ensure_ascii=False, sort_keys=True),
                }
            ],
        )
    except anthropic.AuthenticationError as exc:
        raise NarrativeUnavailable(Msg("narrative.key_refused")) from exc
    except anthropic.RateLimitError as exc:
        raise NarrativeUnavailable(Msg("narrative.rate_limited")) from exc
    except anthropic.APIStatusError as exc:
        raise NarrativeUnavailable(Msg("narrative.status_error", status=exc.status_code)) from exc
    except anthropic.APIConnectionError as exc:
        raise NarrativeUnavailable(Msg("narrative.unreachable")) from exc
    if response.stop_reason == "refusal":
        raise Invalid(Msg("narrative.refused"))
    text = " ".join(b.text.strip() for b in response.content if b.type == "text" and b.text.strip())
    if not text:
        raise NarrativeUnavailable(Msg("narrative.empty"))
    return text
