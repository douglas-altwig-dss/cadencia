import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';

import type { IssueBrief, TimelineWindow, WindowDiff } from '../api/types';
import { useT } from '../i18n';
import { fmtDateTime } from '../lib/format';
import { GroupedKeyList } from './common';

/** What moved in each window, in this order. A sprint and a board read the same movements with their
 * own words (`shell.windows.diff`): a sprint has members, a board has a queue. */
const DIFF_KEYS: (keyof WindowDiff & ('completed' | 'added' | 'removed' | 'unmoved'))[] = ['completed', 'added', 'removed', 'unmoved'];

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
  const t = useT();
  const words = t.shell.windows;
  return (
    <Stack gap="md">
      <Title order={4}>{words.title}</Title>
      <SimpleGrid cols={{ base: 1, md: Math.min(windows.length, 3) }}>
        {windows.map((w) => (
          <Paper key={w.index} withBorder p="md">
            <Group justify="space-between" mb="xs">
              <Text fw={600}>{words.week(w.index)}</Text>
              <Group gap={4}>
                <Badge variant="light" color={w.state === 'aberta' ? 'petrol' : 'gray'}>
                  {words.state[w.state]}
                </Badge>
                {w.partial && (
                  <Badge variant="outline" color="yellow">
                    {words.partial}
                  </Badge>
                )}
              </Group>
            </Group>
            <Text size="xs" c="dimmed" mb="sm">
              {words.range(fmtDateTime(w.start), fmtDateTime(w.end), w.business_days)}
            </Text>
            {w.diff ? (
              <Stack gap="sm">
                {DIFF_KEYS.map((key) => [key, words.diff[kind][key]] as const).map(([key, label]) => (
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
                {words.notStarted}
              </Text>
            )}
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
