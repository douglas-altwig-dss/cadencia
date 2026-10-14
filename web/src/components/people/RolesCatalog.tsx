import { ActionIcon, Anchor, Badge, Button, Group, Modal, Paper, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useDeleteRole, useMembers, useRoles, type RoleInput } from '../../api/planHooks';
import { useT } from '../../i18n';
import { ErrorState, Loading, useConfirm } from '../common';
import { RoleChip } from '../epicPlan/shared';
import { failure, RoleForm } from './RoleForm';

/**
 * The roles everyone draws from, and who covers them. A role is shared — its description and colour
 * are the same for every person who has it — so it is managed here, once, and not on each person.
 * Assigning roles to a person happens on that person's page.
 */
export function RolesCatalog() {
  const t = useT();
  const tc = t.people.catalog;
  const roles = useRoles();
  const members = useMembers();
  const remove = useDeleteRole();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [draft, setDraft] = useState<RoleInput | null>(null);

  if (roles.isLoading || members.isLoading) return <Loading rows={4} />;
  if (roles.error) return <ErrorState error={roles.error} />;
  if (members.error) return <ErrorState error={members.error} />;
  const list = roles.data?.items ?? [];
  const index = new Map(list.map((r) => [r.id, r]));
  const team = members.data?.items ?? [];

  return (
    <Stack gap="md">
      {confirmDialog}
      <Tabs defaultValue="roles" variant="pills">
        <Tabs.List mb="md">
          <Tabs.Tab value="roles">{tc.rolesTab(list.length)}</Tabs.Tab>
          <Tabs.Tab value="team">{tc.teamTab(team.length)}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="roles">
          <Group justify="space-between" mb="sm" wrap="nowrap">
            <Text size="sm" c="dimmed">
              {tc.intro}
            </Text>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setDraft({ nome: '', descricao: '', cor: '#868e96', ordem: list.length, rotulos: [] })}
            >
              {tc.newRole}
            </Button>
          </Group>
          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={620} mb={0}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tc.colRole}</Table.Th>
                    <Table.Th>{t.people.common.description}</Table.Th>
                    <Table.Th>{tc.colLabels}</Table.Th>
                    <Table.Th className="num">{tc.colPeople}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.map((role) => (
                    <Table.Tr key={role.id}>
                      <Table.Td>
                        <RoleChip role={role} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{role.descricao || '—'}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs" className="mono">
                          {role.rotulos.join(', ') || '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td className="num">{role.membros?.length ?? 0}</Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap" justify="flex-end">
                          <ActionIcon variant="subtle" aria-label={t.people.common.edit(role.nome)} onClick={() => setDraft({ ...role })}>
                            <IconPencil size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={tc.deleteAria(role.nome)}
                            onClick={async () => {
                              const ok = await confirm({
                                title: tc.deleteTitle(role.nome),
                                body: tc.deleteBody,
                                confirmLabel: tc.deleteConfirm,
                              });
                              if (ok) remove.mutate(role.id, { onError: failure(tc.inUse) });
                            }}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {list.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={5}>
                        <Text size="sm" c="dimmed">
                          {tc.noRoles}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="team">
          <Text size="sm" c="dimmed" mb="sm">
            {tc.teamIntro}
          </Text>
          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={520} mb={0}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{tc.colMember}</Table.Th>
                    <Table.Th>{tc.colRoles}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {team.map((m) => (
                    <Table.Tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.6 }}>
                      <Table.Td>
                        <Anchor component={Link} to={`/people/${encodeURIComponent(m.id)}`} size="sm" fw={600}>
                          {m.nome}
                        </Anchor>
                        {!m.ativo && (
                          <Badge ml={6} size="xs" variant="default">
                            {tc.inactive}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {m.papeis.map((p) => {
                            const role = index.get(p.papel_id);
                            return role && <RoleChip key={p.papel_id} role={role} suffix={p.senioridade_rotulo} />;
                          })}
                          {m.papeis.length === 0 && (
                            <Text size="xs" c="dimmed">
                              {t.people.common.noRole}
                            </Text>
                          )}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                  {team.length === 0 && (
                    <Table.Tr>
                      <Table.Td colSpan={2}>
                        <Text size="sm" c="dimmed">
                          {tc.noTeam}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={!!draft} onClose={() => setDraft(null)} title={draft?.id ? tc.editRole : tc.newRole}>
        {draft && <RoleForm role={draft} onClose={() => setDraft(null)} />}
      </Modal>
    </Stack>
  );
}
