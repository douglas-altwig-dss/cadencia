import { Paper } from '@mantine/core';

import type { PersonIndicators } from '../../api/types';
import { PersonIndicatorBlocks } from './indicators';

/** The four groups a card shows, at a glance, above the person's tabs: the same layout as the card, in a row. */
export function PersonSummary({ indicators }: { indicators: PersonIndicators }) {
  return (
    <Paper withBorder p="md">
      <PersonIndicatorBlocks indicators={indicators} layout="row" />
    </Paper>
  );
}
