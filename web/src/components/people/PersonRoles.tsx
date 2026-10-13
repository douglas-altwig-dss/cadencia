import { ActionIcon, Alert, Badge, Button, Group, Paper, Select, Stack, Switch, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { useDeleteMember, useMembers, useRoles, useSaveMember, useSaveRole } from '../../api/planHooks';
import type { PlanRole } from '../../api/types';
import { ErrorState, Loading, useConfirm } from '../common';
import { RoleChip } from '../epicPlan/shared';
import { failure } from './RoleForm';

const SENIORITIES = [
  { value: 'junior', label: 'Júnior' },
  { value: 'pleno', label: 'Pleno' },
  { value: 'senior', label: 'Sênior' },
];

interface Row {
  papel_id: string | null;
  senioridade: string;
}

/** One role's description, editable in place. It belongs to the role, so saving it changes it for everyone who has it. */
function RoleDescription({ role }: { role: PlanRole }) {
  const save = useSaveRole();
  const [text, setText] = useState(role.descricao);
  useEffect(() => setText(role.descricao), [role.descricao]);
  const others = (role.membros ?? []).length;
  return (
    <Stack gap={4}>
      <Group gap={6}>
        <RoleChip role={role} />
        <Text size="xs" c="dimmed">
          {others > 1 ? `Vale para as ${others} pessoas com esta função: ${(role.membros ?? []).join(', ')}.` : 'Só esta pessoa tem esta função hoje.'}
        </Text>
      </Group>
      <Textarea
        aria-label={`Descrição da função ${role.nome}`}
        placeholder="Uma frase sobre o que esta função faz"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      <Group justify="flex-end">
        <Button
          size="compact-xs"
          variant="light"
          disabled={text.trim() === role.descricao.trim()}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { id: role.id, nome: role.nome, descricao: text.trim(), cor: role.cor, ordem: role.ordem, rotulos: role.rotulos },
              {
                onSuccess: () => notifications.show({ title: 'Descrição salva', message: `Vale para todos com a função ${role.nome}.` }),
                onError: failure('Descrição não salva'),
              },
            )
          }
        >
          Salvar descrição
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * A person's role(s) and seniority, whether they take part in epic planning, and the description of
 * each role. Moved here from the epic plan's "Papéis e equipe" section: the data was never the
 * epic's — `member_role` is keyed by person — only the form lived there.
 */
export function PersonRoles({ accountId, name, onManage }: { accountId: string; name: string; onManage?: () => void }) {
  const roles = useRoles();
  const members = useMembers();
  const save = useSaveMember();
  const remove = useDeleteMember();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const member = members.data?.items.find((m) => m.id === accountId);
  const enrolled = !!member;

  const initial = useMemo(
    () => ({
      ativo: member?.ativo ?? true,
      papeis: member?.papeis.map((p) => ({ papel_id: String(p.papel_id), senioridade: p.senioridade })) ?? [],
    }),
    [member],
  );
  const [ativo, setAtivo] = useState(initial.ativo);
  const [rows, setRows] = useState<Row[]>(initial.papeis);
  // A refetch after saving replaces `member`, so the draft follows what is stored.
  useEffect(() => {
    setAtivo(initial.ativo);
    setRows(initial.papeis);
  }, [initial]);

  if (roles.isLoading || members.isLoading) return <Loading rows={2} />;
  if (roles.error) return <ErrorState error={roles.error} />;
  if (members.error) return <ErrorState error={members.error} />;
  const list = roles.data?.items ?? [];
  const byId = new Map(list.map((r) => [String(r.id), r]));
  const chosen = rows.filter((r) => r.papel_id);
  const dirty = !enrolled || ativo !== initial.ativo || JSON.stringify(chosen) !== JSON.stringify(initial.papeis);
  const taken = new Set(chosen.map((r) => r.papel_id));
  const update = (index: number, patch: Partial<Row>) => setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Paper withBorder p="md">
      {confirmDialog}
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Title order={4}>Função</Title>
            {!enrolled && (
              <Badge variant="default" size="sm">
                fora do planejamento
              </Badge>
            )}
          </Group>
          {onManage && (
            <Button size="compact-xs" variant="subtle" onClick={onManage}>
              Gerenciar funções
            </Button>
          )}
        </Group>
        {!enrolled && (
          <Alert variant="light" color="petrol">
            {name} ainda não participa do planejamento de épicos. Escolha uma função e inclua a pessoa: as subtarefas dela passam a ter essa função no plano.
          </Alert>
        )}

        {rows.map((row, index) => (
          <Group key={index} wrap="nowrap" align="flex-end">
            <Select
              aria-label="Função"
              placeholder="Escolha a função"
              data={list.map((r) => ({ value: String(r.id), label: r.nome, disabled: taken.has(String(r.id)) && String(r.id) !== row.papel_id }))}
              value={row.papel_id}
              onChange={(papel_id) => update(index, { papel_id })}
              style={{ flex: 1 }}
              nothingFoundMessage="Nenhuma função cadastrada"
            />
            <Select
              aria-label="Senioridade"
              data={SENIORITIES}
              value={row.senioridade}
              onChange={(value) => update(index, { senioridade: value ?? 'pleno' })}
              w={120}
              allowDeselect={false}
            />
            <ActionIcon variant="subtle" color="red" aria-label="Remover função" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconPlus size={14} />}
          w="fit-content"
          disabled={list.length === 0 || taken.size >= list.length}
          onClick={() => setRows([...rows, { papel_id: null, senioridade: 'pleno' }])}
        >
          Adicionar função
        </Button>
        {list.length === 0 && (
          <Text size="xs" c="dimmed">
            Ainda não há funções. Use “Gerenciar funções” para criar a primeira.
          </Text>
        )}
        <Text size="xs" c="dimmed">
          A senioridade é informativa: aparece nos chips, mas não muda capacidade, estimativas nem alocação.
        </Text>
        <Switch
          label="Participa do planejamento de épicos"
          description="Desligado, a pessoa mantém as funções mas não entra nos planos."
          checked={ativo}
          onChange={(e) => setAtivo(e.currentTarget.checked)}
        />
        <Group justify="space-between">
          {enrolled ? (
            <Button
              size="compact-sm"
              variant="subtle"
              color="red"
              loading={remove.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: `Tirar ${name} da equipe de planejamento?`,
                  body: 'Os dados do Jira ficam.',
                  confirmLabel: 'Tirar da equipe',
                });
                if (ok) remove.mutate(accountId, { onError: failure('Pessoa não removida') });
              }}
            >
              Tirar da equipe
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={!dirty || (!enrolled && chosen.length === 0)}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { id: accountId, ativo, papeis: chosen.map((r) => ({ papel_id: Number(r.papel_id), senioridade: r.senioridade })) },
                {
                  onSuccess: () => notifications.show({ title: enrolled ? 'Função salva' : 'Pessoa incluída', message: name }),
                  onError: failure('Função não salva'),
                },
              )
            }
          >
            {enrolled ? 'Salvar' : 'Incluir no planejamento'}
          </Button>
        </Group>

        {chosen.length > 0 && (
          <Stack gap="sm" mt="xs">
            <Title order={5}>Descrição da função</Title>
            {chosen.map((row) => {
              const role = byId.get(row.papel_id!);
              return role ? <RoleDescription key={role.id} role={role} /> : null;
            })}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
