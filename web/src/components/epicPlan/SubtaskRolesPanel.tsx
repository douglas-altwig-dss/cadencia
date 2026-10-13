import { ActionIcon, Anchor, Badge, Group, MultiSelect, Paper, SegmentedControl, Stack, Table, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useState } from 'react';

import { useSetSubtaskRoles } from '../../api/planHooks';
import type { EpicPlanView } from '../../api/types';
import { useT } from '../../i18n';
import { hours } from './shared';

/**
 * The role of each subtask, and where it came from. Choosing one here is stored in Cadência (Jira
 * stays read-only) and wins over labels and the assignee; clearing it returns to the automatic answer.
 */
export function SubtaskRolesPanel({ view }: { view: EpicPlanView }) {
  const t = useT();
  const m = t.epicPlan.subtaskRoles;
  const ORIGIN = m.origin;
  const setRoles = useSetSubtaskRoles();
  const missing = view.subtarefas.filter((s) => s.papeis.length === 0);
  const [filter, setFilter] = useState<string>(missing.length ? 'sem' : 'todas');
  const rows = filter === 'sem' ? missing : view.subtarefas;
  const tasks = new Map(view.tarefas.map((t) => [t.id, t]));
  const options = view.papeis.map((r) => ({ value: String(r.id), label: r.nome }));

  const save = (key: string, roles: number[]) =>
    setRoles.mutate(
      { key, roles },
      { onError: (error) => notifications.show({ color: 'red', title: m.saveFailed(key), message: error.message }) },
    );

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={setFilter}
          data={[
            { value: 'sem', label: m.filterMissing(missing.length) },
            { value: 'todas', label: m.filterAll(view.subtarefas.length) },
          ]}
        />
        <Text size="xs" c="dimmed">
          {m.hint}
        </Text>
      </Group>
      {rows.length === 0 ? (
        <Text size="sm" c="dimmed">
          {m.allHaveRole}
        </Text>
      ) : (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={820} mb={0}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.columns.subtask}</Table.Th>
                  <Table.Th>{m.columns.assignee}</Table.Th>
                  <Table.Th className="num">{m.columns.hours}</Table.Th>
                  <Table.Th w={280}>{m.columns.role}</Table.Th>
                  <Table.Th>{m.columns.origin}</Table.Th>
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
                        aria-label={m.roleAria(s.id)}
                        placeholder={s.papeis.length ? undefined : m.choose}
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
                            {m.noRole}
                          </Badge>
                        )}
                        {s.origem_papel === 'manual' && (
                          <Tooltip label={m.revertTip}>
                            <ActionIcon variant="subtle" size="sm" aria-label={m.revertAria(s.id)} onClick={() => save(s.id, [])}>
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
