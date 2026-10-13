import { ActionIcon, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconPhoto } from '@tabler/icons-react';

import { useT } from '../../i18n';

/**
 * RF-68/RF-109: the thumbnail panel's header, and the whole of it when collapsed.
 *
 * Collapsed, the icon and the label both run along the strip's own axis — vertical text
 * (`writing-mode: vertical-rl`, the same construct a book's spine or a browser's vertical tab
 * uses) rather than a word squeezed sideways, which is what lets the strip itself go narrow
 * instead of merely hiding its content at the same width.
 */
export function RailHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT();
  if (collapsed) {
    return (
      <Tooltip label={t.editor.railHeader.expandTip} position="right">
        <UnstyledButton onClick={onToggle} w="100%" h="100%" py={10} aria-label={t.editor.railHeader.expandAria}>
          <Stack align="center" justify="center" gap={8} h="100%">
            <IconPhoto size={15} />
            <Text size="xs" fw={600} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
              {t.editor.railHeader.thumbnails}
            </Text>
          </Stack>
        </UnstyledButton>
      </Tooltip>
    );
  }
  return (
    <Group gap={6} wrap="nowrap" px={6} py={4} justify="space-between">
      <Group gap={6} wrap="nowrap">
        <IconPhoto size={15} />
        <Text size="xs" fw={600}>
          {t.editor.railHeader.thumbnails}
        </Text>
      </Group>
      <Tooltip label={t.editor.railHeader.collapseTip}>
        <ActionIcon size="sm" variant="subtle" aria-label={t.editor.railHeader.collapseAria} onClick={onToggle}>
          <IconLayoutSidebarLeftCollapse size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
