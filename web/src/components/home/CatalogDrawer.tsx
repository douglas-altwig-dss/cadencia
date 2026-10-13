import { Drawer, Group, Stack, Switch, Text, Title } from '@mantine/core';

import { useT } from '../../i18n';
import { CATALOG, GROUP_LABELS, hasTile, toggleTile, type TileGroup, type TileState } from '../../lib/mosaic';

/** Every tile that can be on the Home page, by what it is about; a switch puts it on or takes it off. */
export function CatalogDrawer({
  opened,
  onClose,
  tiles,
  onChange,
}: {
  opened: boolean;
  onClose: () => void;
  tiles: TileState[];
  onChange: (next: TileState[]) => void;
}) {
  const groups = Object.keys(GROUP_LABELS) as TileGroup[];
  const m = useT().tracking.home;
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title={m.catalogTitle}>
      <Stack gap="lg">
        <Text size="sm" c="dimmed">
          {m.catalogIntro}
        </Text>
        {groups.map((group) => (
          <Stack key={group} gap="sm">
            <Title order={6}>{GROUP_LABELS[group]}</Title>
            {CATALOG.filter((e) => e.group === group).map((entry) => (
              <Group key={entry.type} justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500}>
                    {entry.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {entry.description}
                  </Text>
                </div>
                <Switch
                  aria-label={entry.label}
                  checked={hasTile(tiles, entry.type)}
                  onChange={() => onChange(toggleTile(tiles, entry.type))}
                />
              </Group>
            ))}
          </Stack>
        ))}
        {tiles.some((t) => !CATALOG.some((e) => e.type === t.type)) && (
          <Text size="xs" c="dimmed">
            {m.catalogNewer}
          </Text>
        )}
      </Stack>
    </Drawer>
  );
}
