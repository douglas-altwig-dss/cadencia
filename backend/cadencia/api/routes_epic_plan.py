"""Epic plan: roles and their members, parameters, the plan page and plan generation."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from cadencia.analytics.epic_plan import (
    generate_plan,
    member_dict,
    members_of,
    parameters_dict,
    parameters_of,
    plan_view,
    role_dict,
    role_usage,
    roles_of,
    save_parameters,
)
from cadencia.api.deps import JSONDict, SessionDep, SettingsDep, base_url
from cadencia.domain.epic_plan.model import Role
from cadencia.errors import Invalid
from cadencia.i18n import Msg, localize, render, tr
from cadencia.planner.solvers import SolverUnavailable
from cadencia.planner.strategies import STRATEGIES
from cadencia.store import repo

router = APIRouter(tags=["epic plan"])


class RoleBody(BaseModel):
    nome: str
    descricao: str = ""
    cor: str = "#868e96"
    ordem: int = 0
    rotulos: list[str] = Field(default_factory=list)


def _role(row: Any) -> Role:
    return Role(row.id, row.name, row.description, row.color, row.position, tuple(row.labels or ()))


@router.get("/roles")
def list_roles(session: SessionDep) -> JSONDict:
    return {
        "items": [
            {**role_dict(_role(r)), "membros": repo.role_member_names(session, r.id)}
            for r in repo.list_roles(session)
        ]
    }


@router.post("/roles", status_code=201)
def create_role(body: RoleBody, session: SessionDep) -> JSONDict:
    row = repo.create_role(
        session,
        name=body.nome,
        description=body.descricao,
        color=body.cor,
        position=body.ordem,
        labels=body.rotulos,
    )
    return role_dict(_role(row))


@router.put("/roles/{role_id}")
def update_role(role_id: int, body: RoleBody, session: SessionDep) -> JSONDict:
    row = repo.update_role(
        session,
        role_id,
        name=body.nome,
        description=body.descricao,
        color=body.cor,
        position=body.ordem,
        labels=body.rotulos,
    )
    return role_dict(_role(row))


@router.delete("/roles/{role_id}", status_code=204)
def delete_role(role_id: int, session: SessionDep) -> None:
    """Refused while anyone covers the role or any collected subtask is that role's work."""
    roles = roles_of(session)
    role = next((r for r in roles if r.id == role_id), None)
    if role is not None:
        members = repo.role_member_names(session, role_id)
        subtasks = role_usage(session, role_id, roles)
        where: list[Msg] = []
        if members:
            where.append(Msg("epic_plan.role_in_use.members", names=members))
        if subtasks:
            where.append(Msg("epic_plan.role_in_use.subtasks", keys=subtasks))
        if where:
            raise Invalid(Msg("epic_plan.role_in_use.message", role=role.name, places=where))
    repo.delete_role(session, role_id)


class MemberRoleBody(BaseModel):
    papel_id: int
    senioridade: str = "pleno"


class MemberBody(BaseModel):
    ativo: bool = True
    papeis: list[MemberRoleBody] = Field(default_factory=list)


@router.get("/members")
def list_members(session: SessionDep) -> JSONDict:
    members = members_of(session)
    enrolled = {m.id for m in members}
    names = repo.people_names(session)
    return {
        "items": [member_dict(m) for m in members],
        "pessoas": [
            {"id": account_id, "nome": name}
            for account_id, name in sorted(names.items(), key=lambda kv: (kv[1].casefold(), kv[0]))
            if account_id not in enrolled
        ],
    }


@router.put("/members/{account_id}")
def save_member(account_id: str, body: MemberBody, session: SessionDep) -> JSONDict:
    repo.save_member(
        session, account_id, active=body.ativo, roles=[(r.papel_id, r.senioridade) for r in body.papeis]
    )
    return next(member_dict(m) for m in members_of(session) if m.id == account_id)


@router.delete("/members/{account_id}", status_code=204)
def delete_member(account_id: str, session: SessionDep) -> None:
    repo.delete_member(session, account_id)


@router.get("/planning/parameters")
def get_parameters(session: SessionDep) -> JSONDict:
    return parameters_dict(parameters_of(session))


@router.put("/planning/parameters")
def put_parameters(body: dict[str, Any], session: SessionDep) -> JSONDict:
    return parameters_dict(save_parameters(session, body))


@router.get("/planning/algorithms")
def algorithms() -> JSONDict:
    return localize({"items": [s.as_dict() for s in STRATEGIES.values()]})


class PlanRequest(BaseModel):
    epico: str
    algoritmo: str = "guloso"
    membros_ids: list[str]
    parametros: dict[str, Any] | None = None
    limite_tempo_s: float | None = None


@router.post("/planning")
def plan(body: PlanRequest, session: SessionDep) -> JSONDict:
    """Generate a plan. The answer is validated whatever produced it; a valid one becomes the
    epic's latest plan. ``status``: otimo | viavel | sem_solucao | heuristico | invalido."""
    try:
        return generate_plan(
            session,
            epic_key=body.epico,
            algorithm=body.algoritmo,
            member_ids=body.membros_ids,
            overrides=body.parametros,
            time_limit=body.limite_tempo_s,
        )
    except SolverUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "cause": tr("planner.unavailable_cause"),
                "message": render(exc.msg),
                "action": tr("planner.unavailable_action"),
            },
        ) from exc


@router.get("/epics/{key}/plan")
def epic_plan(key: str, session: SessionDep, settings: SettingsDep) -> JSONDict:
    return plan_view(session, key, base_url(settings))


class SelectionBody(BaseModel):
    membros_ids: list[str]


@router.put("/epics/{key}/plan/selection")
def put_selection(key: str, body: SelectionBody, session: SessionDep) -> JSONDict:
    """Who is available for this epic — one choice shared by capacity and planning."""
    known = {m.id for m in members_of(session)}
    unknown = [i for i in body.membros_ids if i not in known]
    if unknown:
        raise Invalid(Msg("epic_plan.error.unknown_selection", ids=unknown))
    repo.set_plan_selection(session, key, body.membros_ids)
    return {"selecao": body.membros_ids}


class SubtaskRolesBody(BaseModel):
    papeis: list[int] = Field(default_factory=list)


@router.put("/subtasks/{key}/roles")
def put_subtask_roles(key: str, body: SubtaskRolesBody, session: SessionDep) -> JSONDict:
    """Choose a subtask's role(s) by hand (one, or two for "A + B"); ``[]`` returns it to the
    automatic answer (labels, then the assignee's role, then the task's)."""
    repo.set_subtask_roles(session, key, body.papeis)
    return {"subtarefa": key, "papeis": body.papeis}
