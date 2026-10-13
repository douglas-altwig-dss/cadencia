import { ActionIcon, Avatar, Button, ColorInput, Group, Menu, Popover, SegmentedControl, Select, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import {
  IconArrowsShuffle2,
  IconBold,
  IconBoxMargin,
  IconBrush,
  IconChevronDown,
  IconClearFormatting,
  IconContrast2,
  IconDroplet,
  IconFlipHorizontal,
  IconFlipVertical,
  IconGridDots,
  IconHighlight,
  IconIndentDecrease,
  IconIndentIncrease,
  IconItalic,
  IconLetterCase,
  IconLine,
  IconLineHeight,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconLock,
  IconLockOpen,
  IconMagnet,
  IconOmega,
  IconPaint,
  IconPhoto,
  IconRotateClockwise2,
  IconRuler,
  IconTypography,
  IconUnderline,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { useState } from 'react';

import type { ParagraphEdit, SceneFill, SceneLine, ShapeEdit } from '../../api/types';
import type { CopiedStyle } from '../../lib/formatPainter';
import type { EffectiveShape } from '../../lib/deckEdits';
import type { VariableDisplay } from '../../lib/variableDisplay';
import { ALIGNS, FONTS, SIZES, bare, hex, paragraphsOf, patchedParagraphs } from './textFormat';
import { t, useT } from '../../i18n';

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];

/**
 * RF-106: the ribbon's rich groups — the handful of controls a value (a font, a colour, a zoom
 * level) rather than a one-shot action, so they cannot be simple ribbon entries. Everything that
 * *is* a one-shot action (undo, duplicate, align, group…) is already a registered command and
 * reaches the ribbon as a plain entry (`DeckPage`'s `ribbonTabs`) — these pieces are only what a
 * command can't represent.
 */

/** A colour control the size of a ribbon button, with the current colour as its underline. */
function SwatchButton({
  label,
  icon,
  value,
  disabled,
  onChange,
  onClear,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onClear?: () => void;
}) {
  const t = useT();
  return (
    <Popover position="bottom" withArrow shadow="md" disabled={disabled}>
      <Popover.Target>
        <Tooltip label={label}>
          <ActionIcon variant="default" aria-label={label} disabled={disabled} style={{ position: 'relative' }}>
            {icon}
            <span
              style={{
                position: 'absolute',
                left: 4,
                right: 4,
                bottom: 3,
                height: 3,
                borderRadius: 2,
                background: value || 'repeating-linear-gradient(45deg,#ccc 0 3px,#fff 3px 6px)',
              }}
            />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <ColorInput
          size="xs"
          format="hex"
          value={value}
          onChange={onChange}
          swatches={['#1a1a1a', '#ffffff', '#2f6f8f', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#70AD47', '#C00000']}
        />
        {onClear && (
          <Button size="compact-xs" variant="subtle" mt={6} onClick={onClear}>
            {t.editor.ribbon.noColor}
          </Button>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}

/** Insert > Link, applied to every run of the selected shape's text (there is no sub-string range
 * selection in this editor — see `TextOverlay`'s own note on why). */
function LinkControl({ link, disabled, onApply }: { link: string; disabled?: boolean; onApply: (link: string) => void }) {
  const t = useT();
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState(link);
  return (
    <Popover position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened} disabled={disabled}>
      <Popover.Target>
        <Tooltip label={link ? t.editor.ribbon.linkTip(link) : t.editor.ribbon.insertLink}>
          <ActionIcon
            variant={link ? 'filled' : 'default'}
            aria-label={t.editor.ribbon.insertLink}
            disabled={disabled}
            onClick={() => {
              setDraft(link);
              setOpened((o) => !o);
            }}
          >
            <IconLink size={15} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Group gap={4} wrap="nowrap">
          <TextInput
            size="xs"
            placeholder="https://…"
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) {
                onApply(draft.trim());
                setOpened(false);
              }
            }}
            w={220}
          />
          <ActionIcon
            variant="filled"
            aria-label={t.editor.ribbon.applyLink}
            disabled={!draft.trim()}
            onClick={() => {
              onApply(draft.trim());
              setOpened(false);
            }}
          >
            <IconLink size={14} />
          </ActionIcon>
          {link && (
            <ActionIcon
              variant="default"
              aria-label={t.editor.ribbon.removeLink}
              onClick={() => {
                onApply('');
                setOpened(false);
              }}
            >
              <IconLinkOff size={14} />
            </ActionIcon>
          )}
        </Group>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Home's "Fonte" group: family, size, bold/italic/underline, colour, link — always shown, disabled
 * when nothing with text is selected, the way PowerPoint greys its Font group rather than hiding it. */
export function FontControls({
  selection,
  onParagraphs,
}: {
  selection: EffectiveShape[];
  onParagraphs: (build: (shape: EffectiveShape) => ParagraphEdit[]) => void;
}) {
  const t = useT();
  const lead = selection.filter((s) => s.text)[0];
  const leadParagraph = lead?.text?.paragraphs?.[0];
  const leadStyle = { ...(leadParagraph?.style ?? {}), ...(leadParagraph?.runs?.[0] ?? {}) };
  const disabled = !lead;
  const patchText = (patch: Partial<ParagraphEdit>) => onParagraphs((shape) => patchedParagraphs(shape, patch));
  return (
    <Group gap={4} wrap="nowrap">
      <Select
        size="xs"
        w={124}
        data={FONTS}
        searchable
        disabled={disabled}
        placeholder={t.editor.ribbon.font}
        aria-label={t.editor.ribbon.font}
        value={leadStyle.font ?? null}
        onChange={(value) => value && patchText({ style: { font: value } })}
      />
      <Select
        size="xs"
        w={62}
        data={SIZES.map(String)}
        searchable
        disabled={disabled}
        placeholder="pt"
        aria-label={t.editor.ribbon.sizeAria}
        value={leadStyle.size_pt ? String(Math.round(leadStyle.size_pt)) : null}
        onChange={(value) => value && patchText({ style: { size_pt: Number(value) } })}
      />
      <ActionIcon.Group>
        <ActionIcon variant={leadStyle.bold ? 'filled' : 'default'} disabled={disabled} aria-label={t.editor.ribbon.bold} onClick={() => patchText({ style: { bold: !leadStyle.bold } })}>
          <IconBold size={15} />
        </ActionIcon>
        <ActionIcon variant={leadStyle.italic ? 'filled' : 'default'} disabled={disabled} aria-label={t.editor.ribbon.italic} onClick={() => patchText({ style: { italic: !leadStyle.italic } })}>
          <IconItalic size={15} />
        </ActionIcon>
        <ActionIcon variant={leadStyle.underline ? 'filled' : 'default'} disabled={disabled} aria-label={t.editor.ribbon.underline} onClick={() => patchText({ style: { underline: !leadStyle.underline } })}>
          <IconUnderline size={15} />
        </ActionIcon>
      </ActionIcon.Group>
      <SwatchButton label={t.editor.ribbon.textColor} icon={<IconTypography size={15} />} value={hex(leadStyle.color)} disabled={disabled} onChange={(value) => patchText({ style: { color: bare(value) } })} />
      <SwatchButton
        label={t.editor.ribbon.highlight}
        icon={<IconHighlight size={15} />}
        value={hex(leadStyle.highlight)}
        disabled={disabled}
        onChange={(value) => patchText({ style: { highlight: bare(value) } })}
        onClear={() => patchText({ style: { highlight: '' } })}
      />
      <LinkControl link={leadStyle.link ?? ''} disabled={disabled} onApply={(link) => patchText({ style: { link } })} />
      <ChangeCaseControl disabled={disabled} onApply={(mode) => onParagraphs((shape) => paragraphsOf(shape).map((p) => ({ ...p, text: applyCase(p.text, mode) })))} />
      <Tooltip label={t.editor.ribbon.clearTip}>
        <ActionIcon
          variant="default"
          disabled={disabled}
          aria-label={t.editor.ribbon.clearAria}
          onClick={() => patchText({ style: { bold: false, italic: false, underline: false, highlight: '', link: '' } })}
        >
          <IconClearFormatting size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

type CaseMode = 'upper' | 'lower' | 'title' | 'sentence' | 'toggle';

/** Home's "Maiúsculas e minúsculas" — rewrites the paragraph's own text, not its style, so it
 * goes through `onParagraphs` directly rather than `patchText`. */
function applyCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'title':
      return text.replace(/\p{L}[\p{L}'’]*/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*\p{L}|[.!?]\s+\p{L})/gu, (m) => m.toUpperCase());
    case 'toggle':
      return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
  }
}

function ChangeCaseControl({ disabled, onApply }: { disabled?: boolean; onApply: (mode: CaseMode) => void }) {
  const t = useT();
  const options: [CaseMode, string][] = [
    ['sentence', t.editor.ribbon.caseSentence],
    ['lower', t.editor.ribbon.caseLower],
    ['upper', t.editor.ribbon.caseUpper],
    ['title', t.editor.ribbon.caseTitle],
    ['toggle', t.editor.ribbon.caseToggle],
  ];
  return (
    <Menu>
      <Menu.Target>
        <Tooltip label={t.editor.ribbon.caseTip}>
          <ActionIcon variant="default" disabled={disabled} aria-label={t.editor.ribbon.caseAria}>
            <IconLetterCase size={15} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {options.map(([mode, label]) => (
          <Menu.Item key={mode} onClick={() => onApply(mode)}>
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** Home's "Parágrafo" group: alignment and bullets — same disabled-not-hidden rule as the font
 * controls, and the same shape (`patchedParagraphs`) the properties panel writes through. */
export function ParagraphControls({
  selection,
  onParagraphs,
}: {
  selection: EffectiveShape[];
  onParagraphs: (build: (shape: EffectiveShape) => ParagraphEdit[]) => void;
}) {
  const t = useT();
  const lead = selection.filter((s) => s.text)[0];
  const leadParagraph = lead?.text?.paragraphs?.[0];
  const disabled = !lead;
  const patchText = (patch: Partial<ParagraphEdit>) => onParagraphs((shape) => patchedParagraphs(shape, patch));
  return (
    <Group gap={4} wrap="nowrap">
      <ActionIcon.Group>
        {ALIGNS().map(({ value, icon: Icon, label }) => (
          <ActionIcon key={value} variant={leadParagraph?.align === value ? 'filled' : 'default'} disabled={disabled} aria-label={label} onClick={() => patchText({ align: value })}>
            <Icon size={15} />
          </ActionIcon>
        ))}
      </ActionIcon.Group>
      <ActionIcon.Group>
        <ActionIcon
          variant={leadParagraph?.bullet.kind === 'char' ? 'filled' : 'default'}
          disabled={disabled}
          aria-label={t.editor.ribbon.bullets}
          onClick={() => patchText({ bullet: leadParagraph?.bullet.kind === 'char' ? 'none' : 'char' })}
        >
          <IconList size={15} />
        </ActionIcon>
        <ActionIcon
          variant={leadParagraph?.bullet.kind === 'number' ? 'filled' : 'default'}
          disabled={disabled}
          aria-label={t.editor.ribbon.numbered}
          onClick={() => patchText({ bullet: leadParagraph?.bullet.kind === 'number' ? 'none' : 'number' })}
        >
          <IconListNumbers size={15} />
        </ActionIcon>
      </ActionIcon.Group>
      <ActionIcon.Group>
        <Tooltip label={t.editor.ribbon.outdentTip}>
          <ActionIcon
            variant="default"
            disabled={disabled || !(leadParagraph?.level ?? 0)}
            aria-label={t.editor.ribbon.outdentAria}
            onClick={() => patchText({ level: Math.max(0, (leadParagraph?.level ?? 0) - 1) })}
          >
            <IconIndentDecrease size={15} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t.editor.ribbon.indentTip}>
          <ActionIcon
            variant="default"
            disabled={disabled}
            aria-label={t.editor.ribbon.indentAria}
            onClick={() => patchText({ level: Math.min(8, (leadParagraph?.level ?? 0) + 1) })}
          >
            <IconIndentIncrease size={15} />
          </ActionIcon>
        </Tooltip>
      </ActionIcon.Group>
      <Menu>
        <Menu.Target>
          <Tooltip label={t.editor.ribbon.spacingTip}>
            <ActionIcon variant="default" disabled={disabled} aria-label={t.editor.ribbon.spacingAria}>
              <IconLineHeight size={15} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {[1, 1.15, 1.5, 2].map((value) => (
            <Menu.Item key={value} onClick={() => patchText({ line_spacing: value })}>
              {value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}

/** Formatar's shape-colour group: fill and outline, disabled when nothing is selected. Order,
 * alignment, duplicate and delete moved to Organizar/Página Inicial, where the ribbon's own command
 * entries already cover them — this is only the two things a command can't hold, a colour value. */
export function ShapeStyleControls({
  selection,
  onPatchEach,
}: {
  selection: EffectiveShape[];
  onPatchEach: (patch: Partial<ShapeEdit>) => void;
}) {
  const t = useT();
  const some = selection.length > 0;
  const first = selection[0];
  return (
    <Group gap={4} wrap="nowrap">
      <SwatchButton
        label={t.editor.ribbon.fill}
        icon={<IconDroplet size={15} />}
        disabled={!some}
        value={some ? hex(first.fill.type === 'solid' ? first.fill.color : null) : ''}
        onChange={(value) => onPatchEach({ fill: { type: 'solid', color: bare(value), alpha: first?.fill.alpha ?? 1 } as SceneFill })}
        onClear={() => onPatchEach({ fill: { type: 'none' } as SceneFill })}
      />
      <SwatchButton
        label={t.editor.ribbon.outline}
        icon={<IconLine size={15} />}
        disabled={!some}
        value={some ? hex(first.line.type === 'solid' ? first.line.color : null) : ''}
        onChange={(value) => onPatchEach({ line: { type: 'solid', color: bare(value), width_pt: first?.line.width_pt ?? 1 } as SceneLine })}
        onClear={() => onPatchEach({ line: { type: 'none' } as SceneLine })}
      />
      <Tooltip label={first?.shadow ? t.editor.ribbon.shadowRemove : t.editor.ribbon.shadowAdd}>
        <ActionIcon
          variant={first?.shadow ? 'filled' : 'default'}
          disabled={!some}
          aria-label={t.editor.ribbon.shadowAria}
          onClick={() =>
            onPatchEach(
              first?.shadow
                ? { shadow: { enabled: false, color: '000000', alpha: 0.6, blur_pt: 4, distance_pt: 3, angle: 45 } }
                : { shadow: { enabled: true, color: '000000', alpha: 0.6, blur_pt: 4, distance_pt: 3, angle: 45 } },
            )
          }
        >
          <IconContrast2 size={15} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

/** Organizar's "Girar" group: 90° rotation and the two flips — Arrange's own quick actions,
 * distinct from the properties panel's precise rotation number. Relative, so each shape in a
 * multi-selection turns from wherever it already was. */
export function RotateFlipControls({
  disabled,
  onRotate,
  onFlip,
}: {
  disabled: boolean;
  onRotate: (deltaDeg: number) => void;
  onFlip: (axis: 'h' | 'v') => void;
}) {
  const t = useT();
  return (
    <ActionIcon.Group>
      <Tooltip label={t.editor.ribbon.rotateTip}>
        <ActionIcon variant="default" disabled={disabled} aria-label={t.editor.ribbon.rotateAria} onClick={() => onRotate(90)}>
          <IconRotateClockwise2 size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.editor.ribbon.flipHTip}>
        <ActionIcon variant="default" disabled={disabled} aria-label={t.editor.ribbon.flipHAria} onClick={() => onFlip('h')}>
          <IconFlipHorizontal size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.editor.ribbon.flipVTip}>
        <ActionIcon variant="default" disabled={disabled} aria-label={t.editor.ribbon.flipVAria} onClick={() => onFlip('v')}>
          <IconFlipVertical size={16} />
        </ActionIcon>
      </Tooltip>
    </ActionIcon.Group>
  );
}

/** Exibir's "Guias" group: grid, rulers, snap and lock-aspect, as pressed-state toggles rather than
 * plain commands — the visual feedback (filled when on) is the point, not just the action. */
export function GuidesControls({
  showGrid,
  showRulers,
  snap,
  lockAspect,
  onToggle,
}: {
  showGrid: boolean;
  showRulers: boolean;
  snap: boolean;
  lockAspect: boolean;
  onToggle: (what: 'grid' | 'rulers' | 'snap' | 'aspect') => void;
}) {
  const t = useT();
  return (
    <ActionIcon.Group>
      <Tooltip label={t.editor.ribbon.gridTip}>
        <ActionIcon variant={showGrid ? 'filled' : 'default'} onClick={() => onToggle('grid')} aria-label={t.editor.ribbon.gridAria}>
          <IconGridDots size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.editor.ribbon.rulersTip}>
        <ActionIcon variant={showRulers ? 'filled' : 'default'} onClick={() => onToggle('rulers')} aria-label={t.editor.ribbon.rulersAria}>
          <IconRuler size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.editor.ribbon.snapTip}>
        <ActionIcon variant={snap ? 'filled' : 'default'} onClick={() => onToggle('snap')} aria-label={t.editor.ribbon.snapAria}>
          <IconMagnet size={16} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t.editor.ribbon.aspectTip}>
        <ActionIcon variant={lockAspect ? 'filled' : 'default'} onClick={() => onToggle('aspect')} aria-label={t.editor.ribbon.aspectAria}>
          <IconLock size={16} />
        </ActionIcon>
      </Tooltip>
    </ActionIcon.Group>
  );
}

/** Exibir's "Zoom" group: the one zoom control that isn't just "fit", which is already a command. */
export function ZoomControl({ zoom, fitting, onZoom, onFit }: { zoom: number; fitting: boolean; onZoom: (value: number) => void; onFit: () => void }) {
  const t = useT();
  return (
    <Group gap={2} wrap="nowrap">
      <ActionIcon variant="default" onClick={() => onZoom(zoom - 0.25)} aria-label={t.editor.ribbon.zoomOut}>
        <IconZoomOut size={16} />
      </ActionIcon>
      <Menu>
        <Menu.Target>
          <Button variant="default" size="compact-sm" rightSection={<IconChevronDown size={12} />} w={88}>
            <Text size="xs">{fitting ? t.editor.ribbon.fit : `${Math.round(zoom * 100)}%`}</Text>
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBoxMargin size={14} />} onClick={onFit}>
            {t.editor.ribbon.fitWindow}
          </Menu.Item>
          <Menu.Divider />
          {ZOOMS.map((value) => (
            <Menu.Item key={value} onClick={() => onZoom(value)}>
              {Math.round(value * 100)}%
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <ActionIcon variant="default" onClick={() => onZoom(zoom + 0.25)} aria-label={t.editor.ribbon.zoomIn}>
        <IconZoomIn size={16} />
      </ActionIcon>
    </Group>
  );
}

/** Slide's "Plano de fundo" — this slide's own `<p:bg>`, distinct from any shape's fill. `fill:
 * null` means untouched (inherits the layout/master); `{ type: 'none' }` is an explicit "inherit",
 * written for real so it can override a template-level background. */
export function BackgroundControl({ fill, disabled, onChange }: { fill: SceneFill | null; disabled?: boolean; onChange: (fill: SceneFill | null) => void }) {
  const t = useT();
  const color = fill?.type === 'solid' ? hex(fill.color) : '';
  return (
    <Popover position="bottom" withArrow shadow="md" disabled={disabled}>
      <Popover.Target>
        <Button size="compact-sm" variant="default" disabled={disabled} leftSection={<IconPaint size={14} color={color || undefined} />}>
          {t.editor.ribbon.background}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap={6}>
          <ColorInput
            size="xs"
            format="hex"
            placeholder={t.editor.ribbon.inherited}
            value={color}
            onChange={(value) => onChange({ type: 'solid', color: bare(value) })}
            swatches={['#ffffff', '#1a1a1a', '#f5f5f5', '#2f6f8f', '#4472C4', '#ED7D31', '#FFC000', '#70AD47']}
          />
          {fill && (
            <Button size="compact-xs" variant="subtle" onClick={() => onChange(null)}>
              {t.editor.ribbon.backToTemplate}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

const transitions = (): { value: 'nenhuma' | 'fade' | 'deslizar'; label: string }[] => [
  { value: 'nenhuma', label: t().editor.scope.transitionNone },
  { value: 'fade', label: t().editor.scope.transitionFade },
  { value: 'deslizar', label: t().editor.scope.transitionSlide },
];

/** Slide's "Transição" — only how Cadência's own presenter moves into this slide — never written
 * into the .pptx, so a downloaded file opens exactly as if no transition were set. */
export function TransitionControl({
  value,
  disabled,
  onChange,
}: {
  value: 'nenhuma' | 'fade' | 'deslizar';
  disabled?: boolean;
  onChange: (next: 'nenhuma' | 'fade' | 'deslizar') => void;
}) {
  const t = useT();
  return (
    <Popover position="bottom" withArrow shadow="md" disabled={disabled}>
      <Popover.Target>
        <Button size="compact-sm" variant="default" disabled={disabled} leftSection={<IconArrowsShuffle2 size={14} />}>
          {t.editor.ribbon.transition}
        </Button>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <Stack gap={4}>
          <Text size="xs" c="dimmed" maw={200}>
            {t.editor.ribbon.transitionHint}
          </Text>
          <Select size="xs" data={transitions()} value={value} onChange={(next) => next && onChange(next as 'nenhuma' | 'fade' | 'deslizar')} allowDeselect={false} />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Página Inicial's format painter — one toggle that copies or pastes depending on whether a style
 * is already held, instead of two separate "copiar-formato"/"colar-formato" ribbon entries. */
export function FormatPainterControl({
  copiedStyle,
  selectedShapes,
  sticky,
  onCopy,
  onPaste,
  onToggleSticky,
}: {
  copiedStyle: CopiedStyle | null;
  selectedShapes: EffectiveShape[];
  /** RF-107: a double-click away from one-shot — keeps painting every selection until Escape. */
  sticky: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onToggleSticky: () => void;
}) {
  const t = useT();
  const willPaste = Boolean(copiedStyle) && selectedShapes.length > 0 && !(selectedShapes.length === 1 && copiedStyle!.from === (selectedShapes[0].name || selectedShapes[0].key));
  const disabled = copiedStyle ? !selectedShapes.length : selectedShapes.length !== 1;
  const label = sticky
    ? t.editor.ribbon.painterSticky
    : copiedStyle
      ? t.editor.ribbon.painterPaste(copiedStyle.from)
      : t.editor.ribbon.painterCopy;
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant={copiedStyle || sticky ? 'filled' : 'default'}
        color={sticky ? undefined : copiedStyle ? 'gray' : undefined}
        aria-label={copiedStyle ? t.editor.ribbon.pasteFormat : t.editor.ribbon.copyFormat}
        disabled={disabled && !sticky}
        onClick={() => {
          if (sticky) {
            onToggleSticky();
            return;
          }
          if (willPaste) onPaste();
          else onCopy();
        }}
        onDoubleClick={() => {
          if (!copiedStyle) onCopy();
          onToggleSticky();
        }}
      >
        <IconBrush size={16} />
      </ActionIcon>
    </Tooltip>
  );
}

/** Organizar's lock toggle — position and size, not the shape's content. */
export function LockControl({ locked, disabled, onToggle }: { locked: boolean; disabled: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <Tooltip label={locked ? t.editor.ribbon.unlockTip : t.editor.ribbon.lockTip}>
      <ActionIcon variant={locked ? 'filled' : 'default'} aria-label={t.editor.ribbon.lockAria} disabled={disabled} onClick={onToggle}>
        {locked ? <IconLock size={16} /> : <IconLockOpen size={16} />}
      </ActionIcon>
    </Tooltip>
  );
}

/** Exibir's "Colaboração" — who else has this deck open, read-only. */
export function PresenceAvatars({ authors }: { authors: string[] }) {
  const t = useT();
  if (!authors.length) return null;
  return (
    <Tooltip label={t.editor.ribbon.alsoEditing(authors.join(', '))}>
      <Avatar.Group spacing="xs">
        {authors.slice(0, 4).map((name) => (
          <Avatar key={name} size={26} radius="xl" color="initials" name={name} />
        ))}
      </Avatar.Group>
    </Tooltip>
  );
}

/** Exibir's "Exibição de dados" — marker or resolved value, screen-only (RF-57). */
export function DisplayToggle({ display, onDisplay }: { display: VariableDisplay; onDisplay: (next: VariableDisplay) => void }) {
  const t = useT();
  return (
    <Tooltip label={t.editor.ribbon.displayTip}>
      <SegmentedControl
        size="xs"
        value={display}
        onChange={(value) => onDisplay(value as VariableDisplay)}
        data={[
          { value: 'texto', label: t.editor.ribbon.displayMarker },
          { value: 'valor', label: t.editor.ribbon.displayValue },
        ]}
      />
    </Tooltip>
  );
}

export type PreviewMode = 'cor' | 'cinza' | 'pb';

/** Exibir's "Cor/Escala de Cinza/Preto e Branco" — a screen-only CSS filter over the canvas, the
 * way PowerPoint previews a print or projector without changing a single colour in the file. */
export function PreviewModeControl({ mode, onChange }: { mode: PreviewMode; onChange: (mode: PreviewMode) => void }) {
  const t = useT();
  return (
    <Tooltip label={t.editor.ribbon.previewTip}>
      <SegmentedControl
        size="xs"
        value={mode}
        onChange={(value) => onChange(value as PreviewMode)}
        data={[
          { value: 'cor', label: t.editor.ribbon.previewColor },
          { value: 'cinza', label: t.editor.ribbon.previewGray },
          { value: 'pb', label: t.editor.ribbon.previewBw },
        ]}
      />
    </Tooltip>
  );
}

/** Inserir's direct upload — "This Device" picture insert, distinct from opening the library to
 * reuse or upload an asset there. Styled like a ribbon entry so it sits in the same grid. */
export function ImageUploadButton({ uploading, onImage }: { uploading: boolean; onImage: (file: File) => void }) {
  const t = useT();
  return (
    <UnstyledButton
      component="label"
      className="ribbon-entry"
      data-disabled={uploading || undefined}
      style={{ opacity: uploading ? 0.5 : 1, cursor: uploading ? 'not-allowed' : 'pointer' }}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/gif,image/bmp,image/tiff"
        style={{ display: 'none' }}
        disabled={uploading}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) onImage(file);
        }}
      />
      <IconPhoto size={16} />
      <Text size="xs">{t.editor.ribbon.uploadImage}</Text>
    </UnstyledButton>
  );
}

const SYMBOLS = '© ® ™ § ¶ † ‡ • … ‰ ′ ″ ° ± × ÷ ≈ ≠ ≤ ≥ ∞ √ ∑ ∆ Ω π µ ← → ↑ ↓ ★ ☆ ♦ ♥ ♣ ♠ ✓ ✗ ½ ¼ ¾ € £ ¥'.split(' ');

/** Inserir's "Símbolo" — a character inserted at the caret of whichever text box is being edited;
 * disabled when nothing is (there is nowhere for the character to land). */
export function SymbolPickerControl({ disabled, onInsert }: { disabled: boolean; onInsert: (char: string) => void }) {
  const t = useT();
  return (
    <Popover position="bottom" withArrow shadow="md">
      <Popover.Target>
        <UnstyledButton className="ribbon-entry" disabled={disabled}>
          <IconOmega size={16} />
          <Text size="xs">{t.editor.ribbon.symbol}</Text>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="xs">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxWidth: 240 }}>
          {SYMBOLS.map((char) => (
            <Tooltip key={char} label={char}>
              <ActionIcon variant="default" size="md" onClick={() => onInsert(char)} aria-label={t.editor.ribbon.insertSymbol(char)}>
                <Text size="sm">{char}</Text>
              </ActionIcon>
            </Tooltip>
          ))}
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}
