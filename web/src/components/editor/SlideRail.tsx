import { ActionIcon, Avatar, Badge, Box, Menu, Paper, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconAlertTriangle, IconCopy, IconDotsVertical, IconFilter, IconHistory, IconMessage, IconPlus, IconTrash } from '@tabler/icons-react';
import { memo, useMemo, useState } from 'react';

import type { DeckBoard, DeckEdits, DeckMapping, DeckScene, SceneSlide, SlideMapping } from '../../api/types';
import { isConditional, slideTitle } from '../../api/types';
import { effectiveShapes, slideEdits, type EffectiveShape } from '../../lib/deckEdits';
import { displayShapes, type VariableDisplay } from '../../lib/variableDisplay';
import { SlideStage } from './SlideStage';
import { t, useT } from '../../i18n';

/** Only the fallback for the one render before `useElementSize` reports anything. */
const THUMB_WIDTH = 150;
/** Everything in a row besides the thumbnail itself: the list's own padding, the number column,
 * the flex gap, and the thumbnail's border (RF-53/RF-110) — subtracted so the stage fills the
 * card's content box exactly rather than overflowing past it by a sliver. */
const ROW_CHROME = 12 + 16 + 4 + 4;

/** What the "escopo" badge says on hover: who actually gets this slide. */
function scopeLabel(slide: SlideMapping | undefined, spaceNames: Record<string, string>): string {
  const spaces = (slide?.only_spaces ?? []).map((key) => spaceNames[key] ?? key);
  const boards = slide?.only_boards ?? [];
  const parts: string[] = [];
  const text = t().editor.rail;
  if (spaces.length) parts.push(text.scopeSpaces(spaces.join(', ')));
  if (boards.length) parts.push(text.scopeBoards(boards.length));
  return parts.length ? text.scopeOnly(parts.join(' · ')) : text.scopeEverywhere;
}
const BAR = '2px solid var(--mantine-primary-color-filled)';

/**
 * One slide drawn small, from the same renderer the canvas uses, at the slide's own aspect ratio.
 *
 * the thumbnail silently loses every image. It is the same prop the canvas passes, for the same
 * reason.
 */
export const Thumb = memo(
  function Thumb({
    scene,
    slide,
    edits,
    live,
    mapping,
    display,
    width = THUMB_WIDTH,
  }: {
    scene: DeckScene;
    slide: SceneSlide;
    edits: DeckEdits;
    mapping: DeckMapping;
    display: VariableDisplay;
    live?: EffectiveShape[];
    /** RF-110: the rail reports how wide a thumbnail actually fits; the gallery's own grid cell
     * picks its own fixed size instead, so this stays optional. */
    width?: number;
  }) {
    // RF-57: the thumbnails read the deck the same way the canvas does, so switching to tokens
    // does not leave the rail telling a different story from the slide next to it.
    const computed = useMemo(
      () => displayShapes(effectiveShapes(slide, edits), mapping, slide.origin_slide_id, display),
      [slide, edits, mapping, display],
    );
    const background = slideEdits(edits, slide.key)?.background ?? slide.background ?? null;
    return (
      <Box style={{ pointerEvents: 'none' }}>
        <SlideStage
          scene={scene}
          shapes={live ?? computed}
          width={width}
          mode="preview"
          chromeless
          background={background?.type === 'solid' ? background.color : undefined}
        />
      </Box>
    );
  },
  // Only this slide's own overrides can change its picture — but `withShapeEdit` clones the whole
  // document, so identity says nothing and the contents have to be compared. The per-slide document
  // is a few hundred bytes, which is far cheaper than re-laying out every thumbnail on every edit.
  (before, after) =>
    before.slide === after.slide &&
    before.scene === after.scene &&
    before.live === after.live &&
    before.display === after.display &&
    before.mapping === after.mapping &&
    before.width === after.width &&
    JSON.stringify(before.edits.slides[before.slide.key]) ===
      JSON.stringify(after.edits.slides[after.slide.key]),
);

/**
 * RF-53: the filmstrip, with pictures instead of a list of layout names.
 *
 * Google Slides and PowerPoint Online both navigate by looking, not by reading: you find the slide
 * you want because you recognise it. The thumbnails are drawn by `SlideStage` rather than fetched
 * as rendered images, which costs a little and buys a lot — they update as you type, so the rail
 * always shows the deck as it is now rather than as it was when it was generated.
 *
 * Reordering is a drag, like everywhere else; the arrows stay in the menu for keyboard use.
 */
