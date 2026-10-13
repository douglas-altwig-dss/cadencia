import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Kbd,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBookmark, IconBookmarkPlus, IconKeyboard, IconLanguage, IconSearch, IconSettings2, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useDeleteView, useSaveView, useViews } from '../api/featureHooks';
import type { SavedView } from '../api/types';
import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from '../i18n';
import { usePreferences } from '../lib/preferences';
import { openShortcuts } from '../lib/shortcuts';
import { notifyUndo, useConfirm } from './common';

export const openPalette = () => window.dispatchEvent(new Event('cadencia:palette'));

/** RF-80: the palette's visible door, for people who never learn Ctrl+K. */
export function SearchButton() {
  const t = useT();
  return (
    <Button
      variant="default"
      leftSection={<IconSearch size={15} />}
      rightSection={<Kbd size="xs">Ctrl K</Kbd>}
      onClick={openPalette}
      visibleFrom="md"
      aria-label={t.shell.header.searchShortcut}
      className="search-trigger"
      fw={400}
      styles={{ inner: { justifyContent: 'space-between' }, label: { flex: 1, color: 'var(--text-muted)' } }}
    >
      {t.shell.header.searchPlaceholder}
    </Button>
  );
}

/** M18: a phone has no Ctrl+K, so the same palette opens from an icon there. */
export function SearchIconButton() {
  const t = useT();
  return (
    <ActionIcon variant="default" size="lg" onClick={openPalette} hiddenFrom="md" aria-label={t.shell.header.searchShort}>
      <IconSearch size={18} />
    </ActionIcon>
  );
}

/**
 * RF-75: save what this screen shows — its path and every filter in the URL — under a name. The menu
 * at the top lists the saved views too, so one can be opened, unpinned or deleted from any screen.
 */
