import { Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/**
 * RF-106: the title bar above the ribbon — what used to be the Slides-style menu bar's top row
 * (RF-67/RF-101) before its tab strip moved into the ribbon itself. `right` carries only status
 * (save state, "modelo mudou"), never a command: a command belongs on the ribbon, where it can
 * carry a shortcut and sit beside the ones like it.
 */
export function DeckTitleBar({
  title,
  badge,
  right,
  leading,
}: {
  title: ReactNode;
  badge?: ReactNode;
  /** The few things that stay visible because they are status, not commands. */
  right?: ReactNode;
  /** The gallery's "back" arrow, before the title. */
  leading?: ReactNode;
}) {
  return (
    <Group gap={6} wrap="nowrap" align="center" px={8} py={4}>
      {leading}
      <Text size="sm" fw={600} lineClamp={1} maw={320}>
        {title}
      </Text>
      {badge}
      <div style={{ flex: 1 }} />
      {right}
    </Group>
  );
}
