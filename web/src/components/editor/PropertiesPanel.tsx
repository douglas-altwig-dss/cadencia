import {
  ActionIcon,
  Accordion,
  Badge,
  Button,
  ColorInput,
  Divider,
  Group,
  NumberInput,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useState } from 'react';
import {
  IconArrowBackUp,
  IconPlus,
  IconBold,
  IconItalic,
  IconList,
  IconListNumbers,
  IconTrash,
  IconUnderline,
  IconLayersSubtract,
  IconLayersUnion,
} from '@tabler/icons-react';

import type { NamedStyle, ParagraphEdit, ShapeEdit } from '../../api/types';
import type { EffectiveShape } from '../../lib/deckEdits';
import { cmToEmu, emuToCm } from '../../lib/emu';
import { ALIGNS, FONTS, bare, hex, paragraphsOf } from './textFormat';
import { useT } from '../../i18n';

interface Props {
  shape: EffectiveShape | null;
  count: number;
  onPatch: (patch: Partial<ShapeEdit>) => void;
  onDelete: () => void;
  onReset: () => void;
  onOrder: (delta: 'front' | 'back' | 'forward' | 'backward') => void;
  /** Present only when the selection is a single group. */
  onUngroup?: () => void;
  onGroup?: () => void;
  /** True when the selection is one selection group rather than loose shapes. */
  grouped?: boolean;
  /** #22: the deck's named styles; editor-only, applied as ordinary overrides. */
  styles?: NamedStyle[];
  onStyles?: (next: NamedStyle[]) => void;
}

/**
 * RF-47: the contextual panel for whatever is selected.
 *
 * Numbers are shown in centimetres because that is what a slide is measured in, and written back
 * as EMU integers, so nothing is lost to the round trip. Anything left untouched keeps whatever
 * the template said — the panel writes overrides, never a full description of the shape.
 */
