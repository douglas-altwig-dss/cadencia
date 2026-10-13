"""The focus log's shape and rules. Pure: no database, no request, no clock but the dates it is given."""

from __future__ import annotations

import unicodedata
from datetime import date
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

Tipo = Literal["tarefa", "troca"]
Estilo = Literal["borda-gradiente", "borda-tracejada", "borda-dupla", "borda-solida"]
Cor = Annotated[str, Field(pattern=r"^#[0-9A-Fa-f]{6}$")]

MAX_PESSOAS = 200
MAX_TEMAS = 200
MAX_REGISTROS = 20_000
MAX_SINAIS = 100


def normaliza(texto: str) -> str:
    """Lower case without accents: how two names are compared for being the same person or theme."""
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")
    return sem_acento.casefold()


def _sem_repetidos(valores: list[str], o_que: str) -> None:
    vistos: set[str] = set()
    for valor in valores:
        if valor in vistos:
            raise ValueError(f"Há {o_que} repetido: {valor}.")
        vistos.add(valor)


class _Modelo(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Pessoa(_Modelo):
    id: str = Field(min_length=1, max_length=64)
    nome: str = Field(min_length=1, max_length=120)
    cargo: str = Field(default="", max_length=120)
    cor: Cor


class Tema(_Modelo):
    nome: str = Field(min_length=1, max_length=120)
    cor: Cor
    #: Comma-separated words; a line whose text holds one of them is filed under this theme.
    palavras: str = Field(default="", max_length=500)


class Sinal(_Modelo):
    """A condition a line can be in (blocked, urgent...), found by its words in the text, as a theme is."""

    nome: str = Field(min_length=1, max_length=120)
    cor: Cor
    #: Comma-separated words; a line whose text holds one of them carries this signal.
    palavras: str = Field(default="", max_length=500)
    #: What the text has to say for the signal to show, in the team's own words. Shown, not matched.
    gatilho: str = Field(default="", max_length=200)


class Registro(_Modelo):
    uid: str = Field(min_length=1, max_length=64)
    tipo: Tipo
    #: Who the line is about. Not checked against the members: the manager's own lines name anyone.
    nome: str = Field(min_length=1, max_length=120)
    data: date
    registro: str = Field(default="", max_length=4000)
    de_tema: str | None = Field(default=None, max_length=120)
    para_tema: str | None = Field(default=None, max_length=120)
    icone: str | None = Field(default=None, max_length=16)
    cor_destaque: Cor | None = None
    estilo_linha: Estilo | None = None

    @model_validator(mode="after")
    def _completo(self) -> Self:
        if self.tipo == "tarefa" and not self.registro:
            raise ValueError("Uma atividade precisa de descrição.")
        if self.tipo == "troca" and not (self.de_tema and self.para_tema):
            raise ValueError("Uma troca de foco diz de qual tema sai e para qual tema vai.")
        return self


class Documento(_Modelo):
    pessoas: list[Pessoa] = Field(default_factory=list, max_length=MAX_PESSOAS)
    temas: list[Tema] = Field(default_factory=list, max_length=MAX_TEMAS)
    registros: list[Registro] = Field(default_factory=list, max_length=MAX_REGISTROS)
    sinais: list[Sinal] = Field(default_factory=list, max_length=MAX_SINAIS)

    @model_validator(mode="after")
    def _sem_repetidos(self) -> Self:
        _sem_repetidos([p.id for p in self.pessoas], "membro (id)")
        _sem_repetidos([normaliza(p.nome) for p in self.pessoas], "membro")
        _sem_repetidos([normaliza(t.nome) for t in self.temas], "tema")
        _sem_repetidos([normaliza(s.nome) for s in self.sinais], "sinal")
        _sem_repetidos([r.uid for r in self.registros], "registro (uid)")
        return self
