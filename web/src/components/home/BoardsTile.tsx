import { ActionIcon, Anchor, Badge, Button, Checkbox, Group, Menu, Paper, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAdjustmentsHorizontal, IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { DashboardRow } from '../../api/types';
import { type Messages, useT } from '../../i18n';
import { useFilters } from '../../lib/filters';
import { fmtDate } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { InfoTip, ProgressBars, Tipped } from '../common';
import { RiskCountsInline } from '../risk';
import { elapsedOf, FreshnessCell, MiniBars, Throughput } from './parts';

type ColumnId = 'space' | 'sprint' | 'progress' | 'risk' | 'throughput' | 'trend' | 'data';

type HomeText = Messages['tracking']['home'];

/** The columns in their default order; the label is `tracking.home.columns[id]`, read at render time. */
const COLUMN_IDS: ColumnId[] = ['space', 'sprint', 'progress', 'risk', 'throughput', 'trend', 'data'];

const column = (id: ColumnId, m: HomeText) => ({ id, label: m.columns[id], help: HELP[`col:${id}`] });

export interface BoardsConfig {
  order?: ColumnId[];
  hidden?: ColumnId[];
}

/** The stored order, with a column added in a later version at the end instead of never. */
function ordered(config: BoardsConfig): ColumnId[] {
  const known = COLUMN_IDS;
  const kept = (config.order ?? []).filter((id) => known.includes(id));
  return [...kept, ...known.filter((id) => !kept.includes(id))];
}

/** ``compact`` is the desktop table's short risk names; a card on a phone has the room for the full ones. */
function cell(id: ColumnId, row: DashboardRow, m: HomeText, compact = false): ReactNode {
  switch (id) {
    case 'space':
      return <Text size="sm">{row.board.space_name ?? row.board.space_key ?? '—'}</Text>;
    case 'sprint':
      return row.sprint ? (
        <>
          <Text size="sm">{row.sprint.name}</Text>
          {row.window && (
            <Text size="xs" c="dimmed">
              {m.windowOf(row.window.index, row.window.total, fmtDate(row.window.end))}
            </Text>
          )}
          {row.warnings.length > 0 && (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="yellow.8">
                {m.warnings(row.warnings.length)}
              </Text>
              <InfoTip label={row.warnings.join(' ')} about={m.sprintWarnings} width={300} />
            </Group>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          {m.continuousFlow}
        </Text>
      );
    case 'progress':
      return <ProgressBars progress={row.progress} compact elapsed={elapsedOf(row)} />;
    case 'risk':
      return <RiskCountsInline counts={row.risk_counts} compact={compact} />;
    case 'throughput':
      return <Throughput row={row} />;
    case 'trend':
      return <MiniBars trend={row.trend} />;
    case 'data':
      return <FreshnessCell row={row} />;
  }
}

/** Which columns, in which order — a setting of this tile, kept with it in the mosaic. */
function ColumnsMenu({ config, onChange }: { config: BoardsConfig; onChange: (next: BoardsConfig) => void }) {
  const order = ordered(config);
  const hidden = config.hidden ?? [];
  const m = useT().tracking.home;
  const toggle = (id: ColumnId) => onChange({ ...config, order, hidden: hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id] });
  const move = (id: ColumnId, delta: number) => {
    const next = [...order];
    const at = next.indexOf(id);
    const to = at + delta;
    if (to < 0 || to >= next.length) return;
    [next[at], next[to]] = [next[to], next[at]];
    onChange({ ...config, order: next, hidden });
  };
  return (
    <Menu position="bottom-end" width={280} closeOnItemClick={false} withinPortal>
      <Menu.Target>
        <Button variant="default" size="compact-xs" leftSection={<IconAdjustmentsHorizontal size={14} />}>
          {m.columnsButton}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{m.columnsTitle}</Menu.Label>
        <Stack gap={4} px="sm" pb="xs">
          {order.map((id, index) => {
            const label = m.columns[id];
            return (
              <Group key={id} justify="space-between" wrap="nowrap">
                <Checkbox size="xs" label={label} checked={!hidden.includes(id)} onChange={() => toggle(id)} />
                <Group gap={2} wrap="nowrap">
                  <ActionIcon size="sm" variant="subtle" aria-label={m.moveUp(label)} disabled={index === 0} onClick={() => move(id, -1)}>
                    <IconArrowUp size={12} />
                  </ActionIcon>
                  <ActionIcon size="sm" variant="subtle" aria-label={m.moveDown(label)} disabled={index === order.length - 1} onClick={() => move(id, 1)}>
                    <IconArrowDown size={12} />
                  </ActionIcon>
                </Group>
              </Group>
            );
          })}
        </Stack>
        <Menu.Divider />
        <Menu.Item onClick={() => onChange({})} closeMenuOnClick>
          {m.resetColumns}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** RF-86: on a phone each board is a card; a nine-column table does not fit a thumb. */
function BoardCards({ rows, columns }: { rows: DashboardRow[]; columns: ColumnId[] }) {
  const { carry } = useFilters();
  const m = useT().tracking.home;
  return (
    <Stack gap="xs">
      {rows.map((row) => (
        <Paper key={row.board.id} withBorder p="sm">
          <Group justify="space-between" mb={6}>
            <Anchor component={Link} to={carry(`/boards/${row.board.id}`)} fw={600}>
              {row.board.name}
            </Anchor>
            <Badge variant="light" color="gray" size="sm">
              {row.board.type}
            </Badge>
          </Group>
          {row.error ? (
            <Text size="sm" c="red">
              {row.error.cause}: {row.error.message}
            </Text>
          ) : (
            <Stack gap={6}>
              {columns.map((id) => (
                <Group key={id} justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                  <Text size="xs" c="dimmed" w={110}>
                    {column(id, m).label}
                    <InfoTip label={column(id, m).help} width={260} about={column(id, m).label} />
                  </Text>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>{cell(id, row, m)}</div>
                </Group>
              ))}
            </Stack>
          )}
        </Paper>
      ))}
    </Stack>
  );
}

/** The table of boards: one row each, with the columns this person chose. */
export function BoardsTile({ rows, config, onConfig }: { rows: DashboardRow[]; config: BoardsConfig; onConfig: (next: BoardsConfig) => void }) {
  const { carry } = useFilters();
  const phone = useMediaQuery('(max-width: 48em)') ?? false;
  const columns = ordered(config).filter((id) => !(config.hidden ?? []).includes(id));
  const m = useT().tracking.home;
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text className="kpi-label">
          <Tipped help={HELP['tile:boards']}>{m.boards}</Tipped>
        </Text>
        <ColumnsMenu config={config} onChange={onConfig} />
      </Group>
      {phone ? (
        <BoardCards rows={rows} columns={columns} />
      ) : (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={1000} mb={0}>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.colBoard}</Table.Th>
                  {columns.map((id) => (
                    <Table.Th key={id}>
                      {column(id, m).label}
                      <InfoTip label={column(id, m).help} width={280} about={column(id, m).label} />
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.board.id}>
                    <Table.Td>
                      <Anchor component={Link} to={carry(`/boards/${row.board.id}`)} fw={600}>
                        {row.board.name}
                      </Anchor>
                      <Text size="xs" c="dimmed">
                        {row.board.type === 'kanban' ? 'kanban' : 'scrum'}
                      </Text>
                    </Table.Td>
                    {row.error ? (
                      <Table.Td colSpan={columns.length}>
                        <Text size="sm" c="red">
                          {row.error.cause}: {row.error.message}
                        </Text>
                      </Table.Td>
                    ) : (
                      columns.map((id) => <Table.Td key={id}>{cell(id, row, m, true)}</Table.Td>)
                    )}
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
