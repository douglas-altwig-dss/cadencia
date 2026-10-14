import { SimpleGrid, Skeleton } from '@mantine/core';

import type { DashboardRow } from '../../api/types';
import { useT } from '../../i18n';
import { sortBySpace } from '../../lib/boards';
import { BoardCard } from './BoardCard';

const COLS = { base: 1, sm: 2, lg: 3, xl: 4 };

/** One grid of every board, by space then board name (boards with no space last); each card names its space. */
export function BoardsGrid({ rows }: { rows: DashboardRow[] }) {
  const m = useT().tracking.boards;
  return (
    <SimpleGrid cols={COLS} spacing="md" verticalSpacing="md" component="section" aria-label={m.listAria}>
      {sortBySpace(rows).map((row) => (
        <BoardCard key={row.board.id} row={row} />
      ))}
    </SimpleGrid>
  );
}

/** Blocks at the cards' own size while the boards load, so nothing jumps when they arrive. */
export function BoardsSkeleton() {
  const m = useT().tracking.boards;
  return (
    <SimpleGrid cols={COLS} spacing="md" verticalSpacing="md" aria-busy="true" aria-label={m.loading}>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} h={256} radius="md" />
      ))}
    </SimpleGrid>
  );
}
