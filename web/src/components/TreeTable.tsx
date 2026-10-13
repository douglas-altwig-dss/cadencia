import { ActionIcon, Anchor, Group, Table, Text } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { createColumnHelper, createExpandedRowModel, rowExpandingFeature, tableFeatures, useTable } from '@tanstack/react-table';
import { useMemo } from 'react';
import { Link } from 'react-router';

import type { TreeNode } from '../api/types';
import { useFilters } from '../lib/filters';
import { fmtNum } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { IssueLink, ProgressBars, Tipped } from './common';
import { RiskBadge } from './risk';

const features = tableFeatures({ rowExpandingFeature, expandedRowModel: createExpandedRowModel() });
const helper = createColumnHelper<typeof features, TreeNode>();

/** RF-32: groupable tree (epic → item → subtask) with done / remaining / accumulated estimate. */
export function TreeTable({ nodes, boardId, sprintId }: { nodes: TreeNode[]; boardId: number; sprintId?: number }) {
  const { carry } = useFilters();

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('label', {
          id: 'item',
          header: 'Item',
          cell: ({ row }) => {
            const node = row.original;
            const epic = node.issue && node.issue.level >= 1;
            return (
              <Group gap={4} wrap="nowrap" style={{ paddingLeft: row.depth * 20 }}>
                {row.getCanExpand() ? (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={row.getToggleExpandedHandler()}
                    aria-label={row.getIsExpanded() ? `Recolher ${node.label}` : `Expandir ${node.label}`}
                    aria-expanded={row.getIsExpanded()}
                  >
                    {row.getIsExpanded() ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  </ActionIcon>
                ) : (
                  <span className="tree-toggle" />
                )}
                {node.issue && epic ? (
                  <Group gap={6} wrap="nowrap">
                    <Anchor
                      component={Link}
                      to={carry(`/boards/${boardId}/epics/${node.key}`, { sprint: sprintId ? String(sprintId) : undefined })}
                      fw={600}
                      className="mono"
                    >
                      {node.key}
                    </Anchor>
                    <Text size="sm" fw={600} lineClamp={1}>
                      {node.label}
                    </Text>
                  </Group>
                ) : node.issue ? (
                  <IssueLink issue={node.issue} />
                ) : (
                  <Text size="sm" fw={600} c={node.missing ? 'dimmed' : undefined}>
                    {node.label}
                  </Text>
                )}
              </Group>
            );
          },
        }),
        helper.accessor((n) => n.issue?.type ?? '', { id: 'type', header: 'Tipo' }),
        helper.accessor((n) => n.issue?.status ?? '', { id: 'status', header: 'Status' }),
        helper.accessor((n) => n.issue?.assignee ?? '', { id: 'assignee', header: 'Responsável' }),
        helper.display({
          id: 'risk',
          header: 'Situação',
          cell: ({ row }) => (row.original.risk ? <RiskBadge situation={row.original.risk.situation} size="xs" /> : null),
        }),
        helper.display({
          id: 'progress',
          header: () => <Tipped help={HELP['tree:done']}>Concluído / restante</Tipped>,
          cell: ({ row }) => (row.original.children.length ? <ProgressBars progress={row.original.progress} compact /> : null),
        }),
        helper.accessor((n) => n.estimate_rollup, {
          id: 'estimate',
          header: () => <Tipped help={HELP['tree:estimate']}>Estimativa acumulada</Tipped>,
          cell: (info) => <Text size="sm" className="num">{fmtNum(info.getValue())}</Text>,
        }),
      ]),
    [boardId, sprintId, carry],
  );

  const expanded = useMemo(() => Object.fromEntries(nodes.map((n) => [n.key, true])), [nodes]);
  const table = useTable({
    features,
    columns,
    data: nodes,
    getSubRows: (node) => (node.children.length ? node.children : undefined),
    getRowId: (node) => node.key,
    initialState: { expanded },
  });

  return (
    <Table.ScrollContainer minWidth={1000}>
      <Table highlightOnHover verticalSpacing={6}>
        <Table.Thead>
          {table.getHeaderGroups().map((group) => (
            <Table.Tr key={group.id}>
              {group.headers.map((header) => (
                <Table.Th key={header.id}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}</Table.Th>
              ))}
            </Table.Tr>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {table.getRowModel().rows.map((row) => (
            <Table.Tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <Table.Td key={cell.id}>
                  <table.FlexRender cell={cell} />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
