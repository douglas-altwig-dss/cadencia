import { Accordion, Group, MultiSelect, NumberInput, Select, Switch, TextInput } from '@mantine/core';

import type { Binding, BindingMode } from '../../api/types';
import { RULE_MODES, RulesEditor } from './RulesEditor';
import { ScalesEditor } from './ScalesEditor';
import { useT } from '../../i18n';

const LIST_MODES: BindingMode[] = ['bullet_list', 'inline_list', 'grouped_list', 'table_rows', 'grouped_rows'];
const TEXTY_MODES: BindingMode[] = ['text', 'number', 'status_text', 'bullet_list', 'inline_list', 'grouped_list'];

/**
 * RF-69: how a value is *shaped* before it reaches the area — sort, cap, clip, case, affixes,
 * number formats.
 *
 * This is the UI for `layout.py`, the pipeline every binding mode shares and that generation and
 * the preview both run. It used to live in the advanced mapping screen; when that screen was
 * deleted it moved here rather than being dropped, because the options stay in the saved mapping
 * and go on applying at generation — removing only the controls would have left settings nobody
 * could see or change.
 *
 * Every option defaults to "leave the template alone", so a binding that sets none of them behaves
 * exactly as it did before any of this existed.
 */
export function LayoutOptions({ binding, onChange }: { binding: Binding; onChange: (b: Binding) => void }) {
  const t = useT();
  const isList = LIST_MODES.includes(binding.mode);
  const isTexty = TEXTY_MODES.includes(binding.mode);
  const set = (patch: Partial<Binding>) => onChange({ ...binding, ...patch });

  return (
    <Accordion variant="contained" chevronPosition="left">
      <Accordion.Item value="forma">
        <Accordion.Control>
          <span style={{ fontSize: 'var(--mantine-font-size-xs)' }}>{t.editor.layout.shaping}</span>
        </Accordion.Control>
        <Accordion.Panel>
          <Group gap="xs" grow align="flex-start">
            {isList && (
              <Select
                label={t.editor.layout.sortBy}
                size="xs"
                data={Object.entries(t.editor.layout.sorts).map(([value, label]) => ({ value, label }))}
                value={binding.sort ?? 'modelo'}
                onChange={(value) => value && set({ sort: value as Binding['sort'] })}
                allowDeselect={false}
              />
            )}
            {isList && (
              <NumberInput
                label={t.editor.layout.maxItems}
                size="xs"
                min={1}
                value={binding.max_items ?? ''}
                onChange={(value) => set({ max_items: value === '' ? null : Number(value) })}
              />
            )}
          </Group>
          {isList && (
            <Switch
              mt="xs"
              size="xs"
              label={t.editor.layout.descending}
              checked={Boolean(binding.descending)}
              onChange={(event) => set({ descending: event.currentTarget.checked })}
            />
          )}
          {isList && (
            <MultiSelect
              mt="xs"
              label={t.editor.layout.onlyStatus}
              description={t.editor.layout.onlyStatusHint}
              size="xs"
              clearable
              data={Object.entries(t.editor.layout.statuses).map(([value, label]) => ({ value, label }))}
              value={binding.only_status ?? []}
              onChange={(value) => set({ only_status: value })}
            />
          )}
          {isTexty && (
            <Group gap="xs" grow mt="xs" align="flex-start">
              <NumberInput
                label={t.editor.layout.maxChars}
                description={t.editor.layout.maxCharsHint}
                size="xs"
                min={1}
                value={binding.max_chars ?? ''}
                onChange={(value) => set({ max_chars: value === '' ? null : Number(value) })}
              />
              <Select
                label={t.editor.layout.textCase}
                size="xs"
                data={Object.entries(t.editor.layout.cases).map(([value, label]) => ({ value, label }))}
                value={binding.text_case ?? 'original'}
                onChange={(value) => value && set({ text_case: value as Binding['text_case'] })}
                allowDeselect={false}
              />
            </Group>
          )}
          <Group gap="xs" grow mt="xs" align="flex-start">
            <TextInput
              label={t.editor.layout.prefix}
              size="xs"
              value={binding.prefix ?? ''}
              onChange={(event) => set({ prefix: event.currentTarget.value })}
            />
            <TextInput
              label={t.editor.layout.suffix}
              size="xs"
              value={binding.suffix ?? ''}
              onChange={(event) => set({ suffix: event.currentTarget.value })}
            />
          </Group>
          <TextInput
            mt="xs"
            label={t.editor.layout.emptyText}
            description={t.editor.layout.emptyTextHint}
            size="xs"
            value={binding.empty_text ?? ''}
            onChange={(event) => set({ empty_text: event.currentTarget.value })}
          />
          {binding.mode === 'inline_list' && (
            <TextInput
              mt="xs"
              label={t.editor.layout.separator}
              size="xs"
              value={binding.separator ?? ' · '}
              onChange={(event) => set({ separator: event.currentTarget.value })}
            />
          )}
          {binding.mode === 'bullet_list' && (
            <TextInput
              mt="xs"
              label={t.editor.layout.bullet}
              size="xs"
              value={binding.bullet ?? ''}
              onChange={(event) => set({ bullet: event.currentTarget.value })}
            />
          )}
          {binding.mode === 'number' && (
            <Group gap="xs" grow mt="xs" align="flex-start">
              <Select
                label={t.editor.layout.format}
                size="xs"
                data={Object.entries(t.editor.layout.numbers).map(([value, label]) => ({ value, label }))}
                value={binding.number_format ?? 'inteiro'}
                onChange={(value) => value && set({ number_format: value as Binding['number_format'] })}
                allowDeselect={false}
              />
              <NumberInput
                label={t.editor.layout.decimals}
                size="xs"
                min={0}
                max={4}
                value={binding.decimals ?? 1}
                onChange={(value) => set({ decimals: Number(value) || 0 })}
              />
            </Group>
          )}
          {isTexty && (
            <Group gap="xs" grow mt="xs" align="flex-start">
              <Select
                label={t.editor.layout.align}
                size="xs"
                data={Object.entries(t.editor.layout.aligns).map(([value, label]) => ({ value, label }))}
                value={binding.align ?? 'modelo'}
                onChange={(value) => value && set({ align: value as Binding['align'] })}
                allowDeselect={false}
              />
              <NumberInput
                label={t.editor.layout.textColumns}
                size="xs"
                min={1}
                max={4}
                value={binding.text_columns ?? 1}
                onChange={(value) => set({ text_columns: Number(value) || 1 })}
              />
            </Group>
          )}
          {isTexty && (
            <Switch
              mt="xs"
              size="xs"
              label={t.editor.layout.shrink}
              checked={Boolean(binding.shrink_to_fit)}
              onChange={(event) => set({ shrink_to_fit: event.currentTarget.checked })}
            />
          )}
        </Accordion.Panel>
      </Accordion.Item>
      {(binding.mode === 'table_rows' || binding.mode === 'grouped_rows') && (
        <Accordion.Item value="escalas">
          <Accordion.Control>{t.editor.layout.scales(binding.scales?.length ?? 0)}</Accordion.Control>
          <Accordion.Panel>
            <ScalesEditor binding={binding} onChange={onChange} />
          </Accordion.Panel>
        </Accordion.Item>
      )}
      {RULE_MODES.includes(binding.mode) && (
        <Accordion.Item value="regras">
          <Accordion.Control>{t.editor.layout.rules(binding.rules?.length ?? 0)}</Accordion.Control>
          <Accordion.Panel>
            <RulesEditor binding={binding} onChange={onChange} />
          </Accordion.Panel>
        </Accordion.Item>
      )}
    </Accordion>
  );
}
