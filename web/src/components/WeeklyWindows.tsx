import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';

import type { IssueBrief, TimelineWindow, WindowDiff } from '../api/types';
import { fmtDateTime } from '../lib/format';
import { GroupedKeyList } from './common';

const STATE_LABEL = { futura: 'futura', fechada: 'fechada no checkpoint', aberta: 'em andamento' } as const;

/** What moved in each window. A sprint and a board read the same movements with their own words:
 * a sprint has members, a board has a queue. */
const DIFF_LABELS: Record<'sprint' | 'board', [keyof WindowDiff, string][]> = {
  sprint: [
    ['completed', 'Entregues na janela'],
    ['added', 'Entraram depois do início'],
    ['removed', 'Saíram da sprint'],
    ['unmoved', 'Sem nenhuma movimentação'],
  ],
  board: [
    ['completed', 'Entregues na janela'],
    ['added', 'Entraram na fila'],
    ['removed', 'Saíram da fila'],
    ['unmoved', 'Sem nenhuma movimentação'],
  ],
};

/** RF-74 / RF-113: the weekly windows of a sprint or of a kanban board, one card each. */
export function WeeklyWindows({
  windows,
  items,
  kind,
}: {
  windows: TimelineWindow[];
  items: Record<string, IssueBrief>;
  kind: 'sprint' | 'board';
}) {
  return (
    <Stack gap="md">
      <Title order={4}>Janelas semanais</Title>
      <SimpleGrid cols={{ base: 1, md: Math.min(windows.length, 3) }}>
        {windows.map((w) => (
          <Paper key={w.index} withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>Semana {w.index}</Text>
              <Group gap={4}>
                <Badge variant="light" color={w.state === 'aberta' ? 'petrol' : 'gray'}>
                  {STATE_LABEL[w.state]}
                </Badge>
                {w.partial && (
                  <Badge variant="outline" color="yellow">
                    parcial
                  </Badge>
                )}
              </Group>
            </Group>
            <Text size="xs" c="dimmed" mb="sm">
              {fmtDateTime(w.start)} → {fmtDateTime(w.end)} · {w.business_days} dias úteis
            </Text>
            {w.diff ? (
              <Stack gap="sm">
                {DIFF_LABELS[kind].map(([key, label]) => (
                  <Stack key={key} gap={2}>
                    <Text size="sm" fw={500}>
                      {label} ({w.diff![key].length})
                    </Text>
                    <GroupedKeyList keys={w.diff![key]} items={items} />
                  </Stack>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                Ainda não começou.
              </Text>
            )}
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
