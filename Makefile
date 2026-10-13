SHELL := /bin/bash
BIN := backend/.venv/bin

.PHONY: help setup up down logs collect test lint format deck demo api web discover golden golden-update auth

help: ## lista as tarefas
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

setup: ## instala dependências do backend e do front-end (idempotente)
	test -x $(BIN)/python || python3 -m venv backend/.venv
	$(BIN)/pip install -q --upgrade pip
	$(BIN)/pip install -q -e "backend[dev]"
	cd web && npm ci --no-audit --no-fund

# Empty files are fine: compose needs them to exist, and empty means "not configured".
secrets/jira_api_token secrets/api_token secrets/web_htpasswd:
	mkdir -p secrets && touch $@ && chmod 600 $@

up: secrets/jira_api_token secrets/api_token secrets/web_htpasswd ## sobe banco, api, coletor e web (docker compose)
	docker compose up -d --build

auth: ## liga o login da interface: make auth LOGIN=<nome> (pede a senha; repita para cada pessoa)
	@test -n "$(LOGIN)" || { echo "use: make auth LOGIN=<nome>"; exit 1; }
	@mkdir -p secrets
	@test -s secrets/api_token || { openssl rand -hex 32 > secrets/api_token && chmod 600 secrets/api_token; }
	@printf '%s:%s\n' "$(LOGIN)" "$$(openssl passwd -apr1)" >> secrets/web_htpasswd && chmod 600 secrets/web_htpasswd
	@echo "login de $(LOGIN) gravado em secrets/web_htpasswd; aplique com make up"

down: ## derruba os contêineres
	docker compose down

logs: ## acompanha os logs
	docker compose logs -f api collector

collect: ## coleta incremental (FULL=1 para reconciliação completa)
	$(BIN)/cadencia collect $(if $(FULL),--full,)

discover: ## M0: boards, campos customizados e status da instância
	$(BIN)/cadencia discover

test: ## testes do backend + checagem de tipos do front-end
	cd backend && .venv/bin/pytest
	cd web && npm run typecheck

lint: ## ruff + tsc
	cd backend && .venv/bin/ruff check cadencia tests && .venv/bin/ruff format --check cadencia tests
	cd web && npm run typecheck

format: ## formata o backend
	cd backend && .venv/bin/ruff format cadencia tests && .venv/bin/ruff check --fix cadencia tests

deck: ## gera a apresentação: make deck TEMPLATE=<id>
	$(BIN)/cadencia deck --template $(TEMPLATE)

golden: ## confere os snapshots do deck (rede de segurança do refactor do módulo de apresentação)
	cd backend && .venv/bin/pytest -q tests/test_golden.py

golden-update: ## regrava os snapshots; confira o diff antes de commitar
	cd backend && CADENCIA_UPDATE_GOLDEN=1 .venv/bin/pytest -q tests/test_golden.py

demo: ## preenche o banco com a instância fictícia de demonstração
	$(BIN)/cadencia demo

api: ## API em modo desenvolvimento
	$(BIN)/cadencia serve --reload

web: ## front-end em modo desenvolvimento (proxy /api → :8000)
	cd web && npm run dev
