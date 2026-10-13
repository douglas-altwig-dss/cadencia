import { ActionIcon, Anchor, Badge, Button, Checkbox, Group, Menu, Paper, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconAdjustmentsHorizontal, IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { DashboardRow } from '../../api/types';
import { useFilters } from '../../lib/filters';
import { fmtDate, plural } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { InfoTip, ProgressBars, Tipped } from '../common';
import { RiskCountsInline } from '../risk';
import { FreshnessCell, MiniBars, Throughput } from './parts';

type ColumnId = 'space' | 'sprint' | 'progress' | 'risk' | 'throughput' | 'trend' | 'data';

const COLUMNS: { id: ColumnId; label: string; help: string }[] = [
  { id: 'space', label: 'Time (espaço)', help: HELP['col:space'] },
  { id: 'sprint', label: 'Sprint · janela', help: HELP['col:sprint'] },
  { id: 'progress', label: 'Progresso da sprint', help: HELP['col:progress'] },
  { id: 'risk', label: 'Em risco', help: HELP['col:risk'] },
  { id: 'throughput', label: 'Vazão da janela', help: HELP['col:throughput'] },
  { id: 'trend', label: 'Tendência', help: HELP['col:trend'] },
  { id: 'data', label: 'Dados', help: HELP['col:data'] },
];

export interface BoardsConfig {
  order?: ColumnId[];
  hidden?: ColumnId[];
}

/** The stored order, with a column added in a later version at the end instead of never. */
function ordered(config: BoardsConfig): ColumnId[] {
  const known = COLUMNS.map((c) => c.id);
  const kept = (config.order ?? []).filter((id) => known.includes(id));
  return [...kept, ...known.filter((id) => !kept.includes(id))];
}

/** How far through a running sprint the board is, 0 to 1 (M25: the mark on the progress bar). */
function elapsedOf(row: DashboardRow): number | null {
  if (row.sprint?.state !== 'active' || !row.sprint.start || !row.sprint.end) return null;
  const start = Date.parse(row.sprint.start);
  const end = Date.parse(row.sprint.end);
  if (!(end > start)) return null;
  return Math.min(Math.max((Date.now() - start) / (end - start), 0), 1);
}

/** ``compact`` is the desktop table's short risk names; a card on a phone has the room for the full ones. */
function cell(id: ColumnId, row: DashboardRow, compact = false): ReactNode {
  switch (id) {
    case 'space':
      return <Text size="sm">{row.board.space_name ?? row.board.space_key ?? '—'}</Text>;
    case 'sprint':
      return row.sprint ? (
        <>
          <Text size="sm">{row.sprint.name}</Text>
          {row.window && (
            <Text size="xs" c="dimmed">
              janela {row.window.index} de {row.window.total} · até {fmtDate(row.window.end)}
            </Text>
          )}
          {row.warnings.length > 0 && (
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="yellow.8">
                {plural(row.warnings.length, 'aviso', 'avisos')}
              </Text>
              <InfoTip label={row.warnings.join(' ')} about="Avisos da sprint" width={300} />
            </Group>
          )}
        </>
      ) : (
        <Text size="sm" c="dimmed">
          fluxo contínuo
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
          Colunas
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Colunas da tabela</Menu.Label>
        <Stack gap={4} px="sm" pb="xs">
          {order.map((id, index) => {
            const column = COLUMNS.find((c) => c.id === id)!;
            return (
              <Group key={id} justify="space-between" wrap="nowrap">
                <Checkbox size="xs" label={column.label} checked={!hidden.includes(id)} onChange={() => toggle(id)} />
                <Group gap={2} wrap="nowrap">
                  <ActionIcon size="sm" variant="subtle" aria-label={`Mover ${column.label} para cima`} disabled={index === 0} onClick={() => move(id, -1)}>
                    <IconArrowUp size={12} />
                  </ActionIcon>
                  <ActionIcon size="sm" variant="subtle" aria-label={`Mover ${column.label} para baixo`} disabled={index === order.length - 1} onClick={() => move(id, 1)}>
                    <IconArrowDown size={12} />
                  </ActionIcon>
                </Group>
              </Group>
            );
          })}
        </Stack>
        <Menu.Divider />
        <Menu.Item onClick={() => onChange({})} closeMenuOnClick>
          Restaurar as colunas
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

/** RF-86: on a phone each board is a card; a nine-column table does not fit a thumb. */
function BoardCards({ rows, columns }: { rows: DashboardRow[]; columns: ColumnId[] }) {
  const { carry } = useFilters();
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
                    {COLUMNS.find((c) => c.id === id)!.label}
                    <InfoTip label={COLUMNS.find((c) => c.id === id)!.help} width={260} about={COLUMNS.find((c) => c.id === id)!.label} />
                  </Text>
                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>{cell(id, row)}</div>
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
  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap">
        <Text className="kpi-label">
          <Tipped help={HELP['tile:boards']}>Boards</Tipped>
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
                  <Table.Th>Board</Table.Th>
                  {columns.map((id) => (
                    <Table.Th key={id}>
                      {COLUMNS.find((c) => c.id === id)!.label}
                      <InfoTip label={COLUMNS.find((c) => c.id === id)!.help} width={280} about={COLUMNS.find((c) => c.id === id)!.label} />
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
                      columns.map((id) => <Table.Td key={id}>{cell(id, row, true)}</Table.Td>)
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
