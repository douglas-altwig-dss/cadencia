import { ActionIcon, Button, Checkbox, ColorInput, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import type { Binding, FormatCondition, FormatRule, RuleOp } from '../../api/types';

const OPS: { value: RuleOp; label: string; needsValue: boolean }[] = [
  { value: 'maior', label: 'maior que', needsValue: true },
  { value: 'maior_igual', label: 'maior ou igual a', needsValue: true },
  { value: 'menor', label: 'menor que', needsValue: true },
  { value: 'menor_igual', label: 'menor ou igual a', needsValue: true },
  { value: 'igual', label: 'igual a', needsValue: true },
  { value: 'diferente', label: 'diferente de', needsValue: true },
  { value: 'contem', label: 'contém', needsValue: true },
  { value: 'vazio', label: 'está vazio', needsValue: false },
  { value: 'nao_vazio', label: 'não está vazio', needsValue: false },
];

const TABLE_MODES = ['table_rows', 'grouped_rows'];
export const RULE_MODES = ['text', 'number', 'status_text', ...TABLE_MODES];

/**
 * RF-92: conditional formatting — "quando o valor for maior que 80, pinte de vermelho". Rules read
 * the value the way the slide shows it ("85%" is 85) and the first match wins, in the generator and
 * in the preview alike, because both call the same `layout.rule_matches`.
 */
export function RulesEditor({ binding, onChange }: { binding: Binding; onChange: (b: Binding) => void }) {
  const rules = binding.rules ?? [];
  const table = TABLE_MODES.includes(binding.mode);
  const set = (next: FormatRule[]) => onChange({ ...binding, rules: next });
  const patch = (index: number, change: Partial<FormatRule>) => set(rules.map((r, i) => (i === index ? { ...r, ...change } : r)));
  const patchAlso = (index: number, also: FormatCondition[]) => patch(index, { also });
  return (
    <Stack gap="xs">
      <Text size="xs" c="dimmed">
        A primeira regra que combinar vence. Números podem ser comparados como aparecem no slide (85%, R$ 1.200,00).
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
                  placeholder="col."
                  aria-label="Coluna testada"
                  value={rule.column != null ? rule.column + 1 : ''}
                  onChange={(v) => patch(index, { column: v === '' ? null : Number(v) - 1 })}
                />
              )}
              <Select size="xs" data={OPS.map(({ value, label }) => ({ value, label }))} value={rule.when} onChange={(v) => v && patch(index, { when: v as RuleOp })} allowDeselect={false} style={{ flex: 1 }} aria-label="Condição" />
              {op?.needsValue && <TextInput size="xs" w={80} value={rule.value} onChange={(e) => patch(index, { value: e.currentTarget.value })} aria-label="Valor" />}
              <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remover regra" onClick={() => set(rules.filter((_, i) => i !== index))}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
            <Group gap={4} wrap="nowrap">
              <ColorInput size="xs" format="hex" value={`#${rule.color}`} onChangeEnd={(v) => patch(index, { color: v.replace('#', '').toUpperCase() })} w={120} aria-label="Cor" />
              <Select
                size="xs"
                data={[
                  { value: 'texto', label: 'no texto' },
                  { value: 'preenchimento', label: table ? 'no fundo da célula' : 'no fundo da forma' },
                ]}
                value={rule.apply}
                onChange={(v) => v && patch(index, { apply: v as FormatRule['apply'] })}
                allowDeselect={false}
                style={{ flex: 1 }}
                aria-label="Onde aplicar"
              />
            </Group>
            {table && <Checkbox size="xs" label="Pintar a linha inteira" checked={Boolean(rule.whole_row)} onChange={(e) => patch(index, { whole_row: e.currentTarget.checked })} />}
            {table && (
              <Stack gap={4} pl="md" style={{ borderLeft: '2px solid var(--mantine-color-default-border)' }}>
                {(rule.also ?? []).map((cond, ci) => {
                  const condOp = OPS.find((o) => o.value === cond.when);
                  const patchCond = (change: Partial<FormatCondition>) =>
                    patchAlso(index, (rule.also ?? []).map((c, i) => (i === ci ? { ...c, ...change } : c)));
                  return (
                    <Group key={ci} gap={4} wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        E
                      </Text>
                      <NumberInput
                        size="xs"
                        w={70}
                        min={1}
                        placeholder="col."
                        aria-label="Coluna da condição adicional"
                        value={cond.column != null ? cond.column + 1 : ''}
                        onChange={(v) => patchCond({ column: v === '' ? null : Number(v) - 1 })}
                      />
                      <Select size="xs" data={OPS.map(({ value, label }) => ({ value, label }))} value={cond.when} onChange={(v) => v && patchCond({ when: v as RuleOp })} allowDeselect={false} style={{ flex: 1 }} aria-label="Condição adicional" />
                      {condOp?.needsValue && <TextInput size="xs" w={80} value={cond.value} onChange={(e) => patchCond({ value: e.currentTarget.value })} aria-label="Valor da condição adicional" />}
                      <ActionIcon size="sm" variant="subtle" color="red" aria-label="Remover condição" onClick={() => patchAlso(index, (rule.also ?? []).filter((_, i) => i !== ci))}>
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
                  E também…
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
        Adicionar regra
      </Button>
    </Stack>
  );
}
