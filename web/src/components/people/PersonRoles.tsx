import { ActionIcon, Alert, Badge, Button, Group, Paper, Select, Stack, Switch, Text, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { useDeleteMember, useMembers, useRoles, useSaveMember, useSaveRole } from '../../api/planHooks';
import type { PlanRole } from '../../api/types';
import { useT } from '../../i18n';
import { ErrorState, Loading, useConfirm } from '../common';
import { RoleChip } from '../epicPlan/shared';
import { failure } from './RoleForm';

const SENIORITIES = ['junior', 'pleno', 'senior'] as const;

interface Row {
  papel_id: string | null;
  senioridade: string;
}

/** One role's description, editable in place. It belongs to the role, so saving it changes it for everyone who has it. */
function RoleDescription({ role }: { role: PlanRole }) {
  const t = useT();
  const tr = t.people.roles;
  const save = useSaveRole();
  const [text, setText] = useState(role.descricao);
  useEffect(() => setText(role.descricao), [role.descricao]);
  const others = (role.membros ?? []).length;
  return (
    <Stack gap={4}>
      <Group gap={6}>
        <RoleChip role={role} />
        <Text size="xs" c="dimmed">
          {others > 1 ? tr.sharedBy(others, (role.membros ?? []).join(', ')) : tr.onlyThis}
        </Text>
      </Group>
      <Textarea
        aria-label={tr.descriptionAria(role.nome)}
        placeholder={tr.descriptionPlaceholder}
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
                onSuccess: () => notifications.show({ title: tr.descriptionSaved, message: tr.descriptionSavedMessage(role.nome) }),
                onError: failure(tr.descriptionNotSaved),
              },
            )
          }
        >
          {tr.saveDescription}
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
  const t = useT();
  const tr = t.people.roles;
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
            <Title order={4}>{tr.title}</Title>
            {!enrolled && (
              <Badge variant="default" size="sm">
                {tr.outsidePlanning}
              </Badge>
            )}
          </Group>
          {onManage && (
            <Button size="compact-xs" variant="subtle" onClick={onManage}>
              {tr.manage}
            </Button>
          )}
        </Group>
        {!enrolled && (
          <Alert variant="light" color="petrol">
            {tr.notEnrolled(name)}
          </Alert>
        )}

        {rows.map((row, index) => (
          <Group key={index} wrap="nowrap" align="flex-end">
            <Select
              aria-label={tr.title}
              placeholder={tr.choose}
              data={list.map((r) => ({ value: String(r.id), label: r.nome, disabled: taken.has(String(r.id)) && String(r.id) !== row.papel_id }))}
              value={row.papel_id}
              onChange={(papel_id) => update(index, { papel_id })}
              style={{ flex: 1 }}
              nothingFoundMessage={tr.noRolesFound}
            />
            <Select
              aria-label={tr.seniorityLabel}
              data={SENIORITIES.map((value) => ({ value, label: tr.seniority[value] }))}
              value={row.senioridade}
              onChange={(value) => update(index, { senioridade: value ?? 'pleno' })}
              w={120}
              allowDeselect={false}
            />
            <ActionIcon variant="subtle" color="red" aria-label={tr.removeRole} onClick={() => setRows(rows.filter((_, i) => i !== index))}>
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
          {tr.addRole}
        </Button>
        {list.length === 0 && (
          <Text size="xs" c="dimmed">
            {tr.noRolesYet}
          </Text>
        )}
        <Text size="xs" c="dimmed">
          {tr.seniorityNote}
        </Text>
        <Switch
          label={tr.participates}
          description={tr.participatesHint}
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
                  title: tr.removeTitle(name),
                  body: tr.removeBody,
                  confirmLabel: tr.removeFromTeam,
                });
                if (ok) remove.mutate(accountId, { onError: failure(tr.removeFailed) });
              }}
            >
              {tr.removeFromTeam}
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
                  onSuccess: () => notifications.show({ title: enrolled ? tr.roleSaved : tr.personAdded, message: name }),
                  onError: failure(tr.roleNotSaved),
                },
              )
            }
          >
            {enrolled ? t.people.common.save : tr.enroll}
          </Button>
        </Group>

        {chosen.length > 0 && (
          <Stack gap="sm" mt="xs">
            <Title order={5}>{tr.descriptionTitle}</Title>
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
