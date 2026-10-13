import { Divider, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import type { ReactNode } from 'react';
import { Fragment } from 'react';

/**
 * RF-106: a PowerPoint-style ribbon, replacing the Slides-style dropdown menu bar (RF-67/RF-101)
 * and the single-row toolbar (RF-53) with one surface: tabs across the top, and — under whichever
 * tab is open — the commands that belong to it, grouped and captioned the way a real ribbon is,
 * instead of hidden behind a click on a menu label.
 */

export interface RibbonEntry {
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

export interface RibbonGroup {
  /** The caption under the group, the way "Área de Transferência" sits under PowerPoint's Home
   * clipboard icons. */
  caption: string;
  /** Simple actions, packed three to a column like a real ribbon's secondary commands. */
  entries?: RibbonEntry[];
  /** Hand-built content (selects, colour swatches, popovers) that a dense icon grid can't hold. */
  content?: ReactNode;
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

/** A compact icon+label command, three rows to a column, the density of a real ribbon's secondary
 * clusters (Home's Clipboard, Arrange's Order). */
export function RibbonEntryGrid({ entries }: { entries: RibbonEntry[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'repeat(3, auto)', gridAutoFlow: 'column', gridAutoColumns: 'max-content', columnGap: 2, rowGap: 1 }}>
      {entries.map((entry, index) => (
        <Tooltip key={index} label={entry.shortcut ? `${entry.label} (${entry.shortcut})` : entry.label} openDelay={500} position="bottom">
          <UnstyledButton
            onClick={entry.onClick}
            disabled={entry.disabled}
            className="ribbon-entry"
            style={{ color: entry.danger ? 'var(--mantine-color-red-7)' : undefined }}
          >
            {entry.icon}
            <Text size="xs" span style={{ whiteSpace: 'nowrap' }}>
              {entry.label}
            </Text>
          </UnstyledButton>
        </Tooltip>
      ))}
    </div>
  );
}

export function Ribbon({
  tabs,
  active,
  onActive,
  trailing,
  panelVisible = true,
}: {
  tabs: RibbonTab[];
  active: string;
  onActive: (id: string) => void;
  /** Pinned to the right of the tab strip — PowerPoint's own spot for Comments/Share/collapse. */
  trailing?: ReactNode;
  /** RF-103: the tab strip (and `trailing`) always stays, the way PowerPoint's own collapsed
   * ribbon keeps its tabs clickable; only the group panel underneath hides. */
  panelVisible?: boolean;
}) {
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  const groups = tab?.groups.filter((g) => (g.entries && g.entries.length > 0) || g.content) ?? [];
  return (
    <Stack gap={0} className="ribbon">
      <Group gap={2} wrap="nowrap" align="center" px={8} className="ribbon-tabstrip">
        {tabs.map((t) => (
          <UnstyledButton key={t.id} onClick={() => onActive(t.id)} className={`ribbon-tab${t.id === tab?.id ? ' is-active' : ''}`}>
            <Text size="sm" fw={t.id === tab?.id ? 600 : 400}>
              {t.label}
            </Text>
          </UnstyledButton>
        ))}
        <div style={{ flex: 1 }} />
        {trailing}
      </Group>
      {panelVisible && (
        <Group gap={0} wrap="nowrap" align="stretch" px={6} py={4} className="ribbon-panel">
          {groups.map((group, index) => (
            <Fragment key={`${group.caption}-${index}`}>
              {index > 0 && <Divider orientation="vertical" mx={6} />}
              <Stack gap={2} justify="space-between" align="center" className="ribbon-group">
                <Group gap={2} align="center" style={{ flex: 1 }} wrap="nowrap">
                  {group.content ?? <RibbonEntryGrid entries={group.entries!} />}
                </Group>
                <Text size="xs" c="dimmed" ta="center" style={{ whiteSpace: 'nowrap', fontSize: 10 }}>
                  {group.caption}
                </Text>
              </Stack>
            </Fragment>
          ))}
        </Group>
      )}
    </Stack>
  );
}
