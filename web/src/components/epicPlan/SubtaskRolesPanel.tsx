import { ActionIcon, Anchor, Badge, Group, MultiSelect, Paper, SegmentedControl, Stack, Table, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useState } from 'react';

import { useSetSubtaskRoles } from '../../api/planHooks';
import type { EpicPlanView, RoleOrigin } from '../../api/types';
import { hours } from './shared';

const ORIGIN: Record<RoleOrigin, { label: string; tip: string }> = {
  manual: { label: 'escolhido aqui', tip: 'Alguém escolheu o papel nesta tela. Vale mais que labels e responsável.' },
  rotulo: { label: 'label do Jira', tip: 'Uma label ou componente da subtarefa corresponde a um papel.' },
  responsavel: { label: 'responsável', tip: 'O papel da pessoa responsável pela subtarefa, cadastrado na página dela em Pessoas.' },
  tarefa: { label: 'tarefa', tip: 'Herdado da tarefa, que corresponde a um papel só.' },
};

/**
 * The role of each subtask, and where it came from. Choosing one here is stored in Cadência (Jira
 * stays read-only) and wins over labels and the assignee; clearing it returns to the automatic answer.
 */
export function SubtaskRolesPanel({ view }: { view: EpicPlanView }) {
  const setRoles = useSetSubtaskRoles();
  const missing = view.subtarefas.filter((s) => s.papeis.length === 0);
  const [filter, setFilter] = useState<string>(missing.length ? 'sem' : 'todas');
  const rows = filter === 'sem' ? missing : view.subtarefas;
  const tasks = new Map(view.tarefas.map((t) => [t.id, t]));
  const options = view.papeis.map((r) => ({ value: String(r.id), label: r.nome }));

  const save = (key: string, roles: number[]) =>
    setRoles.mutate(
      { key, roles },
      { onError: (error) => notifications.show({ color: 'red', title: `Papel de ${key} não salvo`, message: error.message }) },
    );

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'sem', label: `Sem papel · ${missing.length}` },
            { value: 'todas', label: `Todas · ${view.subtarefas.length}` },
          ]}
        />
        <Text size="xs" c="dimmed">
          Um papel, ou dois para uma subtarefa composta (“A + B”). Fica guardado no Cadência; o Jira não muda.
        </Text>
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          Todas as subtarefas têm papel.
        </Text>
      ) : (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={820} mb={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Subtarefa</Table.Th>
                  <Table.Th>Responsável</Table.Th>
                  <Table.Th className="num">Horas</Table.Th>
                  <Table.Th w={280}>Papel</Table.Th>
                  <Table.Th>Origem</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td maw={420}>
                      <Group gap={6} wrap="nowrap" align="flex-start">
                        {s.url ? (
                          <Anchor href={s.url} target="_blank" rel="noreferrer" className="mono" size="sm">
                            {s.id}
                          </Anchor>
                        ) : (
                          <Text className="mono" size="sm">
                            {s.id}
                          </Text>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" lineClamp={2}>
                            {s.titulo}
                          </Text>
                          <Text size="xs" c="dimmed" lineClamp={1}>
                            {tasks.get(s.tarefa_id)?.titulo ?? s.tarefa_id}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1} maw={200} title={s.responsavel ?? undefined}>
                        {s.responsavel ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td className="num">{hours(s.horas)}</Table.Td>
                    <Table.Td>
                      <MultiSelect
                        size="xs"
                        aria-label={`Papel de ${s.id}`}
                        placeholder={s.papeis.length ? undefined : 'Escolher papel'}
                        data={options}
                        value={s.papeis.map(String)}
                        maxValues={2}
                        onChange={(values) => save(s.id, values.map(Number))}
                        comboboxProps={{ withinPortal: true }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        {s.origem_papel ? (
                          <Tooltip label={ORIGIN[s.origem_papel].tip} multiline w={240}>
                            <Badge variant={s.origem_papel === 'manual' ? 'light' : 'default'} style={{ cursor: 'help' }}>
                              {ORIGIN[s.origem_papel].label}
                            </Badge>
                          </Tooltip>
                        ) : (
                          <Badge color="red" variant="light">
                            sem papel
                          </Badge>
                        )}
                        {s.origem_papel === 'manual' && (
                          <Tooltip label="Voltar ao papel automático (label, responsável ou tarefa)">
                            <ActionIcon variant="subtle" size="sm" aria-label={`Voltar ${s.id} ao papel automático`} onClick={() => save(s.id, [])}>
                              <IconArrowBackUp size={14} />
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}
