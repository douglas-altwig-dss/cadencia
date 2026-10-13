import { ActionIcon, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconAdjustments, IconLayoutSidebarRightCollapse } from '@tabler/icons-react';

import { useT } from '../../i18n';

/**
 * RF-108/RF-109: the right rail's header, and the whole of it when collapsed — the same shape as
 * the filmstrip's own `RailHeader` (RF-68), mirrored for the edge it sits on. Collapsed, the icon
 * and the label both run along the strip's own axis (`writing-mode: vertical-rl`) rather than a
 * word squeezed sideways, which is what lets the strip go narrow instead of merely hiding its
 * content at the same width.
 */
export function PropertiesHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useT();
  if (collapsed) {
    return (
      <Tooltip label={t.editor.propertiesHeader.expandTip} position="left">
        <UnstyledButton onClick={onToggle} w="100%" h="100%" py={10} aria-label={t.editor.propertiesHeader.expandAria}>
          <Stack align="center" justify="center" gap={8} h="100%">
            <IconAdjustments size={15} />
            <Text size="xs" fw={600} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
              {t.editor.propertiesHeader.panel}
            </Text>
          </Stack>
        </UnstyledButton>
      </Tooltip>
    );
  }
  return (
    <Group gap={6} wrap="nowrap" px={6} py={4} justify="space-between">
      <Group gap={6} wrap="nowrap">
        <IconAdjustments size={15} />
        <Text size="xs" fw={600}>
          {t.editor.propertiesHeader.panel}
        </Text>
      </Group>
      <Tooltip label={t.editor.propertiesHeader.collapseTip}>
        <ActionIcon size="sm" variant="subtle" aria-label={t.editor.propertiesHeader.collapseAria} onClick={onToggle}>
          <IconLayoutSidebarRightCollapse size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
