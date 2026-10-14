"""Linha de comando (cli.py): textos de ajuda e as poucas mensagens que ela mesma imprime."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "description": "Cadência — acompanhamento de entregas no Jira",
    "no_space": "Sem espaço",
    "error.sprint_not_collected": "sprint {sprint} não coletada",
    "error.template_not_found": "modelo {template} não encontrado",
    "error.demo_not_empty": "o banco já tem boards; use --force para misturar dados de demonstração a ele "
    "ou aponte CADENCIA_DATABASE_URL para outro banco",
    "help.db_upgrade": "aplica as migrações do banco",
    "help.test_connection": "testa a credencial do Jira",
    "help.discover": "M0: boards, campos customizados e status da instância",
    "help.boards": "lista boards descobertos e marca os acompanhados",
    "help.boards.q": "filtro por nome do board ou do espaço",
    "help.boards.select": "ids a acompanhar (substitui a seleção)",
    "help.spaces": "lista os espaços (times) com os boards de cada um",
    "help.spaces.selected": "apenas boards acompanhados",
    "help.check_deck": "valida um .pptx como pacote OOXML; sai com erro se inválido",
    "help.check_deck.file": "arquivos .pptx a validar",
    "help.check_variables": "lista variáveis usadas em modelos sem registro ou sem valor; "
    "sai com erro se houver",
    "help.template_filter": "restringe a um modelo",
    "help.migrate_bindings": "mostra o que converter vínculos antigos (field:) em variáveis faria; "
    "não grava nada",
    "help.migrate_bindings.apply": "grava: registra as variáveis e repõe os vínculos",
    "help.migrate_palette": "mostra modelos cuja paleta é só uma cópia da compartilhada; --apply faz herdar",
    "help.migrate_palette.apply": "grava: remove as cópias redundantes",
    "help.collect": "coleta os boards selecionados",
    "help.collect.full": "reconciliação completa",
    "help.collect.board": "restringe a um board (repetível)",
    "help.checkpoint": "grava/reexecuta snapshots de checkpoints",
    "help.checkpoint.at": "instante ISO de um checkpoint específico",
    "help.checkpoint.force": "regrava snapshots existentes",
    "help.summary": "M1: resumo de uma sprint em JSON",
    "help.manifest": "M0: manifesto de áreas substituíveis de um .pptx",
    "help.template_add": "registra um modelo .pptx",
    "help.mapping": "mapeamento de um modelo",
    "help.mapping.file": "JSON do mapeamento (para set)",
    "help.deck": "gera a apresentação",
    "help.deck.reference": "instante de referência (padrão: último checkpoint)",
    "help.deck.no_render": "não renderiza prévias com LibreOffice",
    "help.serve": "sobe a API",
    "help.scheduler": "serviço coletor agendado",
    "help.demo": "preenche o banco com a instância fictícia de demonstração",
    "help.demo.force": "aceita um banco que já tem boards",
    "help.config": "as configurações salvas no app (o banco vale mais que o ambiente)",
    "help.config.show": "mostra todas as configurações; segredos só como is_set",
    "help.config.set": "salva uma configuração no banco",
    "help.config.unset": "esquece uma configuração salva (volta ao ambiente ou ao padrão)",
    "help.config.import_env": "copia para o banco os valores definidos no ambiente",
    "help.config.key": "nome da configuração, por exemplo timezone",
    "help.config.value": "novo valor",
}
