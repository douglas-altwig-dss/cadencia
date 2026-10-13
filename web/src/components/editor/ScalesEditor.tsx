import { ActionIcon, Button, Checkbox, ColorInput, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import type { Binding, CellScale } from '../../api/types';

import { useT } from '../../i18n';

const bare = (value: string) => value.replace(/^#/, '').toUpperCase();

/**
 * #18: a table column read as a quantity and drawn as one — a bar of five cells, an arrow, or a
 * fill between two colours. `layout.scale_marks` does the drawing for generation and the preview
 * alike; this only says which column and how. Min/max empty means the column's own range.
 */
export function ScalesEditor({ binding, onChange }: { binding: Binding; onChange: (b: Binding) => void }) {
  const t = useT();
  const kinds: { value: CellScale['kind']; label: string }[] = [
    { value: 'barra', label: t.editor.scales.bar },
    { value: 'icone', label: t.editor.scales.arrow },
    { value: 'cor', label: t.editor.scales.color },
  ];
  const scales = binding.scales ?? [];
  const columns = (binding.columns ?? []).map((key, index) => ({
    value: String(index),
    label: t.editor.scales.column(index + 1, key ? (t.editor.layout.columns[key] ?? key) : t.editor.scales.emptyColumn),
  }));
  const set = (next: CellScale[]) => onChange({ ...binding, scales: next });
  const patch = (index: number, change: Partial<CellScale>) => set(scales.map((s, i) => (i === index ? { ...s, ...change } : s)));
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t.editor.scales.hint}
      </Text>
      {scales.map((scale, index) => (
        <Stack key={index} gap={4} p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
          <Group gap={4} wrap="nowrap">
            <Select
              size="xs"
              aria-label={t.editor.scales.columnAria}
              data={columns.length ? columns : [{ value: String(scale.column), label: t.editor.scales.columnN(scale.column + 1) }]}
              value={String(scale.column)}
              onChange={(v) => v !== null && patch(index, { column: Number(v) })}
              style={{ flex: 1 }}
            />
            <Select
              size="xs"
              aria-label={t.editor.scales.kindAria}
              data={kinds}
              value={scale.kind}
              onChange={(v) => v && patch(index, { kind: v as CellScale['kind'] })}
              w={130}
            />
            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => set(scales.filter((_, i) => i !== index))} aria-label={t.editor.scales.removeAria}>
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
          <Group gap={4} grow>
            <NumberInput size="xs" label={t.editor.scales.min} placeholder={t.editor.scales.fromColumn} value={scale.min ?? ''} onChange={(v) => patch(index, { min: v === '' ? null : Number(v) })} />
            <NumberInput size="xs" label={t.editor.scales.max} placeholder={t.editor.scales.fromColumn} value={scale.max ?? ''} onChange={(v) => patch(index, { max: v === '' ? null : Number(v) })} />
          </Group>
          {scale.kind !== 'barra' && (
            <Checkbox
              size="xs"
              label={t.editor.scales.inverted}
              checked={Boolean(scale.inverted)}
              onChange={(e) => patch(index, { inverted: e.currentTarget.checked })}
            />
          )}
          {scale.kind === 'cor' && (
            <Group gap={4} grow>
              <ColorInput size="xs" label={t.editor.scales.worse} value={`#${scale.low_color ?? 'F8D7DA'}`} onChange={(v) => patch(index, { low_color: bare(v) })} />
              <ColorInput size="xs" label={t.editor.scales.better} value={`#${scale.high_color ?? 'D1E7DD'}`} onChange={(v) => patch(index, { high_color: bare(v) })} />
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
        {t.editor.scales.add}
      </Button>
    </Stack>
  );
}
