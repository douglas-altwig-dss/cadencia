import { ActionIcon, Button, Checkbox, ColorInput, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import type { Binding, FormatCondition, FormatRule, RuleOp } from '../../api/types';

import { useT } from '../../i18n';

const OPS: { value: RuleOp; needsValue: boolean }[] = [
  { value: 'maior', needsValue: true },
  { value: 'maior_igual', needsValue: true },
  { value: 'menor', needsValue: true },
  { value: 'menor_igual', needsValue: true },
  { value: 'igual', needsValue: true },
  { value: 'diferente', needsValue: true },
  { value: 'contem', needsValue: true },
  { value: 'vazio', needsValue: false },
  { value: 'nao_vazio', needsValue: false },
];

const TABLE_MODES = ['table_rows', 'grouped_rows'];
export const RULE_MODES = ['text', 'number', 'status_text', ...TABLE_MODES];

/**
 * RF-92: conditional formatting — "quando o valor for maior que 80, pinte de vermelho". Rules read
 * the value the way the slide shows it ("85%" is 85) and the first match wins, in the generator and
 * in the preview alike, because both call the same `layout.rule_matches`.
 */
export function RulesEditor({ binding, onChange }: { binding: Binding; onChange: (b: Binding) => void }) {
  const t = useT();
  const opOptions = OPS.map(({ value }) => ({ value, label: t.editor.rules.ops[value] }));
  const rules = binding.rules ?? [];
  const table = TABLE_MODES.includes(binding.mode);
  const set = (next: FormatRule[]) => onChange({ ...binding, rules: next });
  const patch = (index: number, change: Partial<FormatRule>) => set(rules.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const patchAlso = (index: number, also: FormatCondition[]) => patch(index, { also });
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        {t.editor.rules.hint}
      </Text>
      {rules.map((rule, index) => {
        const op = OPS.find((o) => o.value === rule.when);
        return (
          <Stack key={index} gap={4} p={6} style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 4 }}>
            <Group gap={4} wrap="nowrap">
              {table && (
                <NumberInput
                  size="xs"
                  w={70}
                  min={1}
                  placeholder={t.editor.rules.columnPlaceholder}
                  aria-label={t.editor.rules.columnAria}
                  value={rule.column != null ? rule.column + 1 : ''}
                  onChange={(v) => patch(index, { column: v === '' ? null : Number(v) - 1 })}
                />
              )}
              <Select size="xs" data={opOptions} value={rule.when} onChange={(v) => v && patch(index, { when: v as RuleOp })} allowDeselect={false} style={{ flex: 1 }} aria-label={t.editor.rules.conditionAria} />
              {op?.needsValue && <TextInput size="xs" w={80} value={rule.value} onChange={(e) => patch(index, { value: e.currentTarget.value })} aria-label={t.editor.rules.valueAria} />}
              <ActionIcon size="sm" variant="subtle" color="red" aria-label={t.editor.rules.removeAria} onClick={() => set(rules.filter((_, i) => i !== index))}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
            <Group gap={4} wrap="nowrap">
              <ColorInput size="xs" format="hex" value={`#${rule.color}`} onChangeEnd={(v) => patch(index, { color: v.replace('#', '').toUpperCase() })} w={120} aria-label={t.editor.rules.colorAria} />
              <Select
                size="xs"
                data={[
                  { value: 'texto', label: t.editor.rules.onText },
                  { value: 'preenchimento', label: table ? t.editor.rules.onCell : t.editor.rules.onShape },
                ]}
                value={rule.apply}
                onChange={(v) => v && patch(index, { apply: v as FormatRule['apply'] })}
                allowDeselect={false}
                style={{ flex: 1 }}
                aria-label={t.editor.rules.whereAria}
              />
            </Group>
            {table && <Checkbox size="xs" label={t.editor.rules.wholeRow} checked={Boolean(rule.whole_row)} onChange={(e) => patch(index, { whole_row: e.currentTarget.checked })} />}
            {table && (
              <Stack gap={4} pl="md" style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}>
                {(rule.also ?? []).map((cond, ci) => {
                  const condOp = OPS.find((o) => o.value === cond.when);
                  const patchCond = (change: Partial<FormatCondition>) =>
                    patchAlso(index, (rule.also ?? []).map((c, i) => (i === ci ? { ...c, ...change } : c)));
                  return (
                    <Group key={ci} gap={4} wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {t.editor.rules.and}
                      </Text>
                      <NumberInput
                        size="xs"
                        w={70}
                        min={1}
                        placeholder={t.editor.rules.columnPlaceholder}
                        aria-label={t.editor.rules.extraColumnAria}
                        value={cond.column != null ? cond.column + 1 : ''}
                        onChange={(v) => patchCond({ column: v === '' ? null : Number(v) - 1 })}
                      />
                      <Select size="xs" data={opOptions} value={cond.when} onChange={(v) => v && patchCond({ when: v as RuleOp })} allowDeselect={false} style={{ flex: 1 }} aria-label={t.editor.rules.extraConditionAria} />
                      {condOp?.needsValue && <TextInput size="xs" w={80} value={cond.value} onChange={(e) => patchCond({ value: e.currentTarget.value })} aria-label={t.editor.rules.extraValueAria} />}
                      <ActionIcon size="sm" variant="subtle" color="red" aria-label={t.editor.rules.removeConditionAria} onClick={() => patchAlso(index, (rule.also ?? []).filter((_, i) => i !== ci))}>
                        <IconTrash size={13} />
                      </ActionIcon>
                    </Group>
                  );
                })}
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconPlus size={13} />}
                  onClick={() => patchAlso(index, [...(rule.also ?? []), { when: 'nao_vazio', value: '', column: 0 }])}
                >
                  {t.editor.rules.andAlso}
                </Button>
              </Stack>
            )}
          </Stack>
        );
      })}
      <Button
        size="compact-xs"
        variant="light"
        leftSection={<IconPlus size={13} />}
        onClick={() => set([...rules, { when: 'maior', value: '', color: 'C00000', apply: 'texto', column: table ? (binding.status_column ?? 0) : null, whole_row: false }])}
      >
        {t.editor.rules.add}
      </Button>
    </Stack>
  );
}
