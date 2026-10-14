import { ActionIcon, Badge, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconEye, IconTrash } from '@tabler/icons-react';

import type { Binding, CatalogField, SlideMapping } from '../../api/types';
import { bindingKey } from '../../api/types';
import { kindLabel } from '../../pages/FieldCatalog';
import { useT } from '../../i18n';

/**
 * RF-69: every binding on this slide, in one list.
 *
 * What the "Mapeamento avançado" screen was actually good for: seeing twenty areas at once instead
 * of clicking twenty shapes. The rest of that screen had become duplication — its slide previews
 * are the editor canvas now (RF-61), its status colours live in the variable manager (RF-62), and
 * its per-binding editor is the properties panel — so the screen is gone and this is what survived
 * of it. Clicking a row selects the shape on the canvas, which is how the list and the slide stay
 * the same object rather than two views that drift.
 */
export function BindingsPanel({
  slide,
  catalog,
  shapeKeyOf,
  selectedShape,
  onSelect,
  onRemove,
}: {
  slide: SlideMapping | undefined;
  catalog: CatalogField[];
  /** The scene key of the shape a binding targets, so a row can select it. */
  shapeKeyOf: (binding: Binding) => string | null;
  selectedShape: string | null;
  onSelect: (shapeKey: string) => void;
  onRemove: (index: number) => void;
}) {
  const t = useT();
  const bindings = slide?.bindings ?? [];
  if (!bindings.length) {
    return (
      <Text size="xs" c="dimmed" p="sm">
        {t.editor.bindings.emptyBefore} <b>{t.editor.bindings.emptyPath}</b>
        {t.editor.bindings.emptyAfter}
      </Text>
    );
  }
  return (
    <Stack gap={4} p="sm">
      {bindings.map((binding, index) => {
        const key = bindingKey(binding);
        const spec = key ? catalog.find((f) => f.key === key) : undefined;
        const shapeKey = shapeKeyOf(binding);
        const active = shapeKey !== null && shapeKey === selectedShape;
        return (
          <Paper
            key={`${binding.target}-${index}`}
            withBorder
            p={6}
            bg={active ? 'var(--mantine-color-default-hover)' : undefined}
          >
            <Group gap={6} wrap="nowrap" justify="space-between">
              <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                <Group gap={4} wrap="nowrap">
                  <Badge size="xs" variant="light">
                    {t.editor.bindings.modes[binding.mode] ?? binding.mode}
                  </Badge>
                  {spec && (
                    <Badge size="xs" variant="outline" color="gray">
                      {kindLabel(spec.kind)}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" lineClamp={1}>
                  {binding.value != null ? binding.value || t.editor.bindings.emptyText : (spec?.label ?? key ?? '—')}
                </Text>
                <Text size="xs" c="dimmed" className="mono" lineClamp={1}>
                  {binding.target}
                </Text>
              </Stack>
              <Group gap={2} wrap="nowrap">
                <Tooltip label={t.editor.bindings.selectTip}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    disabled={!shapeKey}
                    aria-label={t.editor.bindings.selectAria(binding.target)}
                    onClick={() => shapeKey && onSelect(shapeKey)}
                  >
                    <IconEye size={14} />
                  </ActionIcon>
                </Tooltip>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={t.editor.bindings.removeAria(binding.target)}
                  onClick={() => onRemove(index)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
