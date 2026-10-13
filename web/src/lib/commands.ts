import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

/**
 * #21: commands a screen offers to the Ctrl+K palette while it is mounted — "Gerar apresentação",
 * "Inserir bloco"… The palette lists what is registered; the screen keeps the behaviour. Each
 * command runs through a ref, so registering never goes stale and the palette re-renders only when
 * the list of labels changes, not on every render of the editor.
 */
export interface Command {
  id: string;
  label: string;
  detail?: string;
  shortcut?: string;
  disabled?: boolean;
  /** Which menu of a Slides-style menu bar this belongs to (RF-67); ungrouped commands are
   * palette-only. A divider is drawn above the first command of a new group within one menu. */
  group?: string;
  icon?: ReactNode;
  divider?: boolean;
  run: () => void;
}

type Listed = Omit<Command, 'run'> & { run: () => void };

const sources = new Map<string, Listed[]>();
const listeners = new Set<() => void>();
let snapshot: Listed[] = [];

function publish() {
  snapshot = [...sources.values()].flat();
  listeners.forEach((listener) => listener());
}

export function useCommands(): Listed[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
  );
}

export function useRegisterCommands(source: string, commands: Command[]) {
  const latest = useRef(commands);
  latest.current = commands;
  const signature = JSON.stringify(commands.map((c) => [c.id, c.label, c.detail, c.shortcut, c.disabled]));
  useEffect(() => {
    sources.set(
      source,
      latest.current.map((command) => ({
        ...command,
        run: () => latest.current.find((c) => c.id === command.id)?.run(),
      })),
    );
    publish();
    return () => {
      sources.delete(source);
      publish();
    };
  }, [source, signature]);
}
