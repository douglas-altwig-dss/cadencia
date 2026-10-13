import { ColorInput, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';

import type { DeckPalette } from '../api/types';
import { currentLocale, t as messages, useT } from '../i18n';
import { bestText } from '../lib/contrast';

const STATUS_KEYS = ['concluido', 'em_dia', 'risco', 'atrasado'];

/**
 * The four deck statuses, in the order a semáforo reads. Each name is read in the current language
 * when it is read (a getter per key), so nothing holds a copy in the language of the first load.
 */
export const STATUS_NAMES: Readonly<Record<string, string>> = Object.defineProperties(
  {},
  Object.fromEntries(STATUS_KEYS.map((key) => [key, { enumerable: true, get: () => messages().shell.statusPalette.names[key] }])),
) as Record<string, string>;

/**
 * RF-62: the one place the status colours and words are configured.
 *
 * This form used to exist twice, byte for byte — once in the advanced mapping screen and once in
 * the deck rules — each writing to its own template's mapping. "The green" therefore meant
 * whatever the last person typed in whichever screen they happened to open. There is now a single
 * shared configuration in the variable manager, and a template overrides it only where its own
 * legend genuinely differs.
 */
export function StatusPalette({
  palette,
  labels,
  onChange,
  /** Colours inherited from the shared configuration, shown greyed behind an override. */
  inherited,
  columns = 2,
}: {
  palette: Record<string, string>;
  labels: Record<string, string>;
  onChange: (next: { palette?: Record<string, string>; status_labels?: Record<string, string> }) => void;
  inherited?: DeckPalette;
  columns?: number;
}) {
  const t = useT();
  const w = t.shell.statusPalette;
  return (
    <SimpleGrid cols={columns}>
      {Object.entries(STATUS_NAMES).map(([key, name]) => {
        const colour = palette[key] ?? inherited?.palette[key] ?? '';
        const overridden = Boolean(palette[key]);
        return (
          <Stack key={key} gap={4}>
            <ColorInput
              label={w.color(name)}
              format="hex"
              value={colour ? `#${colour}` : ''}
              onChange={(value) =>
                onChange({ palette: { ...palette, [key]: value.replace('#', '').toUpperCase() } })
              }
            />
            <TextInput
              label={w.label(name)}
              value={labels[key] ?? inherited?.status_labels[key] ?? ''}
              onChange={(event) => onChange({ status_labels: { ...labels, [key]: event.currentTarget.value } })}
            />
            {colour && bestText(colour).ratio < 4.5 && (
              <Text size="xs" c="orange.8">
                {w.lowContrast(bestText(colour).ratio.toLocaleString(currentLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}
              </Text>
            )}
            {inherited && !overridden && (
              <Text size="xs" c="dimmed">
                {w.inherited}
              </Text>
            )}
          </Stack>
        );
      })}
    </SimpleGrid>
  );
}

/** A row of swatches, for showing the configuration without offering to change it. */
export function StatusLegend({ palette, labels }: { palette: Record<string, string>; labels: Record<string, string> }) {
  return (
    <Group gap="sm">
      {Object.entries(STATUS_NAMES).map(([key, name]) => (
        <Group key={key} gap={4} wrap="nowrap">
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: `#${palette[key] ?? 'CCCCCC'}`,
              border: '1px solid var(--mantine-color-default-border)',
            }}
          />
          <Text size="xs">{labels[key] || name}</Text>
        </Group>
      ))}
    </Group>
  );
}
