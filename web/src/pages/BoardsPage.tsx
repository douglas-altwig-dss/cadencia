import { Anchor, Flex, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useDashboard } from '../api/hooks';
import { BoardsGrid, BoardsSkeleton } from '../components/boards/BoardsGrid';
import { FLOW_ANCHOR, FlowSection } from '../components/boards/FlowSection';
import { Empty, ErrorState, ExportMenu, PageHeader } from '../components/common';
import { useT } from '../i18n';
import { filterBoards, kindCounts, kindFilterOf, type KindFilter } from '../lib/boards';
import { useFilters } from '../lib/filters';

/**
 * Every tracked board as a card, grouped by space, for quick access — then the flow metrics, which
 * used to be a page of their own (`/flow` now redirects to `#flow` here). The board kind is `?kind=`
 * so it is never mistaken for the work-item `type` filter the flow metrics read.
 */
export function BoardsPage() {
  const t = useT();
  const m = t.tracking.boards;
  const { params, get, set } = useFilters();
  const navigate = useNavigate();
  const dashboard = useDashboard();
  const [query, setQuery] = useState('');
  const kind = kindFilterOf(get('kind'));
  const rows = dashboard.data?.rows ?? [];
  const counts = kindCounts(rows);
  const shown = filterBoards(rows, kind, query);

  /** A card's "Flow metrics": the section below, for that board alone, scrolled into view. */
  const showFlow = (boardId: number) => {
    const next = new URLSearchParams(params);
    next.set('board', String(boardId));
    navigate({ search: `?${next.toString()}`, hash: `#${FLOW_ANCHOR}` }, { replace: true, preventScrollReset: true });
  };

  const kinds: KindFilter[] = ['all', 'scrum', 'kanban'];

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <ExportMenu
            label={t.tracking.flow.exportItems}
            dataset="flow"
            params={{ board_id: get('board'), type: get('type'), start: get('start'), end: get('end') }}
          />
        }
      />
      <Stack gap="xl">
        <Stack gap="md">
          {rows.length > 0 && (
            <Flex gap="sm" direction={{ base: 'column', sm: 'row' }} align={{ base: 'stretch', sm: 'center' }} justify="space-between">
              <SegmentedControl
                aria-label={m.kindAria}
                value={kind}
                onChange={(value) => set({ kind: value === 'all' ? undefined : value })}
                data={kinds.map((value) => ({
                  value,
                  label: (
                    <span className="nowrap">
                      {m.kinds[value]}{' '}
                      <Text span size="xs" c="dimmed" className="num">
                        {counts[value]}
                      </Text>
                    </span>
                  ),
                }))}
              />
              <TextInput
                aria-label={m.search}
                placeholder={m.search}
                leftSection={<IconSearch size={16} aria-hidden />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                w={{ base: '100%', sm: 300 }}
              />
            </Flex>
          )}
          {dashboard.isLoading && <BoardsSkeleton />}
          {dashboard.error && <ErrorState error={dashboard.error} />}
          {dashboard.data && rows.length === 0 && (
            <Empty title={m.emptyTitle} action={{ label: m.emptyAction, to: '/settings?tab=boards' }}>
              {m.emptyBody}
            </Empty>
          )}
          {rows.length > 0 && shown.length === 0 && (
            <Text size="sm" c="dimmed">
              {m.noMatch}{' '}
              <Anchor
                component="button"
                type="button"
                size="sm"
                onClick={() => {
                  setQuery('');
                  set({ kind: undefined });
                }}
              >
                {m.clearFilters}
              </Anchor>
            </Text>
          )}
          {shown.length > 0 && <BoardsGrid rows={shown} onFlow={showFlow} />}
        </Stack>
        <FlowSection ready={!dashboard.isLoading} />
      </Stack>
    </>
  );
}
