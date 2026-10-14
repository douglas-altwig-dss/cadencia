import { ActionIcon, Group, SegmentedControl, Skeleton, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight, IconGripVertical, IconX } from '@tabler/icons-react';
import { useState } from 'react';

import {
  entryOf,
  moveTile,
  removeTile,
  resizeTile,
  setTileConfig,
  shiftTile,
  SIZES,
  spanFor,
  type Breakpoint,
  type TileSize,
  type TileState,
} from '../../lib/mosaic';
import { useT } from '../../i18n';
import { announce } from '../Announcer';
import { TILE_VIEWS, UnknownTile } from './tiles';

/** Grey blocks where the tiles will be, at the sizes they will have: the page does not jump when the data arrives. */
export function MosaicSkeleton({ tiles }: { tiles: TileState[] }) {
  const breakpoint = useBreakpoint();
  const height: Record<TileSize, number> = { P: 120, M: 210, G: 280 };
  const m = useT().tracking.home;
  return (
    <div className="mosaic" aria-busy="true" aria-label={m.loading}>
      {tiles.map((tile) => (
        <Skeleton key={tile.id} h={height[tile.size]} radius="md" style={{ gridColumn: `span ${spanFor(tile.size, breakpoint)}` }} />
      ))}
    </div>
  );
}

/** The breakpoint the grid is laid out for, read from the screen the way the rest of the app reads it. */
function useBreakpoint(): Breakpoint {
  const phone = useMediaQuery('(max-width: 48em)') ?? false;
  const tablet = useMediaQuery('(max-width: 75em)') ?? false;
  return phone ? 'phone' : tablet ? 'tablet' : 'desktop';
}

/**
 * The tiles in a 12-column grid. Outside edit mode it is only the tiles. In edit mode each tile gets a
 * strip with a grip (drag it), its size, and arrows and a remove button — so everything a drag does
 * can also be done from the keyboard — and its content goes inert, so a link cannot be followed while
 * a tile is being placed.
 */
export function MosaicGrid({ tiles, editing, onChange }: { tiles: TileState[]; editing: boolean; onChange: (next: TileState[]) => void }) {
  const breakpoint = useBreakpoint();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const m = useT().tracking.home;

  const label = (tile: TileState) => entryOf(tile.type)?.label ?? tile.type;
  const side = (id: string) => {
    if (!dragging || over !== id || dragging === id) return undefined;
    return tiles.findIndex((t) => t.id === dragging) < tiles.findIndex((t) => t.id === id) ? 'after' : 'before';
  };

  return (
    <div className="mosaic" role="list" aria-label={m.gridLabel}>
      {tiles.map((tile, index) => {
        const View = TILE_VIEWS[tile.type] ?? UnknownTile;
        return (
          <div
            key={tile.id}
            role="listitem"
            className={`mosaic-item${editing ? ' is-editing' : ''}${dragging === tile.id ? ' is-dragging' : ''}${side(tile.id) ? ` drop-${side(tile.id)}` : ''}`}
            style={{ gridColumn: `span ${spanFor(tile.size, breakpoint)}` }}
            draggable={editing}
            onDragStart={() => setDragging(tile.id)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDragOver={(event) => {
              if (!editing || !dragging) return;
              event.preventDefault();
              if (dragging !== tile.id) setOver(tile.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging && dragging !== tile.id) {
                onChange(moveTile(tiles, dragging, index));
                announce(m.moved(label(tiles.find((t) => t.id === dragging)!), index + 1));
              }
              setDragging(null);
              setOver(null);
            }}
          >
            {editing && (
              <Group className="mosaic-bar" gap={4} wrap="nowrap" justify="space-between">
                <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                  <IconGripVertical size={14} aria-hidden className="mosaic-grip" />
                  <Text size="xs" fw={600} lineClamp={1}>
                    {label(tile)}
                  </Text>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <SegmentedControl
                    size="xs"
                    aria-label={m.sizeOf(label(tile))}
                    value={tile.size}
                    data={SIZES.map((s) => ({ value: s.value, label: s.label }))}
                    onChange={(value) => {
                      onChange(resizeTile(tiles, tile.id, value as TileSize));
                      announce(m.resized(label(tile), value as TileSize));
                    }}
                  />
                  <Tooltip label={m.moveBefore}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={m.moveBeforeAria(label(tile))}
                      disabled={index === 0}
                      onClick={() => {
                        onChange(shiftTile(tiles, tile.id, -1));
                        announce(m.atPosition(label(tile), index));
                      }}
                    >
                      <IconChevronLeft size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={m.moveAfter}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={m.moveAfterAria(label(tile))}
                      disabled={index === tiles.length - 1}
                      onClick={() => {
                        onChange(shiftTile(tiles, tile.id, 1));
                        announce(m.atPosition(label(tile), index + 2));
                      }}
                    >
                      <IconChevronRight size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={m.remove}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={m.removeAria(label(tile))}
                      onClick={() => {
                        onChange(removeTile(tiles, tile.id));
                        announce(m.removed(label(tile)));
                      }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            )}
            <div className="mosaic-body" {...(editing ? { inert: true } : {})}>
              <View tile={tile} onConfig={(config) => onChange(setTileConfig(tiles, tile.id, config))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
