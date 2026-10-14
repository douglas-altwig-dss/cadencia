import { Anchor, Flex, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';

import { useDashboard } from '../api/hooks';
import { BoardsGrid, BoardsSkeleton } from '../components/boards/BoardsGrid';
import { Empty, ErrorState, PageHeader } from '../components/common';
import { useT } from '../i18n';
import { filterBoards, kindCounts, kindFilterOf, type KindFilter } from '../lib/boards';
import { useFilters } from '../lib/filters';

/**
 * Every tracked board as a card, ordered by space, for quick access. The flow metrics that used to sit
 * below them are each board's own Flow tab now (and a space's, across its boards); `/flow` redirects
 * there. The board kind is `?kind=` so it is never mistaken for the work-item `type` filter.
 */
export function BoardsPage() {
  const t = useT();
  const m = t.tracking.boards;
  const { get, set } = useFilters();
  const dashboard = useDashboard();
  const [query, setQuery] = useState('');
  const kind = kindFilterOf(get('kind'));
  const rows = dashboard.data?.rows ?? [];
  const counts = kindCounts(rows);
  const shown = filterBoards(rows, kind, query);

  const kinds: KindFilter[] = ['all', 'scrum', 'kanban'];

  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} />
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
          {shown.length > 0 && <BoardsGrid rows={shown} />}
        </Stack>
      </Stack>
    </>
  );
}
