import { ActionIcon, Button, Checkbox, ColorInput, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import type { Binding, CellScale } from '../../api/types';
import { COLUMN_LABELS } from './LayoutOptions';

const KINDS: { value: CellScale['kind']; label: string }[] = [
  { value: 'barra', label: 'Barra ▰▰▱' },
  { value: 'icone', label: 'Seta ▲●▼' },
  { value: 'cor', label: 'Escala de cor' },
];

const bare = (value: string) => value.replace(/^#/, '').toUpperCase();

/**
 * #18: a table column read as a quantity and drawn as one — a bar of five cells, an arrow, or a
 * fill between two colours. `layout.scale_marks` does the drawing for generation and the preview
 * alike; this only says which column and how. Min/max empty means the column's own range.
 */
export function ScalesEditor({ binding, onChange }: { binding: Binding; onChange: (b: Binding) => void }) {
  const scales = binding.scales ?? [];
  const columns = (binding.columns ?? []).map((key, index) => ({
    value: String(index),
    label: `${index + 1}. ${key ? (COLUMN_LABELS[key] ?? key) : '(vazia)'}`,
  }));
  const set = (next: CellScale[]) => onChange({ ...binding, scales: next });
  const patch = (index: number, change: Partial<CellScale>) => set(scales.map((s, i) => (i === index ? { ...s, ...change } : s)));
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        Só células que se leem como número recebem a marca; as demais ficam como estão. Barra e seta
        entram no texto da célula, a escala de cor pinta o fundo.
      </Text>
      {scales.map((scale, index) => (
        <Stack key={index} gap={4} p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
          <Group gap={4} wrap="nowrap">
            <Select
              size="xs"
              aria-label="Coluna"
              data={columns.length ? columns : [{ value: String(scale.column), label: `Coluna ${scale.column + 1}` }]}
              value={String(scale.column)}
              onChange={(v) => v !== null && patch(index, { column: Number(v) })}
              style={{ flex: 1 }}
            />
            <Select
              size="xs"
              aria-label="Tipo"
              data={KINDS}
              value={scale.kind}
              onChange={(v) => v && patch(index, { kind: v as CellScale['kind'] })}
              w={130}
            />
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => set(scales.filter((_, i) => i !== index))} aria-label="Remover escala">
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
          <Group gap={4} grow>
            <NumberInput size="xs" label="Mínimo" placeholder="da coluna" value={scale.min ?? ''} onChange={(v) => patch(index, { min: v === '' ? null : Number(v) })} />
            <NumberInput size="xs" label="Máximo" placeholder="da coluna" value={scale.max ?? ''} onChange={(v) => patch(index, { max: v === '' ? null : Number(v) })} />
          </Group>
          {scale.kind !== 'barra' && (
            <Checkbox
              size="xs"
              label="Menor é melhor (inverte seta e cor)"
              checked={Boolean(scale.inverted)}
              onChange={(e) => patch(index, { inverted: e.currentTarget.checked })}
            />
          )}
          {scale.kind === 'cor' && (
            <Group gap={4} grow>
              <ColorInput size="xs" label="Pior" value={`#${scale.low_color ?? 'F8D7DA'}`} onChange={(v) => patch(index, { low_color: bare(v) })} />
              <ColorInput size="xs" label="Melhor" value={`#${scale.high_color ?? 'D1E7DD'}`} onChange={(v) => patch(index, { high_color: bare(v) })} />
            </Group>
          )}
        </Stack>
      ))}
      <Button
        size="compact-xs"
        variant="light"
        leftSection={<IconPlus size={13} />}
        onClick={() => set([...scales, { column: Math.max(columns.length - 1, 0), kind: 'barra' }])}
      >
        Adicionar escala
      </Button>
    </Stack>
  );
}
