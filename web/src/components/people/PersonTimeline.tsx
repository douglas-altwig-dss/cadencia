import { Text } from '@mantine/core';

import type { PersonDetail } from '../../api/types';
import { useT } from '../../i18n';
import { HELP } from '../../lib/indicatorHelp';
import { WorkTimeline } from '../WorkTimeline';

/**
 * A person's last weeks on the sprint timeline's own component: the same summary and filters, search,
 * zoom, today, weekends, cursor, due marks, detail drawer and keyboard, over a period instead of a
 * sprint. Their items sit under their epics, and under one group per board when they work on several.
 */
export function PersonTimeline({ timeline }: { timeline: PersonDetail['timeline'] }) {
  const tt = useT().people.timeline;
  if (!timeline.nodes.length) {
    return (
      <Text size="sm" c="dimmed">
        {tt.empty}
      </Text>
    );
  }
  return (
    <WorkTimeline
      window={timeline.window}
      nodes={timeline.nodes}
      counts={timeline.counts}
      period={{ summaryTitle: tt.summaryTitle, summaryHelp: HELP['person:timeline'], none: tt.empty, listAria: tt.listAria, help: tt.help }}
    />
  );
}
