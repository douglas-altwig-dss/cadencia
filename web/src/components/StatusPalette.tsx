import { ColorInput, Group, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';

import type { DeckPalette } from '../api/types';
import { bestText } from '../lib/contrast';

/** The four deck statuses, in the order a semáforo reads. */
export const STATUS_NAMES: Record<string, string> = {
  concluido: 'Concluído',
  em_dia: 'Em dia',
  risco: 'Em risco',
  atrasado: 'Atrasado',
};

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
  return (
    <SimpleGrid cols={columns}>
      {Object.entries(STATUS_NAMES).map(([key, name]) => {
        const colour = palette[key] ?? inherited?.palette[key] ?? '';
        const overridden = Boolean(palette[key]);
        return (
          <Stack key={key} gap={4}>
            <ColorInput
              label={`Cor: ${name}`}
              format="hex"
              value={colour ? `#${colour}` : ''}
              onChange={(value) =>
                onChange({ palette: { ...palette, [key]: value.replace('#', '').toUpperCase() } })
              }
            />
            <TextInput
              label={`Rótulo: ${name}`}
              value={labels[key] ?? inherited?.status_labels[key] ?? ''}
              onChange={(event) => onChange({ status_labels: { ...labels, [key]: event.currentTarget.value } })}
            />
            {colour && bestText(colour).ratio < 4.5 && (
              <Text size="xs" c="orange.8">
                Contraste baixo: o texto mais legível sobre esta cor fica em {bestText(colour).ratio.toFixed(1)}:1 (o mínimo recomendado é 4,5:1).
              </Text>
            )}
            {inherited && !overridden && (
              <Text size="xs" c="dimmed">
                herdado da configuração comum
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
