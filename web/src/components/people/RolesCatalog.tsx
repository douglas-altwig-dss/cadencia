import { ActionIcon, Anchor, Badge, Button, Group, Modal, Paper, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { useDeleteRole, useMembers, useRoles, type RoleInput } from '../../api/planHooks';
import { ErrorState, Loading, useConfirm } from '../common';
import { RoleChip } from '../epicPlan/shared';
import { failure, RoleForm } from './RoleForm';

/**
 * The roles everyone draws from, and who covers them. A role is shared — its description and colour
 * are the same for every person who has it — so it is managed here, once, and not on each person.
 * Assigning roles to a person happens on that person's page.
 */
export function RolesCatalog() {
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
      <Tabs defaultValue="funcoes" variant="pills">
        <Tabs.List mb="md">
          <Tabs.Tab value="funcoes">Funções · {list.length}</Tabs.Tab>
          <Tabs.Tab value="equipe">Equipe · {team.length}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="funcoes">
          <Group justify="space-between" mb="sm" wrap="nowrap">
            <Text size="sm" c="dimmed">
              A cor e o nome de cada função aparecem em todas as visões; as labels dizem quais subtarefas do Jira são dela.
            </Text>
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={() => setDraft({ nome: '', descricao: '', cor: '#868e96', ordem: list.length, rotulos: [] })}
            >
              Nova função
            </Button>
          </Group>
          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={620} mb={0}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Função</Table.Th>
                    <Table.Th>Descrição</Table.Th>
                    <Table.Th>Labels no Jira</Table.Th>
                    <Table.Th className="num">Pessoas</Table.Th>
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
                          <ActionIcon variant="subtle" aria-label={`Editar ${role.nome}`} onClick={() => setDraft({ ...role })}>
                            <IconPencil size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={`Excluir ${role.nome}`}
                            onClick={async () => {
                              const ok = await confirm({
                                title: `Excluir a função ${role.nome}?`,
                                body: 'A função sai do catálogo. Uma função que ainda tem pessoas não pode ser excluída.',
                                confirmLabel: 'Excluir função',
                              });
                              if (ok) remove.mutate(role.id, { onError: failure('Função em uso') });
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
                          Nenhuma função ainda. Crie a primeira para poder atribuí-la às pessoas.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>
        </Tabs.Panel>

        <Tabs.Panel value="equipe">
          <Text size="sm" c="dimmed" mb="sm">
            Quem participa do planejamento de épicos: vale para o plano de épico, não para a capacidade de cada board (essa lista fica em
            Configuração → Perfil do board). Para mudar as funções de alguém, abra a página da pessoa.
          </Text>
          <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
            <Table.ScrollContainer minWidth={520} mb={0}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Colaborador</Table.Th>
                    <Table.Th>Funções</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {team.map((m) => (
                    <Table.Tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.6 }}>
                      <Table.Td>
                        <Anchor component={Link} to={`/pessoas/${encodeURIComponent(m.id)}`} size="sm" fw={600}>
                          {m.nome}
                        </Anchor>
                        {!m.ativo && (
                          <Badge ml={6} size="xs" variant="default">
                            inativo
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
                              sem função
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
                          Ninguém na equipe ainda. Abra uma pessoa em Pessoas e atribua uma função.
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

      <Modal opened={!!draft} onClose={() => setDraft(null)} title={draft?.id ? 'Editar função' : 'Nova função'}>
        {draft && <RoleForm role={draft} onClose={() => setDraft(null)} />}
      </Modal>
    </Stack>
  );
}
