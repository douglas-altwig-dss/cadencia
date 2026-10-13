import { Button, Checkbox, Chip, ColorInput, Divider, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';

import type { CellStyle, TableEdit } from '../../api/types';
import type { EffectiveShape } from '../../lib/deckEdits';
import { cmToEmu, emuToCm } from '../../lib/emu';
import { useT } from '../../i18n';

const hex = (value: string) => value.replace('#', '').toUpperCase();

/**
 * RF-91: a table's own controls — column widths and cell styling — in the properties panel.
 *
 * Widths are absolute EMU and styles are per cell, so replaying them onto next week's table (with a
 * different number of rows) lands the same; a style addressed to a row the new table does not have
 * is reported at generation rather than guessed at. Cell *text* is still typed on the canvas.
 */
export function TablePanel({
  shape,
  edit,
  onChange,
}: {
  shape: EffectiveShape;
  edit?: TableEdit;
  onChange: (patch: { col_widths?: number[] | null; cells?: Record<string, CellStyle | null> }) => void;
}) {
  const t = useT();
  const table = shape.table!;
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);
  const [wholeRow, setWholeRow] = useState(false);
  const address = `${row}:${col}`;
  const current = edit?.cells?.[address] ?? {};
  const targets = wholeRow ? Array.from({ length: table.cols }, (_, c) => `${row}:${c}`) : [address];
  const style = (patch: CellStyle) => onChange({ cells: Object.fromEntries(targets.map((a) => [a, patch])) });

  return (
    <Stack gap="xs" p="sm">
      <Text size="xs" fw={600}>
        {t.editor.table.title(table.rows, table.cols)}
      </Text>
      {shape.bound && (
        <Text size="xs" c="dimmed">
          {t.editor.table.boundHint}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {t.editor.table.widths}
      </Text>
      <SimpleGrid cols={Math.min(table.cols, 4)} spacing={4}>
        {table.col_widths.map((width, index) => (
          <NumberInput
            key={index}
            size="xs"
            min={0.3}
            step={0.1}
            decimalScale={2}
            value={Number(emuToCm(width).toFixed(2))}
            aria-label={t.editor.table.widthAria(index + 1)}
            onChange={(value) => {
              const cm = Number(value);
              if (!cm || cm <= 0) return;
              const widths = [...table.col_widths];
              widths[index] = cmToEmu(cm);
              onChange({ col_widths: widths });
            }}
          />
        ))}
      </SimpleGrid>
      <Button size="compact-xs" variant="subtle" disabled={!edit?.col_widths} onClick={() => onChange({ col_widths: null })}>
        {t.editor.table.resetWidths}
      </Button>
      <Divider />
      <Group gap="xs" grow>
        <Select
          size="xs"
          label={t.editor.table.row}
          data={Array.from({ length: table.rows }, (_, r) => ({ value: String(r), label: r === 0 ? t.editor.table.headerRow : String(r + 1) }))}
          value={String(row)}
          onChange={(v) => v && setRow(Number(v))}
          allowDeselect={false}
        />
        <Select
          size="xs"
          label={t.editor.table.column}
          data={Array.from({ length: table.cols }, (_, c) => ({ value: String(c), label: String(c + 1) }))}
          value={String(col)}
          onChange={(v) => v && setCol(Number(v))}
          allowDeselect={false}
          disabled={wholeRow}
        />
      </Group>
      <Checkbox size="xs" label={t.editor.table.wholeRow} checked={wholeRow} onChange={(e) => setWholeRow(e.currentTarget.checked)} />
      <Text size="xs" c="dimmed" lineClamp={1}>
        {t.editor.table.currentText(table.cells[row]?.[col] || '—')}
      </Text>
      <ColorInput
        size="xs"
        label={t.editor.table.fill}
        format="hex"
        value={current.fill && current.fill !== 'none' ? `#${current.fill}` : ''}
        onChangeEnd={(value) => value && style({ fill: hex(value) })}
      />
      <ColorInput size="xs" label={t.editor.table.textColor} format="hex" value={current.color ? `#${current.color}` : ''} onChangeEnd={(value) => value && style({ color: hex(value) })} />
      <Group gap="xs" align="flex-end">
        <NumberInput size="xs" label={t.editor.table.size} min={6} max={96} value={current.size_pt ?? ''} onChange={(v) => v && style({ size_pt: Number(v) })} w={100} />
        <Chip size="xs" checked={Boolean(current.bold)} onChange={(on) => style({ bold: on })}>
          {t.editor.table.bold}
        </Chip>
        <Chip size="xs" checked={Boolean(current.italic)} onChange={(on) => style({ italic: on })}>
          {t.editor.table.italic}
        </Chip>
      </Group>
      <SegmentedControl
        size="xs"
        value={current.align ?? ''}
        onChange={(value) => style({ align: value as CellStyle['align'] })}
        data={[
          { value: 'left', label: t.editor.table.left },
          { value: 'center', label: t.editor.table.center },
          { value: 'right', label: t.editor.table.right },
        ]}
      />
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="light"
          onClick={() =>
            onChange({ cells: Object.fromEntries(Array.from({ length: table.cols }, (_, c) => [`0:${c}`, { fill: '0E5C5B', color: 'FFFFFF', bold: true }])) })
          }
        >
          {t.editor.table.highlightHeader}
        </Button>
        <Button size="compact-xs" variant="subtle" color="red" onClick={() => onChange({ cells: Object.fromEntries(targets.map((a) => [a, null])) })}>
          {t.editor.table.clearStyle}
        </Button>
      </Group>
    </Stack>
  );
}