export function SaveViewButton() {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(true);
  const save = useSaveView();
  const remove = useDeleteView();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const submit = () =>
    save.mutate(
      { name, path: location.pathname, query: location.search.replace(/^\?/, ''), pinned },
      {
        onSuccess: () => {
          setOpened(false);
          setName('');
          notifications.show({ title: t.shell.header.viewSaved, message: pinned ? t.shell.header.viewSavedPinned : t.shell.header.viewSavedSearch });
        },
      },
    );
  // M23: a deleted view is one click to bring back, so the confirmation is the only guard.
  const removeView = async (view: SavedView) => {
    const ok = await confirm({
      title: t.shell.header.deleteViewTitle(view.name),
      body: t.shell.header.deleteViewBody,
      confirmLabel: t.shell.header.deleteViewConfirm,
    });
    if (!ok) return;
    remove.mutate(view.id, {
      onSuccess: () =>
        notifyUndo(t.shell.header.viewDeleted(view.name), () =>
          save.mutate({ name: view.name, path: view.path, query: view.query, pinned: view.pinned }),
        ),
    });
  };
  return (
    <>
      <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" width={300} withinPortal>
        <Menu.Target>
          <Tooltip label={t.shell.header.savedViews}>
            <ActionIcon variant="default" size="lg" aria-label={t.shell.header.savedViews}>
              <IconBookmark size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBookmarkPlus size={14} />} onClick={() => setOpened(true)}>
            {t.shell.header.saveThisView}
          </Menu.Item>
          <Menu.Divider />
          <SavedViewsList
            onOpen={(url) => {
              setMenuOpen(false);
              navigate(url);
            }}
            onDelete={removeView}
          />
        </Menu.Dropdown>
      </Menu>
      <Modal opened={opened} onClose={() => setOpened(false)} title={t.shell.header.saveThisViewTitle}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {t.shell.header.saveThisViewBody} <span className="mono">{location.pathname + location.search}</span>
          </Text>
          <TextInput
            label={t.shell.header.name}
            placeholder={t.shell.header.namePlaceholder}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
            onKeyDown={(event) => event.key === 'Enter' && name.trim() && submit()}
          />
          <Checkbox label={t.shell.header.pinToSidebar} checked={pinned} onChange={(event) => setPinned(event.currentTarget.checked)} />
          {save.error && (
            <Text size="sm" c="red">
              {save.error.message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button onClick={submit} disabled={!name.trim()} loading={save.isPending}>
              {t.shell.header.save}
            </Button>
          </Group>
        </Stack>
      </Modal>
      {confirmDialog}
    </>
  );
}

/** Saved views as a menu section, pinned first; each can be pinned, unpinned or deleted in place. */
export function SavedViewsList({ onOpen, onDelete }: { onOpen: (url: string) => void; onDelete: (view: SavedView) => void }) {
  const t = useT();
  const views = useViews();
  const save = useSaveView();
  const items = views.data?.items ?? [];
  if (!items.length) {
    return (
      <Text size="xs" c="dimmed" p="xs">
        {t.shell.header.noViews}
      </Text>
    );
  }
  return (
    <Stack gap={2} p={4}>
      {items.map((view) => (
        <Group key={view.id} gap={4} wrap="nowrap" justify="space-between">
          <Button variant="subtle" size="compact-sm" onClick={() => onOpen(view.url)} style={{ flex: 1 }} justify="flex-start">
            {view.name}
          </Button>
          <Tooltip label={view.pinned ? t.shell.header.unpin : t.shell.header.pin}>
            <Checkbox
              size="xs"
              checked={view.pinned}
              aria-label={t.shell.header.pinNamed(view.name)}
              onChange={() => save.mutate({ ...view, pinned: !view.pinned })}
            />
          </Tooltip>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label={t.shell.header.deleteNamed(view.name)} onClick={() => onDelete(view)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}

/** RF-95, RF-96, RF-98: how this person reads the screen, kept in this browser. The theme is one of them (M20). */
export function PreferencesMenu() {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [preferences, set] = usePreferences();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Menu position="bottom-end" width={290} closeOnItemClick={false} withinPortal>
      <Menu.Target>
        <Tooltip label={t.shell.preferences.title}>
          <ActionIcon variant="default" size="lg" aria-label={t.shell.preferences.title}>
            <IconSettings2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap="sm" p="xs">
          <Stack gap={4}>
            {/* The icon is for someone who cannot read the current language; the options name themselves. */}
            <Group gap={6} wrap="nowrap">
              <IconLanguage size={14} aria-hidden />
              <Text size="xs" fw={600}>
                {t.shell.preferences.language}
              </Text>
            </Group>
            <Select
              size="xs"
              aria-label={t.shell.preferences.language}
              value={locale}
              onChange={(value) => isLocale(value) && setLocale(value)}
              data={LOCALES.map((value) => ({ value, label: LOCALE_NAMES[value] }))}
              allowDeselect={false}
              comboboxProps={{ withinPortal: false }}
            />
          </Stack>
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              {t.shell.preferences.theme}
            </Text>
            <SegmentedControl
              size="xs"
              value={colorScheme}
              onChange={(value) => setColorScheme(value as 'light' | 'dark' | 'auto')}
              data={[
                { value: 'light', label: t.shell.preferences.themeLight },
                { value: 'dark', label: t.shell.preferences.themeDark },
                { value: 'auto', label: t.shell.preferences.themeSystem },
              ]}
            />
          </Stack>
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              {t.shell.preferences.density}
            </Text>
            <SegmentedControl
              size="xs"
              value={preferences.density}
              onChange={(value) => set({ density: value as 'confortavel' | 'compacta' })}
              data={[
                { value: 'confortavel', label: t.shell.preferences.densityComfortable },
                { value: 'compacta', label: t.shell.preferences.densityCompact },
              ]}
            />
          </Stack>
          <Switch
            size="xs"
            label={t.shell.preferences.chartPatterns}
            description={t.shell.preferences.chartPatternsHint}
            checked={preferences.chartPatterns}
            onChange={(event) => set({ chartPatterns: event.currentTarget.checked })}
          />
          <Switch
            size="xs"
            label={t.shell.preferences.reduceMotion}
            description={t.shell.preferences.reduceMotionHint}
            checked={preferences.reduceMotion}
            onChange={(event) => set({ reduceMotion: event.currentTarget.checked })}
          />
        </Stack>
        <Menu.Divider />
        <Menu.Item leftSection={<IconKeyboard size={14} />} rightSection={<Kbd size="xs">?</Kbd>} onClick={openShortcuts} closeMenuOnClick>
          {t.shell.preferences.shortcuts}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