export function SlideRail({
  scene,
  slides,
  edits,
  currentKey,
  live,
  mapping,
  display,
  boards,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
  onRename,
  readiness,
  comments,
  presence,
  onHistory,
}: {
  scene: DeckScene;
  slides: SceneSlide[];
  edits: DeckEdits;
  currentKey: string;
  /** The open slide's shapes as the canvas has them right now, including text still being typed. */
  live?: EffectiveShape[];
  mapping: DeckMapping;
  display: VariableDisplay;
  /** Only to name a space in the scope badge's tooltip. */
  boards: DeckBoard[];
  onSelect: (key: string) => void;
  onReorder: (order: string[]) => void;
  onDuplicate: (key: string) => void;
  onDelete: (key: string) => void;
  /** RF-65: naming is per *template* slide, so every copy of it is named at once. */
  onRename: (originSlideId: number, name: string) => void;
  /** RF-66: origin slide id -> what is not fillable on it, already phrased for a person. */
  readiness?: Record<number, string[]>;
  /** RF-93: origin slide id -> open comment threads on it. */
  comments?: Record<number, number>;
  /** #19: slide key -> who else has it open right now. */
  presence?: Record<string, string[]>;
  /** #20: open the saved versions of one slide. */
  onHistory?: (key: string) => void;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState<string | null>(null);
  /** The name somebody gave the slide, else the layout it came from, else its number. */
  const slideLabel = (slide: SceneSlide) =>
    slideTitle(mapping.slides[String(slide.origin_slide_id)], slide.layout ?? '', slide.index);
  const spaceNames = useMemo(
    () => Object.fromEntries(boards.filter((b) => b.space_key).map((b) => [b.space_key!, b.space_name || b.space_key!])),
    [boards],
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // RF-110: a thumbnail fills whatever the rail is dragged to, instead of a fixed 150px that left
  // the rest of a widened rail blank or clipped a narrowed one.
  const { ref: listRef, width: listWidth } = useElementSize();
  const thumbWidth = listWidth > 0 ? Math.max(64, Math.floor(listWidth - ROW_CHROME)) : THUMB_WIDTH;

  /** Which edge of the hovered thumbnail shows the drop bar, given the drag's direction. */
  const marker = (key: string) => {
    if (over !== key || !dragging) return null;
    const order = slides.map((s) => s.key);
    return order.indexOf(dragging) < order.indexOf(key) ? 'after' : 'before';
  };

  /** Dropping on a slide below lands after it, on one above lands before it — as everywhere else. */
  const move = (from: string, to: string) => {
    if (from === to) return;
    const order = slides.map((s) => s.key);
    const at = order.indexOf(from);
    const onto = order.indexOf(to);
    if (at < 0 || onto < 0) return;
    order.splice(at, 1);
    order.splice(onto, 0, from);
    onReorder(order);
  };

  const nudge = (key: string, delta: number) => {
    const order = slides.map((s) => s.key);
    const at = order.indexOf(key);
    const to = at + delta;
    if (to < 0 || to >= order.length) return;
    [order[at], order[to]] = [order[to], order[at]];
    onReorder(order);
  };

  return (
    <ScrollArea h="100%" type="auto">
      <Stack gap={6} p={6} ref={listRef}>
        {slides.map((slide, position) => {
          const active = slide.key === currentKey;
          const edited = Object.keys(edits.slides[slide.key]?.shapes ?? {}).length > 0;
          return (
            <Box
              key={slide.key}
              draggable
              onDragStart={() => setDragging(slide.key)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragging && dragging !== slide.key) setOver(slide.key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) move(dragging, slide.key);
                setDragging(null);
                setOver(null);
              }}
              style={{
                borderTop: marker(slide.key) === 'before' ? BAR : '2px solid transparent',
                borderBottom: marker(slide.key) === 'after' ? BAR : '2px solid transparent',
                opacity: dragging === slide.key ? 0.4 : 1,
                cursor: 'grab',
              }}
            >
              <Box style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                <Text size="xs" c="dimmed" w={16} ta="right" mt={4}>
                  {position + 1}
                </Text>
                <Paper
                  withBorder
                  p={0}
                  onClick={() => onSelect(slide.key)}
                  style={{
                    overflow: 'hidden',
                    lineHeight: 0,
                    flex: 1,
                    outline: active ? '2px solid var(--mantine-primary-color-filled)' : undefined,
                    outlineOffset: -1,
                  }}
                >
                  <Thumb
                    scene={scene}
                    slide={slide}
                    edits={edits}
                    live={active ? live : undefined}
                    mapping={mapping}
                    display={display}
                    width={thumbWidth}
                  />
                </Paper>
              </Box>
              {/* RF-65: the name, editable in place. A deck of thirty slides is unnavigable by
                  number alone, and the name also reaches the .pptx at generation. */}
              <Box style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                <Box w={16} />
                {renaming === slide.key ? (
                  <TextInput
                    size="xs"
                    autoFocus
                    variant="filled"
                    defaultValue={mapping.slides[String(slide.origin_slide_id)]?.name ?? ''}
                    placeholder={slideLabel(slide)}
                    style={{ flex: 1 }}
                    onBlur={(event) => {
                      onRename(slide.origin_slide_id, event.currentTarget.value.trim());
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') event.currentTarget.blur();
                      if (event.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <Text
                    size="xs"
                    lineClamp={1}
                    style={{ flex: 1, cursor: 'text' }}
                    title={t.editor.rail.renameTitle}
                    onDoubleClick={() => setRenaming(slide.key)}
                    c={mapping.slides[String(slide.origin_slide_id)]?.name ? undefined : 'dimmed'}
                  >
                    {slideLabel(slide)}
                  </Text>
                )}
              </Box>
              <Box style={{ display: 'flex', justifyContent: 'flex-end', gap: 2, marginTop: 2, minHeight: 18 }}>
                {slide.duplicate_of && (
                  <Badge size="xs" variant="outline" color="gray">
                    {t.editor.rail.copy}
                  </Badge>
                )}
                {/* RF-55: a slide that is not simply everywhere says so on the thumbnail, so the
                    conditional ones are obvious without opening each slide. */}
                {isConditional(mapping.slides[String(slide.origin_slide_id)]) && (
                  <Tooltip label={scopeLabel(mapping.slides[String(slide.origin_slide_id)], spaceNames)}>
                    <Badge size="xs" color="grape" variant="light" leftSection={<IconFilter size={9} />}>
                      {t.editor.rail.scope}
                    </Badge>
                  </Tooltip>
                )}
                {/* RF-66: a slide whose variables cannot be filled says so here, so the gap is
                    visible while you are looking at the deck, not only when generation refuses. */}
                {readiness?.[slide.origin_slide_id]?.length ? (
                  <Tooltip label={readiness[slide.origin_slide_id].join(' · ')} multiline w={260}>
                    <Badge size="xs" color="red" variant="light" leftSection={<IconAlertTriangle size={9} />}>
                      {readiness[slide.origin_slide_id].length}
                    </Badge>
                  </Tooltip>
                ) : null}
                {comments?.[slide.origin_slide_id] ? (
                  <Tooltip label={t.editor.rail.openComments(comments[slide.origin_slide_id])}>
                    <Badge size="xs" color="blue" variant="light" leftSection={<IconMessage size={9} />}>
                      {comments[slide.origin_slide_id]}
                    </Badge>
                  </Tooltip>
                ) : null}
                {presence?.[slide.key]?.length ? (
                  <Tooltip label={t.editor.rail.openBy(presence[slide.key].join(', '))}>
                    <Avatar.Group spacing={6}>
                      {presence[slide.key].slice(0, 3).map((name) => (
                        <Avatar key={name} size={18} radius="xl" color="initials" name={name} />
                      ))}
                    </Avatar.Group>
                  </Tooltip>
                ) : null}
                {edited && (
                  <Badge size="xs" color="orange" variant="light">
                    {t.editor.rail.edited}
                  </Badge>
                )}
                <Menu position="right-start" withinPortal>
                  <Menu.Target>
                    <ActionIcon size="xs" variant="subtle" aria-label={t.editor.rail.optionsAria(position + 1)}>
                      <IconDotsVertical size={12} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconCopy size={14} />} onClick={() => onDuplicate(slide.key)}>
                      {t.editor.rail.duplicate}
                    </Menu.Item>
                    <Menu.Item disabled={position === 0} onClick={() => nudge(slide.key, -1)}>
                      {t.editor.rail.moveUp}
                    </Menu.Item>
                    <Menu.Item disabled={position === slides.length - 1} onClick={() => nudge(slide.key, 1)}>
                      {t.editor.rail.moveDown}
                    </Menu.Item>
                    {onHistory && (
                      <Menu.Item leftSection={<IconHistory size={14} />} onClick={() => onHistory(slide.key)}>
                        {t.editor.rail.history}
                      </Menu.Item>
                    )}
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      disabled={slides.length <= 1}
                      onClick={() => onDelete(slide.key)}
                    >
                      {t.editor.rail.remove}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Box>
            </Box>
          );
        })}
        <Tooltip label={t.editor.rail.newTip} position="right">
          <ActionIcon
            variant="default"
            w="100%"
            aria-label={t.editor.rail.newAria}
            onClick={() => onDuplicate(currentKey)}
          >
            <IconPlus size={15} />
          </ActionIcon>
        </Tooltip>
      </Stack>
    </ScrollArea>
  );
}