export function PropertiesPanel({
  shape,
  count,
  onPatch,
  onDelete,
  onReset,
  onOrder,
  onUngroup,
  onGroup,
  grouped,
  styles = [],
  onStyles,
}: Props) {
  const t = useT();
  if (count > 1) {
    return (
      <Stack gap="xs" p="sm">
        <Text size="sm" fw={600}>
          {grouped ? t.editor.properties.groupOf(count) : t.editor.properties.selectedCount(count)}
        </Text>
        <Text size="xs" c="dimmed">
          {grouped
            ? t.editor.properties.groupHint
            : t.editor.properties.manyHint}
        </Text>
        <Group gap={4}>
          {grouped
            ? onUngroup && (
                <Button size="compact-xs" variant="light" leftSection={<IconLayersSubtract size={13} />} onClick={onUngroup}>
                  {t.editor.properties.ungroup}
                </Button>
              )
            : onGroup && (
                <Button size="compact-xs" variant="light" leftSection={<IconLayersUnion size={13} />} onClick={onGroup}>
                  {t.editor.properties.group}
                </Button>
              )}
          <Button size="compact-xs" variant="default" onClick={() => onOrder('front')}>
            {t.editor.properties.bringToFront}
          </Button>
          <Button size="compact-xs" variant="default" onClick={() => onOrder('back')}>
            {t.editor.properties.sendToBack}
          </Button>
        </Group>
      </Stack>
    );
  }
  if (!shape) {
    return (
      <Stack gap={4} p="sm">
        <Text size="sm" fw={600}>
          {t.editor.properties.nothing}
        </Text>
        <Text size="xs" c="dimmed">
          {t.editor.properties.nothingHint}
        </Text>
      </Stack>
    );
  }

  const text = shape.text;
  const paragraphs = paragraphsOf(shape);
  const first = paragraphs[0];
  const setFrame = (patch: Partial<{ x: number; y: number; cx: number; cy: number; rotation: number }>) =>
    onPatch({ frame: { ...patch } });
  const setParagraphs = (next: ParagraphEdit[]) => onPatch({ text: { paragraphs: next } });
  const patchAll = (patch: Partial<ParagraphEdit>) =>
    setParagraphs(paragraphs.map((p) => ({ ...p, ...patch, style: { ...p.style, ...(patch.style ?? {}) } })));

  return (
    <Stack gap={0}>
      <Group justify="space-between" p="sm" pb="xs" wrap="nowrap">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text size="sm" fw={600} lineClamp={1}>
            {shape.name}
          </Text>
          <Group gap={4}>
            <Badge size="xs" variant="light">
              {shape.kind}
            </Badge>
            {shape.bound && (
              <Tooltip label={t.editor.properties.boundTip(shape.bound_field ?? '')} multiline w={250}>
                <Badge size="xs" color="petrol" variant="filled">
                  {t.editor.properties.boundBadge}
                </Badge>
              </Tooltip>
            )}
            {shape.dirty && (
              <Badge size="xs" color="orange" variant="light">
                {t.editor.properties.edited}
              </Badge>
            )}
          </Group>
        </Stack>
        <Group gap={2} wrap="nowrap">
          {shape.dirty && (
            <Tooltip label={t.editor.properties.resetTip}>
              <ActionIcon variant="subtle" aria-label={t.editor.properties.resetAria} onClick={onReset}>
                <IconArrowBackUp size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t.editor.properties.removeTip}>
            <ActionIcon variant="subtle" color="red" aria-label={t.editor.properties.removeAria} onClick={onDelete}>
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {onUngroup && (
        <>
          <Group p="sm" pt={0}>
            <Button size="compact-xs" variant="light" leftSection={<IconLayersSubtract size={13} />} onClick={onUngroup}>
              {t.editor.properties.ungroup}
            </Button>
            <Text size="xs" c="dimmed">
              {t.editor.properties.ungroupHint}
            </Text>
          </Group>
        </>
      )}
      <Divider />
      {onStyles && (
        <NamedStyles
          shape={shape}
          styles={styles}
          onStyles={onStyles}
          onApply={(style) =>
            onPatch({
              ...(text && (style.run || style.align)
                ? {
                    text: {
                      paragraphs: paragraphs.map((p) => ({
                        ...p,
                        ...(style.align ? { align: style.align } : {}),
                        style: { ...p.style, ...(style.run ?? {}) },
                        runs: p.runs?.map((r) => ({ ...r, style: { ...r.style, ...(style.run ?? {}) } })),
                      })),
                    },
                  }
                : {}),
              ...(style.fill ? { fill: { type: 'solid' as const, color: style.fill } } : {}),
            })
          }
        />
      )}

      <Accordion multiple defaultValue={['posicao', 'texto']} chevronPosition="left" variant="separated">
        <Accordion.Item value="posicao">
          <Accordion.Control>
            <Text size="xs" fw={600}>
              {t.editor.properties.position}
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Group grow>
                <NumberInput
                  label="X (cm)"
                  size="xs"
                  decimalScale={2}
                  step={0.1}
                  value={Number(emuToCm(shape.frame.x).toFixed(2))}
                  onChange={(v) => setFrame({ x: cmToEmu(Number(v) || 0) })}
                />
                <NumberInput
                  label="Y (cm)"
                  size="xs"
                  decimalScale={2}
                  step={0.1}
                  value={Number(emuToCm(shape.frame.y).toFixed(2))}
                  onChange={(v) => setFrame({ y: cmToEmu(Number(v) || 0) })}
                />
              </Group>
              <Group grow>
                <NumberInput
                  label={t.editor.properties.width}
                  size="xs"
                  decimalScale={2}
                  step={0.1}
                  min={0.1}
                  value={Number(emuToCm(shape.frame.cx).toFixed(2))}
                  onChange={(v) => setFrame({ cx: cmToEmu(Number(v) || 0.1) })}
                />
                <NumberInput
                  label={t.editor.properties.height}
                  size="xs"
                  decimalScale={2}
                  step={0.1}
                  min={0.1}
                  value={Number(emuToCm(shape.frame.cy).toFixed(2))}
                  onChange={(v) => setFrame({ cy: cmToEmu(Number(v) || 0.1) })}
                />
              </Group>
              <NumberInput
                label={t.editor.properties.rotation}
                size="xs"
                step={5}
                min={-360}
                max={360}
                value={shape.frame.rotation}
                onChange={(v) => setFrame({ rotation: Number(v) || 0 })}
              />
              <Group gap={4}>
                <Button size="compact-xs" variant="default" onClick={() => onOrder('front')}>
                  {t.editor.properties.front}
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => onOrder('forward')}>
                  {t.editor.properties.forward}
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => onOrder('backward')}>
                  {t.editor.properties.backward}
                </Button>
                <Button size="compact-xs" variant="default" onClick={() => onOrder('back')}>
                  {t.editor.properties.back}
                </Button>
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {text && (
          <Accordion.Item value="texto">
            <Accordion.Control>
              <Text size="xs" fw={600}>
                {t.editor.properties.text}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                {shape.bound && (
                  <Text size="xs" c="petrol.8">
                    {t.editor.properties.boundText(shape.bound_field ?? '')}
                  </Text>
                )}
                <Textarea
                  label={t.editor.properties.content}
                  description={t.editor.properties.contentHint}
                  size="xs"
                  autosize
                  minRows={2}
                  maxRows={10}
                  value={paragraphs.map((p) => p.text).join('\n')}
                  onChange={(event) => {
                    const lines = event.currentTarget.value.split('\n');
                    setParagraphs(
                      lines.map((line, index) => ({ ...(paragraphs[index] ?? paragraphs[0] ?? { text: '' }), text: line })),
                    );
                  }}
                />
                <Group grow>
                  <Select
                    label={t.editor.properties.font}
                    size="xs"
                    data={FONTS}
                    searchable
                    value={first?.style?.font ?? null}
                    onChange={(value) => patchAll({ style: { font: value } })}
                  />
                  <NumberInput
                    label={t.editor.properties.size}
                    size="xs"
                    min={4}
                    max={200}
                    step={1}
                    value={first?.style?.size_pt ?? undefined}
                    onChange={(v) => patchAll({ style: { size_pt: Number(v) || undefined } })}
                  />
                </Group>
                <Group gap={4}>
                  <ActionIcon.Group>
                    <ActionIcon
                      variant={first?.style?.bold ? 'filled' : 'default'}
                      aria-label={t.editor.properties.bold}
                      onClick={() => patchAll({ style: { bold: !first?.style?.bold } })}
                    >
                      <IconBold size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant={first?.style?.italic ? 'filled' : 'default'}
                      aria-label={t.editor.properties.italic}
                      onClick={() => patchAll({ style: { italic: !first?.style?.italic } })}
                    >
                      <IconItalic size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant={first?.style?.underline ? 'filled' : 'default'}
                      aria-label={t.editor.properties.underline}
                      onClick={() => patchAll({ style: { underline: !first?.style?.underline } })}
                    >
                      <IconUnderline size={15} />
                    </ActionIcon>
                  </ActionIcon.Group>
                  <ActionIcon.Group>
                    {ALIGNS().map(({ value, icon: Icon, label }) => (
                      <ActionIcon
                        key={value}
                        variant={first?.align === value ? 'filled' : 'default'}
                        aria-label={label}
                        onClick={() => patchAll({ align: value })}
                      >
                        <Icon size={15} />
                      </ActionIcon>
                    ))}
                  </ActionIcon.Group>
                  <ActionIcon.Group>
                    <ActionIcon
                      variant={first?.bullet === 'char' ? 'filled' : 'default'}
                      aria-label={t.editor.properties.bullets}
                      onClick={() => patchAll({ bullet: first?.bullet === 'char' ? 'none' : 'char' })}
                    >
                      <IconList size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant={first?.bullet === 'number' ? 'filled' : 'default'}
                      aria-label={t.editor.properties.numbered}
                      onClick={() => patchAll({ bullet: first?.bullet === 'number' ? 'none' : 'number' })}
                    >
                      <IconListNumbers size={15} />
                    </ActionIcon>
                  </ActionIcon.Group>
                </Group>
                <ColorInput
                  label={t.editor.properties.textColor}
                  size="xs"
                  format="hex"
                  value={hex(first?.style?.color)}
                  onChange={(value) => patchAll({ style: { color: bare(value) } })}
                />
                <Group grow>
                  <NumberInput
                    label={t.editor.properties.lineSpacing}
                    size="xs"
                    min={0.5}
                    max={4}
                    step={0.1}
                    decimalScale={2}
                    value={first?.line_spacing ?? 1}
                    onChange={(v) => patchAll({ line_spacing: Number(v) || 1 })}
                  />
                  <NumberInput
                    label={t.editor.properties.indent}
                    size="xs"
                    min={0}
                    max={8}
                    value={first?.level ?? 0}
                    onChange={(v) => patchAll({ level: Number(v) || 0 })}
                  />
                </Group>
                <Group grow>
                  <Select
                    label={t.editor.properties.verticalAlign}
                    size="xs"
                    data={[
                      { value: 'top', label: t.editor.properties.top },
                      { value: 'middle', label: t.editor.properties.middle },
                      { value: 'bottom', label: t.editor.properties.bottom },
                    ]}
                    value={text.anchor}
                    onChange={(value) => value && onPatch({ text: { anchor: value as 'top' | 'middle' | 'bottom' } })}
                  />
                  <Select
                    label={t.editor.properties.autofit}
                    size="xs"
                    data={[
                      { value: 'none', label: t.editor.properties.autofitNone },
                      { value: 'shrink', label: t.editor.properties.autofitShrink },
                      { value: 'resize', label: t.editor.properties.autofitResize },
                    ]}
                    value={text.autofit}
                    onChange={(value) => value && onPatch({ text: { autofit: value as 'none' | 'shrink' | 'resize' } })}
                  />
                </Group>
                <Group grow align="flex-end">
                  <NumberInput
                    label={t.editor.properties.columns}
                    size="xs"
                    min={1}
                    max={4}
                    value={text.columns}
                    onChange={(v) => onPatch({ text: { columns: Number(v) || 1 } })}
                  />
                  <Switch
                    label={t.editor.properties.wrap}
                    size="xs"
                    checked={text.word_wrap}
                    onChange={(event) => onPatch({ text: { word_wrap: event.currentTarget.checked } })}
                  />
                </Group>
                <Group grow>
                  {(['l', 'r', 't', 'b'] as const).map((side) => (
                    <NumberInput
                      key={side}
                      label={t.editor.properties.margin(side.toUpperCase())}
                      size="xs"
                      min={0}
                      max={72}
                      step={1}
                      value={text.insets_pt[side]}
                      onChange={(v) =>
                        onPatch({ text: { insets_pt: { ...text.insets_pt, [side]: Number(v) || 0 } } })
                      }
                    />
                  ))}
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        <Accordion.Item value="aparencia">
          <Accordion.Control>
            <Text size="xs" fw={600}>
              {t.editor.properties.fillAndLine}
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Select
                label={t.editor.properties.fill}
                size="xs"
                data={[
                  { value: 'inherit', label: t.editor.properties.asTemplate },
                  { value: 'solid', label: t.editor.properties.solidFill },
                  { value: 'none', label: t.editor.properties.noFill },
                ]}
                value={shape.fill.type}
                onChange={(value) =>
                  value && onPatch({ fill: { type: value as 'solid' | 'none', color: shape.fill.color, alpha: shape.fill.alpha } })
                }
              />
              {shape.fill.type === 'solid' && (
                <>
                  <ColorInput
                    label={t.editor.properties.color}
                    size="xs"
                    format="hex"
                    value={hex(shape.fill.color)}
                    onChange={(value) => onPatch({ fill: { type: 'solid', color: bare(value), alpha: shape.fill.alpha } })}
                  />
                  <Stack gap={2}>
                    <Text size="xs">{t.editor.properties.transparency}</Text>
                    <Slider
                      size="sm"
                      min={0}
                      max={100}
                      value={Math.round((1 - (shape.fill.alpha ?? 1)) * 100)}
                      label={(v) => `${v}%`}
                      onChangeEnd={(v) =>
                        onPatch({ fill: { type: 'solid', color: shape.fill.color, alpha: 1 - v / 100 } })
                      }
                    />
                  </Stack>
                </>
              )}
              {shape.geometry === 'roundRect' && (
                <Stack gap={2}>
                  <Text size="xs">{t.editor.properties.cornerRadius}</Text>
                  <Slider
                    size="sm"
                    min={0}
                    max={50}
                    value={Math.round((shape.edit?.corner_radius ?? 0.16) * 100)}
                    label={(v) => `${v}%`}
                    onChangeEnd={(v) => onPatch({ corner_radius: v / 100 })}
                  />
                </Stack>
              )}
              <Divider my={2} />
              <Select
                label={t.editor.properties.outline}
                size="xs"
                data={[
                  { value: 'inherit', label: t.editor.properties.asTemplate },
                  { value: 'solid', label: t.editor.properties.solidLine },
                  { value: 'none', label: t.editor.properties.noLine },
                ]}
                value={shape.line.type}
                onChange={(value) => value && onPatch({ line: { ...shape.line, type: value as 'solid' | 'none' } })}
              />
              {shape.line.type === 'solid' && (
                <Group grow align="flex-end">
                  <ColorInput
                    label={t.editor.properties.color}
                    size="xs"
                    format="hex"
                    value={hex(shape.line.color)}
                    onChange={(value) => onPatch({ line: { ...shape.line, type: 'solid', color: bare(value) } })}
                  />
                  <NumberInput
                    label={t.editor.properties.lineWidth}
                    size="xs"
                    min={0.25}
                    max={20}
                    step={0.25}
                    decimalScale={2}
                    value={shape.line.width_pt ?? 1}
                    onChange={(v) => onPatch({ line: { ...shape.line, type: 'solid', width_pt: Number(v) || 1 } })}
                  />
                  <Select
                    label={t.editor.properties.dash}
                    size="xs"
                    data={[
                      { value: 'solid', label: t.editor.properties.dashSolid },
                      { value: 'dash', label: t.editor.properties.dashDash },
                      { value: 'dot', label: t.editor.properties.dashDot },
                      { value: 'dashDot', label: t.editor.properties.dashDashDot },
                    ]}
                    value={shape.line.dash ?? 'solid'}
                    onChange={(value) => onPatch({ line: { ...shape.line, type: 'solid', dash: value } })}
                  />
                </Group>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="acessibilidade">
          <Accordion.Control>
            <Group gap={6}>
              <Text size="xs" fw={600}>
                {t.editor.properties.accessibility}
              </Text>
              {(shape.kind === 'image' || shape.kind === 'chart') && !(shape.edit?.alt_text ?? shape.alt) && (
                <Badge size="xs" color="yellow" variant="light">
                  {t.editor.properties.noAlt}
                </Badge>
              )}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Textarea
              label={t.editor.properties.altText}
              description={t.editor.properties.altTextHint}
              size="xs"
              autosize
              minRows={2}
              maxRows={6}
              // Keyed on the shape so switching selection resets the draft.
              key={shape.key}
              defaultValue={shape.edit?.alt_text ?? shape.alt ?? ''}
              onBlur={(event) => {
                const value = event.currentTarget.value.trim();
                if (value !== (shape.edit?.alt_text ?? shape.alt ?? '')) onPatch({ alt_text: value });
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>

        {shape.kind === 'image' && (
          <Accordion.Item value="imagem">
            <Accordion.Control>
              <Text size="xs" fw={600}>
                {t.editor.properties.image}
              </Text>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {t.editor.properties.cropHint}
                </Text>
                <Group grow>
                  {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
                    <NumberInput
                      key={side}
                      label={t.editor.properties.cropSides[side]}
                      size="xs"
                      min={0}
                      max={0.9}
                      step={0.05}
                      decimalScale={2}
                      value={shape.edit?.image?.crop?.[side] ?? shape.image?.crop?.[side] ?? 0}
                      onChange={(v) =>
                        onPatch({
                          image: {
                            ...(shape.edit?.image ?? {}),
                            crop: {
                              ...(shape.edit?.image?.crop ?? shape.image?.crop ?? {}),
                              [side]: Number(v) || 0,
                            },
                          },
                        })
                      }
                    />
                  ))}
                </Group>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}
      </Accordion>
    </Stack>
  );
}

/**
 * #22: a look saved under a name — font, size, weight, colour, alignment and fill — applied to the
 * selection with one click. The style list is editor-only; what reaches the file is the ordinary
 * override the click wrote, so a deck never depends on the style still existing.
 */
function NamedStyles({
  shape,
  styles,
  onStyles,
  onApply,
}: {
  shape: EffectiveShape;
  styles: NamedStyle[];
  onStyles: (next: NamedStyle[]) => void;
  onApply: (style: NamedStyle) => void;
}) {
  const t = useT();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const first = paragraphsOf(shape)[0];
  const capture = (): NamedStyle => {
    const run = { ...(first?.style ?? {}), ...(first?.runs?.[0]?.style ?? {}) };
    const clean = Object.fromEntries(Object.entries(run).filter(([, v]) => v !== null && v !== undefined));
    return {
      name: name.trim(),
      run: Object.keys(clean).length ? clean : undefined,
      align: first?.align ?? null,
      fill: shape.fill?.type === 'solid' ? (shape.fill.color ?? null) : null,
    };
  };
  return (
    <Stack gap={6} p="sm">
      <Group justify="space-between">
        <Text size="xs" fw={600}>
          {t.editor.properties.styles}
        </Text>
        <Tooltip label={t.editor.properties.saveStyleTip}>
          <ActionIcon size="sm" variant="subtle" onClick={() => setAdding((a) => !a)} aria-label={t.editor.properties.newStyleAria}>
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      {adding && (
        <Group gap={4} wrap="nowrap">
          <TextInput size="xs" placeholder={t.editor.properties.styleName} value={name} onChange={(e) => setName(e.currentTarget.value)} style={{ flex: 1 }} />
          <Button
            size="compact-xs"
            disabled={!name.trim()}
            onClick={() => {
              const next = capture();
              onStyles([...styles.filter((s) => s.name !== next.name), next]);
              setName('');
              setAdding(false);
            }}
          >
            {t.editor.properties.save}
          </Button>
        </Group>
      )}
      {styles.length ? (
        <Group gap={4}>
          {styles.map((style) => (
            <Button.Group key={style.name}>
              <Button
                size="compact-xs"
                variant="default"
                onClick={() => onApply(style)}
                style={{
                  fontWeight: style.run?.bold ? 700 : 400,
                  fontStyle: style.run?.italic ? 'italic' : undefined,
                  color: style.run?.color ? `#${style.run.color}` : undefined,
                }}
              >
                {style.name}
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                px={4}
                aria-label={t.editor.properties.deleteStyleAria(style.name)}
                onClick={() => onStyles(styles.filter((s) => s.name !== style.name))}
              >
                ×
              </Button>
            </Button.Group>
          ))}
        </Group>
      ) : (
        !adding && (
          <Text size="xs" c="dimmed">
            {t.editor.properties.noStyles}
          </Text>
        )
      )}
    </Stack>
  );
}
