import { Accordion, Group, MultiSelect, NumberInput, Select, Switch, TextInput } from '@mantine/core';

import type { Binding, BindingMode } from '../../api/types';
import { RULE_MODES, RulesEditor } from './RulesEditor';
import { ScalesEditor } from './ScalesEditor';

export const COLUMN_LABELS: Record<string, string> = {
  sprint: 'Sprint',
  chave: 'Chave',
  resumo: 'Resumo',
  responsavel: 'Responsável',
  acao: 'Ação / evidência',
  prazo: 'Prazo',
  situacao: 'Situação',
  epico: 'Épico',
  tipo: 'Tipo',
  estimativa: 'Estimativa',
  status: 'Status no board',
  dias_parado: 'Dias parado',
  cycle_time: 'Cycle time',
};
const SORT_LABELS: Record<string, string> = {
  modelo: 'Ordem do board',
  chave: 'Chave',
  resumo: 'Resumo (A–Z)',
  responsavel: 'Responsável',
  prazo: 'Prazo',
  situacao: 'Situação',
  epico: 'Épico',
  estimativa: 'Estimativa',
};
const CASE_LABELS: Record<string, string> = {
  original: 'Como veio',
  maiuscula: 'MAIÚSCULAS',
  minuscula: 'minúsculas',
  capitular: 'Primeira maiúscula',
};
const ALIGN_LABELS: Record<string, string> = {
  modelo: 'Do modelo',
  esquerda: 'À esquerda',
  centro: 'Centralizado',
  direita: 'À direita',
  justificado: 'Justificado',
};
const NUMBER_LABELS: Record<string, string> = {
  inteiro: 'Inteiro (7)',
  decimal: 'Decimal (7,5)',
  percentual: 'Percentual (75%)',
  percentual_decimal: 'Percentual com decimal (75,4%)',
  moeda: 'Moeda (R$ 7,50)',
};
const STATUS_LABELS: Record<string, string> = {
  concluido: 'Concluído',
  em_dia: 'Em dia',
  risco: 'Em risco',
  atrasado: 'Atrasado',
};
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
  const isList = LIST_MODES.includes(binding.mode);
  const isTexty = TEXTY_MODES.includes(binding.mode);
  const set = (patch: Partial<Binding>) => onChange({ ...binding, ...patch });

  return (
    <Accordion variant="contained" chevronPosition="left">
      <Accordion.Item value="forma">
        <Accordion.Control>
          <span style={{ fontSize: 'var(--mantine-font-size-xs)' }}>Como o valor é preparado</span>
        </Accordion.Control>
        <Accordion.Panel>
          <Group gap="xs" grow align="flex-start">
            {isList && (
              <Select
                label="Ordenar por"
                size="xs"
                data={Object.entries(SORT_LABELS).map(([value, label]) => ({ value, label }))}
                value={binding.sort ?? 'modelo'}
                onChange={(value) => value && set({ sort: value as Binding['sort'] })}
                allowDeselect={false}
              />
            )}
            {isList && (
              <NumberInput
                label="Máximo de itens"
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
              label="Do maior para o menor"
              checked={Boolean(binding.descending)}
              onChange={(event) => set({ descending: event.currentTarget.checked })}
            />
          )}
          {isList && (
            <MultiSelect
              mt="xs"
              label="Só estas situações"
              description="vazio = todas"
              size="xs"
              clearable
              data={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              value={binding.only_status ?? []}
              onChange={(value) => set({ only_status: value })}
            />
          )}
          {isTexty && (
            <Group gap="xs" grow mt="xs" align="flex-start">
              <NumberInput
                label="Cortar em N caracteres"
                description="com reticências"
                size="xs"
                min={1}
                value={binding.max_chars ?? ''}
                onChange={(value) => set({ max_chars: value === '' ? null : Number(value) })}
              />
              <Select
                label="Caixa"
                size="xs"
                data={Object.entries(CASE_LABELS).map(([value, label]) => ({ value, label }))}
                value={binding.text_case ?? 'original'}
                onChange={(value) => value && set({ text_case: value as Binding['text_case'] })}
                allowDeselect={false}
              />
            </Group>
          )}
          <Group gap="xs" grow mt="xs" align="flex-start">
            <TextInput
              label="Antes"
              size="xs"
              value={binding.prefix ?? ''}
              onChange={(event) => set({ prefix: event.currentTarget.value })}
            />
            <TextInput
              label="Depois"
              size="xs"
              value={binding.suffix ?? ''}
              onChange={(event) => set({ suffix: event.currentTarget.value })}
            />
          </Group>
          <TextInput
            mt="xs"
            label="Quando não houver nada"
            description="escrito no lugar de deixar a área em branco"
            size="xs"
            value={binding.empty_text ?? ''}
            onChange={(event) => set({ empty_text: event.currentTarget.value })}
          />
          {binding.mode === 'inline_list' && (
            <TextInput
              mt="xs"
              label="Separador"
              size="xs"
              value={binding.separator ?? ' · '}
              onChange={(event) => set({ separator: event.currentTarget.value })}
            />
          )}
          {binding.mode === 'bullet_list' && (
            <TextInput
              mt="xs"
              label="Marcador antes de cada item"
              size="xs"
              value={binding.bullet ?? ''}
              onChange={(event) => set({ bullet: event.currentTarget.value })}
            />
          )}
          {binding.mode === 'number' && (
            <Group gap="xs" grow mt="xs" align="flex-start">
              <Select
                label="Formato"
                size="xs"
                data={Object.entries(NUMBER_LABELS).map(([value, label]) => ({ value, label }))}
                value={binding.number_format ?? 'inteiro'}
                onChange={(value) => value && set({ number_format: value as Binding['number_format'] })}
                allowDeselect={false}
              />
              <NumberInput
                label="Casas decimais"
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
                label="Alinhamento"
                size="xs"
                data={Object.entries(ALIGN_LABELS).map(([value, label]) => ({ value, label }))}
                value={binding.align ?? 'modelo'}
                onChange={(value) => value && set({ align: value as Binding['align'] })}
                allowDeselect={false}
              />
              <NumberInput
                label="Colunas de texto"
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
              label="Encolher a fonte para caber"
              checked={Boolean(binding.shrink_to_fit)}
              onChange={(event) => set({ shrink_to_fit: event.currentTarget.checked })}
            />
          )}
        </Accordion.Panel>
      </Accordion.Item>
      {(binding.mode === 'table_rows' || binding.mode === 'grouped_rows') && (
        <Accordion.Item value="escalas">
          <Accordion.Control>Barras e escalas nas colunas{binding.scales?.length ? ` (${binding.scales.length})` : ''}</Accordion.Control>
          <Accordion.Panel>
            <ScalesEditor binding={binding} onChange={onChange} />
          </Accordion.Panel>
        </Accordion.Item>
      )}
      {RULE_MODES.includes(binding.mode) && (
        <Accordion.Item value="regras">
          <Accordion.Control>Formatação condicional{binding.rules?.length ? ` (${binding.rules.length})` : ''}</Accordion.Control>
          <Accordion.Panel>
            <RulesEditor binding={binding} onChange={onChange} />
          </Accordion.Panel>
        </Accordion.Item>
      )}
    </Accordion>
  );
}
