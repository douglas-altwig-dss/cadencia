/**
 * RF-81: every keyboard shortcut in one list, so the `?` overlay and the screens cannot disagree.
 * A screen that adds a shortcut adds it here too; the overlay shows the current screen's first.
 */

import { t } from '../i18n';

export interface Shortcut {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  id: string;
  title: string;
  /** Which screens this group belongs to, by path prefix. */
  paths: string[];
  items: Shortcut[];
}

export const SHORTCUT_EVENT = 'cadencia:atalhos';

/** Every group, in the current language: built when asked for, so a change of language reaches it. */
export function shortcutGroups(): ShortcutGroup[] {
  const w = t().shell.shortcuts;
  return [
    {
      id: 'global',
      title: w.groups.global,
      paths: ['/'],
      items: [
        { keys: ['Ctrl', 'K'], label: w.search },
        { keys: ['?'], label: w.showShortcuts },
        { keys: ['Esc'], label: w.closeWindows },
      ],
    },
    {
      id: 'timeline-foco',
      title: w.groups.focusTimeline,
      paths: ['/focus-timeline'],
      items: [
        { keys: ['/'], label: w.searchActivity },
        { keys: ['Ctrl', 'Z'], label: w.undo },
        { keys: ['Ctrl', 'Shift', 'Z'], label: w.redo },
      ],
    },
    {
      id: 'editor',
      title: w.groups.editor,
      paths: ['/presentation'],
      items: [
        { keys: ['Ctrl', 'Z'], label: w.undo },
        { keys: ['Ctrl', 'Shift', 'Z'], label: w.redo },
        { keys: ['Ctrl', 'S'], label: w.saveNow },
        { keys: ['Ctrl', 'Enter'], label: w.generate },
        { keys: ['Ctrl', 'A'], label: w.selectAll },
        { keys: ['Ctrl', 'C'], label: w.copy },
        { keys: ['Ctrl', 'V'], label: w.paste },
        { keys: ['Ctrl', 'D'], label: w.duplicate },
        { keys: ['Ctrl', 'G'], label: w.group },
        { keys: ['Ctrl', 'Shift', 'G'], label: w.ungroup },
        { keys: ['Ctrl', 'Shift', 'C'], label: w.copyFormat },
        { keys: ['Ctrl', 'Shift', 'V'], label: w.pasteFormat },
        { keys: ['Ctrl', 'L'], label: w.lock },
        { keys: ['Ctrl', 'H'], label: w.findReplace },
        { keys: ['Enter'], label: w.typeInShape },
        { keys: ['Delete'], label: w.deleteSelection },
        { keys: ['←', '→', '↑', '↓'], label: w.nudge },
        { keys: ['Tab'], label: w.nextShape },
        { keys: ['Ctrl', w.scrollKey], label: w.zoom },
        { keys: ['F11'], label: w.editorFullscreen },
      ],
    },
    {
      id: 'apresentar',
      title: w.groups.present,
      paths: ['/presentation', '/present'],
      items: [
        { keys: ['→'], label: w.nextSlide },
        { keys: ['←'], label: w.previousSlide },
        { keys: ['g'], label: w.allSlides },
        { keys: ['n'], label: w.notes },
        { keys: ['s'], label: w.audience },
        { keys: ['p'], label: w.timer },
        { keys: ['d'], label: w.pen },
        { keys: ['l'], label: w.laser },
        { keys: ['c'], label: w.clearInk },
        { keys: ['e'], label: w.evidence },
        { keys: ['q'], label: w.questions },
        { keys: ['f'], label: w.fullscreen },
        { keys: ['Esc'], label: w.dropTool },
      ],
    },
  ];
}

export function groupsFor(path: string): ShortcutGroup[] {
  const groups = shortcutGroups();
  const specific = groups.filter((g) => g.id !== 'global' && g.paths.some((p) => path.startsWith(p)));
  const rest = groups.filter((g) => g.id !== 'global' && !specific.includes(g));
  return [...specific, groups[0], ...rest];
}

export const openShortcuts = () => window.dispatchEvent(new Event(SHORTCUT_EVENT));

/** True when a key press is meant for a text field, where `?` and friends are just characters. */
export function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (/input|textarea|select/i.test(element.tagName) || element.isContentEditable));
}
