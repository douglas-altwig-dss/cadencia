import { ActionIcon, Badge, Group, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconDatabase, IconSearch, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import type { CatalogField, FieldKind } from '../api/types';

/** #17: which fields someone pins for quick access, per browser — the catalogue can grow past a
 * screenful once a few templates are wired up, and scrolling the same list every time is the cost
 * this saves. */
function useFavoriteFields() {
  const [favorites, setFavorites] = useLocalStorage<string[]>({ key: 'cadencia-campos-favoritos', defaultValue: [] });
  const toggle = (key: string) =>
    setFavorites((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  return [favorites, toggle] as const;
}

/** What each kind can actually do, in the words the field picker used to carry. */
export const KIND_LABEL: Record<FieldKind, string> = {
  text: 'texto',
  number: 'número',
  groups: 'lista agrupada',
  rows: 'linhas',
  row_groups: 'linhas agrupadas',
  status: 'semáforo',
  series: 'série (gráfico)',
};

/** Binding modes a field of each kind can fill — the rule the old picker applied by filtering. */
export const MODE_KINDS: Record<string, FieldKind[]> = {
  text: ['text', 'status', 'number'],
  number: ['number', 'text', 'rows', 'groups', 'row_groups'],
  status_text: ['status'],
  bullet_list: ['groups', 'rows', 'row_groups'],
  inline_list: ['groups', 'rows', 'row_groups'],
  grouped_list: ['groups'],
  table_rows: ['rows'],
  grouped_rows: ['row_groups'],
  status_fill: ['status'],
  chart: ['series'],
  // RF-63: a value a slide carries as a picture — a link to scan, an id to hand to a phone.
  qr_code: ['text', 'number'],
};

/**
 * RF-56: the Jira field catalogue, browsed from the variable manager.
 *
 * It used to be a `Select` inside the properties panel, which meant the catalogue had two homes
 * and the manager was only half the answer to "what can I put on a slide". This is the whole
 * answer, in one component, rendered both as a browser (inside the manager) and as a picker (when
 * a shape asks for a field). Entries keep their **kind**: a catalogue field can be rows, groups, a
 * series or a semáforo, and flattening those into text variables would throw away every table and
 * chart the deck has.
 */
export function FieldCatalog({
  fields,
  value,
  onPick,
  mode,
  emptyHint,
}: {
  fields: CatalogField[];
  /** The currently bound key, highlighted. */
  value?: string | null;
  /** Omitted makes the list read-only, which is how the manager browses it. */
  onPick?: (key: string) => void;
  /** Narrow the list to what this binding mode accepts. */
  mode?: string;
  emptyHint?: string;
}) {
  const [query, setQuery] = useState('');
  const [favorites, toggleFavorite] = useFavoriteFields();
  const usable = useMemo(() => {
    const kinds = mode ? MODE_KINDS[mode] : null;
    const needle = query.trim().toLowerCase();
    return fields.filter(
      (field) =>
        (!kinds || kinds.includes(field.kind)) &&
        (!needle ||
          field.key.toLowerCase().includes(needle) ||
          field.label.toLowerCase().includes(needle) ||
          (field.hint ?? '').toLowerCase().includes(needle)),
    );
  }, [fields, mode, query]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, CatalogField[]>();
    for (const field of usable) {
      const group = field.group ?? (field.scope === 'deck' ? 'Do relatório' : 'Do board');
      byGroup.set(group, [...(byGroup.get(group) ?? []), field]);
    }
    return [...byGroup].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [usable]);

  const favoriteFields = useMemo(() => usable.filter((f) => favorites.includes(f.key)), [usable, favorites]);

  const renderField = (field: CatalogField) => {
    const picked = field.key === value;
    const isFavorite = favorites.includes(field.key);
    const row = (
      <Group gap={6} wrap="nowrap" align="flex-start">
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm" lineClamp={1}>
              {field.label}
            </Text>
            <Badge size="xs" variant="outline" color={picked ? 'petrol' : 'gray'}>
              {KIND_LABEL[field.kind]}
            </Badge>
            {field.origin === 'variavel' && (
              <Badge size="xs" variant="light" color="petrol">
                variável
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" className="mono" lineClamp={1}>
            {field.key}
          </Text>
          {field.hint && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {field.hint}
            </Text>
          )}
        </Stack>
        <ActionIcon
          size="sm"
          variant="subtle"
          color={isFavorite ? 'yellow' : 'gray'}
          aria-label={isFavorite ? `Tirar ${field.label} dos favoritos` : `Marcar ${field.label} como favorito`}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavorite(field.key);
          }}
        >
          {isFavorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
        </ActionIcon>
        {picked && <IconDatabase size={14} />}
      </Group>
    );
    if (!onPick) {
      return (
        <div key={field.key} style={{ padding: '4px 6px' }}>
          {row}
        </div>
      );
    }
    return (
      <UnstyledButton
        key={field.key}
        onClick={() => onPick(field.key)}
        style={{
          padding: '4px 6px',
          borderRadius: 6,
          background: picked ? 'var(--mantine-color-default-hover)' : undefined,
        }}
      >
        {row}
      </UnstyledButton>
    );
  };

  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        placeholder="Procurar por nome, chave ou descrição"
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      {usable.length === 0 ? (
        <Text size="xs" c="dimmed">
          {emptyHint ?? 'Nenhum campo deste tipo.'}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={420} type="auto">
          <Stack gap="sm">
            {favoriteFields.length > 0 && (
              <Stack gap={2}>
                <Text size="xs" fw={600} c="dimmed">
                  ★ Favoritos
                </Text>
                {favoriteFields.map(renderField)}
              </Stack>
            )}
            {groups.map(([group, items]) => (
              <Stack key={group} gap={2}>
                <Text size="xs" fw={600} c="dimmed">
                  {group}
                </Text>
                {items.map(renderField)}
              </Stack>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>
  );
}

/** The same catalogue, as the modal a shape opens when it asks for a field. */
export function FieldPicker({
  opened,
  fields,
  value,
  mode,
  onPick,
  onClose,
}: {
  opened: boolean;
  fields: CatalogField[];
  value?: string | null;
  mode?: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title="Campos do Jira" size="lg">
      <FieldCatalog
        fields={fields}
        value={value}
        mode={mode}
        onPick={(key) => {
          onPick(key);
          onClose();
        }}
        emptyHint="Nenhum campo do catálogo serve para este modo de preenchimento."
      />
    </Modal>
  );
}
