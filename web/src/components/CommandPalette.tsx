import { Badge, Group, Kbd, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { useSearch, useViews } from '../api/featureHooks';
import { useCollect } from '../api/hooks';
import { useT } from '../i18n';
import type { SearchItem } from '../api/types';
import { useCommands } from '../lib/commands';
import { palettePages } from '../lib/navigation';
import { openShortcuts } from '../lib/shortcuts';

interface Entry {
  id: string;
  label: string;
  detail?: string;
  kind: string;
  run: () => void;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * RF-80: Ctrl+K (⌘K) jumps anywhere — a board, a sprint, an item key, a person, a template, a saved
 * view — or runs an action. Local entries match as you type; the server search joins after a pause.
 */
export function CommandPalette() {
  const t = useT();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [debounced] = useDebouncedValue(query, 200);
  const navigate = useNavigate();
  const views = useViews();
  const search = useSearch(opened ? debounced : '');
  const collect = useCollect();
  const screen = useCommands();
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpened((value) => !value);
      }
    };
    const onOpen = () => setOpened(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('cadencia:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cadencia:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (!opened) setQuery('');
    setActive(0);
  }, [opened, debounced]);

  const close = () => setOpened(false);
  const go = (path: string) => {
    close();
    navigate(path);
  };

  const entries = useMemo<Entry[]>(() => {
    const needle = fold(query.trim());
    const matches = (text: string) => !needle || fold(text).includes(needle);
    const actions: Entry[] = [
      {
        id: 'acao:coletar',
        label: t.shell.palette.collectNow,
        detail: t.shell.palette.collectNowDetail,
        kind: 'acao',
        run: () => {
          close();
          collect.mutate(
            { mode: 'incremental' },
            {
              onSuccess: () => notifications.show({ title: t.shell.palette.collectionStarted, message: t.shell.palette.collectionStartedMessage }),
              onError: (error) => notifications.show({ color: 'red', title: t.shell.palette.collectionNotStarted, message: error.message }),
            },
          );
        },
      },
      { id: 'acao:atalhos', label: t.shell.palette.showShortcuts, kind: 'acao', run: () => (close(), openShortcuts()) },
    ];
    // #21: what the open screen offers comes first — it is what somebody pressing Ctrl+K there wants.
    const local: Entry[] = screen
      .filter((command) => !command.disabled)
      .map((command) => ({
        id: `comando:${command.id}`,
        label: command.label,
        detail: command.shortcut ? `${command.detail ?? ''} ${command.shortcut}`.trim() : command.detail,
        kind: 'comando',
        run: () => {
          close();
          command.run();
        },
      }));
    // M19: the same list the navigation is built from, so a screen added there is found here too.
    const pages: Entry[] = palettePages().map(({ label, path }) => ({ id: `pagina:${path}`, label, kind: 'pagina', run: () => go(path) }));
    const saved: Entry[] = (views.data?.items ?? []).map((view) => ({
      id: `visao:${view.id}`,
      label: view.name,
      detail: view.url,
      kind: 'visao',
      run: () => go(view.url),
    }));
    const remote: Entry[] = (needle.length >= 2 ? (search.data?.items ?? []) : []).map((item: SearchItem) => ({
      id: `${item.type}:${item.id}`,
      label: item.label,
      detail: item.detail,
      kind: item.type,
      run: () => go(item.path),
    }));
    return [...local, ...actions, ...pages, ...saved].filter((e) => matches(`${e.label} ${e.detail ?? ''}`)).concat(remote).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, views.data, search.data, screen, opened, t]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      entries[active]?.run();
    }
  };

  return (
    <Modal opened={opened} onClose={close} withCloseButton={false} size="lg" padding="xs" yOffset="10vh" title={null}>
      <Stack gap="xs">
        <TextInput
          data-autofocus
          placeholder={t.shell.palette.placeholder}
          leftSection={<IconSearch size={16} />}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          aria-label={t.shell.palette.search}
          aria-controls="paleta-resultados"
          aria-activedescendant={entries[active] ? `paleta-${active}` : undefined}
          rightSection={<Kbd size="xs">Esc</Kbd>}
          rightSectionWidth={48}
        />
        <ScrollArea.Autosize mah="55vh" viewportRef={list}>
          <Stack gap={2} id="paleta-resultados" role="listbox" aria-label={t.shell.palette.results}>
            {entries.length === 0 && (
              <Text size="sm" c="dimmed" p="sm">
                {search.isFetching ? t.shell.palette.searching : t.shell.palette.nothingFound}
              </Text>
            )}
            {entries.map((entry, index) => (
              <UnstyledButton
                key={entry.id}
                id={`paleta-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={entry.run}
                p="xs"
                style={{
                  borderRadius: 4,
                  background: index === active ? 'var(--mantine-color-default-hover)' : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap="sm">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" lineClamp={1}>
                      {entry.label}
                    </Text>
                    {entry.detail && (
                      <Text size="xs" c="dimmed" lineClamp={1}>
                        {entry.detail}
                      </Text>
                    )}
                  </Stack>
                  <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                    {t.shell.palette.kinds[entry.kind] ?? entry.kind}
                  </Badge>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed" px={4}>
          <Kbd size="xs">↑</Kbd> <Kbd size="xs">↓</Kbd> {t.shell.palette.choose} · <Kbd size="xs">Enter</Kbd> {t.shell.palette.open}
        </Text>
      </Stack>
    </Modal>
  );
}
