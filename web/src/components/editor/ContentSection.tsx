import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { IconBraces, IconDatabase, IconLetterCase, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import type { Binding, CatalogField, DeckMapping, SceneShape } from '../../api/types';
import { bindingKey } from '../../api/types';
import { FieldPicker, KIND_LABEL } from '../../pages/FieldCatalog';
import { useT } from '../../i18n';

export type ContentOrigin = 'estatico' | 'dados' | 'fixo';

/**
 * RF-45/RF-52: the variable manager owns variables, so they are offered in exactly one place.
 *
 * The catalogue endpoint adds the registered variables to `FIELDS` (`catalog_extras`), which put
 * them in *this* picker as well as in the "Variável" segment's menu — the same list, reached two
 * ways, which is what made the manager look like it was not the single source of truth. They are
 * filtered out here rather than at the endpoint, because the endpoint's catalogue is also what the
 * preview and older mappings resolve against.
 */
const isVariable = (key: string) => key.startsWith('texto.');

interface Props {
  shape: SceneShape;
  /** The template slide this produced slide came from: bindings live there, not on the copy. */
  originSlideId: number;
  mapping: DeckMapping;
  catalog: CatalogField[];
  variables: { name: string; label: string }[];
  /** The manual text override, when the user typed over the shape. */
  overrideText: string | null;
  onBind: (binding: Binding | null) => void;
  onText: (text: string | null) => void;
}

/**
 * RF-49: where a shape's content comes from, decided in the same panel that moves the shape.
 *
 * Mapping and editing used to be different screens operating on the same object through different
 * renderers. They are one question — "what goes in this box" — with three answers: the text typed
 * here, a field of the data, or one of the project's variables. The third is just the second
 * written inline, so a placeholder can sit in the middle of a sentence.
 */
export function ContentSection({
  shape,
  originSlideId,
  mapping,
  catalog,
  variables,
  overrideText,
  onBind,
  onText,
}: Props) {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const slide = mapping.slides[String(originSlideId)];
  const index = slide?.bindings?.findIndex((b) => b.target.endsWith(`/sh${shape.shape_id}`)) ?? -1;
  const binding = index >= 0 ? slide!.bindings[index] : null;
  const origin: ContentOrigin = binding ? (binding.value != null ? 'fixo' : 'dados') : 'estatico';
  const target = `s${originSlideId}/sh${shape.shape_id}`;

  // RF-59: variables are typed, so they are the thing a shape binds — for a table and a chart as
  // much as for a line of text. The catalogue's own keys stay offered as the legacy path, marked
  // as such by `origin`, so a mapping saved before the conversion still has somewhere to point.
  const bound = bindingKey(binding ?? ({} as Binding));
  const boundSpec = bound ? catalog.find((f) => f.key === bound) : undefined;
  const legacyField = binding?.field && !isVariable(binding.field) ? binding.field : null;

  /** A `texto.*` key is a variable and is stored as one; anything else is the legacy field path. */
  const pick = (key: string) =>
    binding &&
    onBind(
      isVariable(key)
        ? { ...binding, variable: key.slice('texto.'.length), field: null }
        : { ...binding, variable: null, field: key },
    );

  const setOrigin = (next: ContentOrigin) => {
    if (next === 'estatico') {
      onBind(null);
      return;
    }
    if (next === 'dados') {
      // Nothing is chosen for the user: the manager is browsed, not guessed at.
      onBind({ target, mode: 'text', variable: null, field: null, value: null });
      setPicking(true);
      return;
    }
    const current = shape.text?.paragraphs?.map((p) => p.text).join('\n') ?? '';
    onBind({ target, mode: 'text', field: null, value: current });
  };

  return (
    <Stack gap="xs" p="sm">
      <Group gap="xs" justify="space-between">
        <Text size="xs" fw={600}>
          {t.editor.content.title}
        </Text>
        {binding && (
          <Tooltip label={t.editor.content.boundTip}>
            <Badge size="xs" color="petrol" variant="filled" leftSection={<IconDatabase size={10} />}>
              {t.editor.content.bound}
            </Badge>
          </Tooltip>
        )}
      </Group>

      <SegmentedControl
        size="xs"
        fullWidth
        value={origin}
        onChange={(value) => setOrigin(value as ContentOrigin)}
        data={[
          { value: 'estatico', label: t.editor.content.fromSlide },
          { value: 'dados', label: t.editor.content.field },
          { value: 'fixo', label: t.editor.content.variable },
        ]}
      />

      {origin === 'estatico' && (
        <>
          <Textarea
            label={t.editor.content.text}
            description={t.editor.content.textHint}
            size="xs"
            autosize
            minRows={2}
            maxRows={10}
            value={overrideText ?? shape.text?.paragraphs?.map((p) => p.text).join('\n') ?? ''}
            onChange={(event) => onText(event.currentTarget.value)}
          />
          {overrideText != null && (
            <Group gap={4}>
              <Badge size="xs" color="orange" variant="light" leftSection={<IconLetterCase size={10} />}>
                {t.editor.content.edited}
              </Badge>
              <ActionIcon size="sm" variant="subtle" aria-label={t.editor.content.revertAria} onClick={() => onText(null)}>
                <IconTrash size={13} />
              </ActionIcon>
            </Group>
          )}
        </>
      )}

      {origin === 'dados' && binding && (
        <Stack gap="xs">
          <Select
            label={t.editor.content.fillAs}
            size="xs"
            data={Object.entries(t.editor.content.modes).map(([value, label]) => ({ value, label }))}
            value={binding.mode}
            onChange={(value) =>
              value && onBind({ ...binding, mode: value as Binding['mode'], variable: null, field: null })
            }
            allowDeselect={false}
          />
          <Paper withBorder p={6}>
            {bound ? (
              <Group gap={6} wrap="nowrap" justify="space-between">
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Group gap={6} wrap="nowrap">
                    <Text size="xs" fw={600} lineClamp={1}>
                      {boundSpec?.label ?? bound}
                    </Text>
                    {boundSpec && (
                      <Badge size="xs" variant="outline">
                        {KIND_LABEL[boundSpec.kind]}
                      </Badge>
                    )}
                    {legacyField && (
                      <Tooltip label={t.editor.content.legacyTip}>
                        <Badge size="xs" color="gray" variant="outline">
                          {t.editor.content.legacyBadge}
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" className="mono" lineClamp={1}>
                    {bound}
                  </Text>
                </Stack>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={t.editor.content.unbind}
                  onClick={() => onBind({ ...binding, variable: null, field: null })}
                >
                  <IconTrash size={13} />
                </ActionIcon>
              </Group>
            ) : (
              <Text size="xs" c="red.7">
                {t.editor.content.nothing}
              </Text>
            )}
          </Paper>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconDatabase size={12} />}
            onClick={() => setPicking(true)}
          >
            {bound ? t.editor.content.change : t.editor.content.choose}
          </Button>
          <FieldPicker
            opened={picking}
            fields={catalog}
            value={bound}
            mode={binding.mode}
            onPick={pick}
            onClose={() => setPicking(false)}
          />
          <Text size="xs" c="dimmed">
            {t.editor.content.recalculated}
          </Text>
        </Stack>
      )}

      {origin === 'fixo' && binding && (
        <Stack gap="xs">
          <Group align="flex-end" gap={4} wrap="nowrap">
            <Textarea
              label={t.editor.content.markersLabel}
              description={t.editor.content.markersHint}
              size="xs"
              autosize
              minRows={2}
              maxRows={8}
              value={binding.value ?? ''}
              onChange={(event) => onBind({ ...binding, value: event.currentTarget.value })}
              style={{ flex: 1 }}
            />
            <Menu width={280} position="bottom-end">
              <Menu.Target>
                <ActionIcon variant="light" size="lg" aria-label={t.editor.content.insertAria}>
                  <IconBraces size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{t.editor.content.variables}</Menu.Label>
                {variables.length === 0 && <Menu.Item disabled>{t.editor.content.noVariables}</Menu.Item>}
                {variables.map((item) => (
                  <Menu.Item
                    key={item.name}
                    onClick={() => onBind({ ...binding, value: `${binding.value ?? ''}{{texto.${item.name}}}` })}
                  >
                    <Text size="sm">{item.label || item.name}</Text>
                    <Text size="xs" c="dimmed" className="mono">{`{{texto.${item.name}}}`}</Text>
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
          <Paper withBorder p={6} bg="var(--mantine-color-default-hover)">
            <Text size="xs" c="dimmed">
              {t.editor.content.resolvedHere}
            </Text>
            <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
              {shape.text?.paragraphs?.map((p) => p.text).join('\n') || '—'}
            </Text>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}
