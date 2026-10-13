import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Kbd,
  Menu,
  Modal,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBookmark, IconBookmarkPlus, IconKeyboard, IconSearch, IconSettings2, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useDeleteView, useSaveView, useViews } from '../api/featureHooks';
import type { SavedView } from '../api/types';
import { usePreferences } from '../lib/preferences';
import { openShortcuts } from '../lib/shortcuts';
import { notifyUndo, useConfirm } from './common';

export const openPalette = () => window.dispatchEvent(new Event('cadencia:palette'));

/** RF-80: the palette's visible door, for people who never learn Ctrl+K. */
export function SearchButton() {
  return (
    <Button
      variant="default"
      leftSection={<IconSearch size={15} />}
      rightSection={<Kbd size="xs">Ctrl K</Kbd>}
      onClick={openPalette}
      visibleFrom="md"
      aria-label="Buscar (Ctrl+K)"
      className="search-trigger"
      fw={400}
      styles={{ inner: { justifyContent: 'space-between' }, label: { flex: 1, color: 'var(--text-muted)' } }}
    >
      Buscar boards, sprints e itens…
    </Button>
  );
}

/** M18: a phone has no Ctrl+K, so the same palette opens from an icon there. */
export function SearchIconButton() {
  return (
    <ActionIcon variant="default" size="lg" onClick={openPalette} hiddenFrom="md" aria-label="Buscar boards, sprints e itens">
      <IconSearch size={18} />
    </ActionIcon>
  );
}

/**
 * RF-75: save what this screen shows — its path and every filter in the URL — under a name. The menu
 * at the top lists the saved views too, so one can be opened, unpinned or deleted from any screen.
 */
export function SaveViewButton() {
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
          notifications.show({ title: 'Visão salva', message: pinned ? 'Ela aparece no menu lateral.' : 'Ela aparece na busca (Ctrl+K).' });
        },
      },
    );
  // M23: a deleted view is one click to bring back, so the confirmation is the only guard.
  const removeView = async (view: SavedView) => {
    const ok = await confirm({
      title: `Excluir a visão ${view.name}?`,
      body: 'Ela sai do menu e da busca (Ctrl+K).',
      confirmLabel: 'Excluir visão',
    });
    if (!ok) return;
    remove.mutate(view.id, {
      onSuccess: () =>
        notifyUndo(`Visão ${view.name} excluída`, () =>
          save.mutate({ name: view.name, path: view.path, query: view.query, pinned: view.pinned }),
        ),
    });
  };
  return (
    <>
      <Menu opened={menuOpen} onChange={setMenuOpen} position="bottom-end" width={300} withinPortal>
        <Menu.Target>
          <Tooltip label="Visões salvas">
            <ActionIcon variant="default" size="lg" aria-label="Visões salvas">
              <IconBookmark size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconBookmarkPlus size={14} />} onClick={() => setOpened(true)}>
            Salvar esta visão…
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
      <Modal opened={opened} onClose={() => setOpened(false)} title="Salvar esta visão">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Guarda a tela atual com os filtros escolhidos: <span className="mono">{location.pathname + location.search}</span>
          </Text>
          <TextInput
            label="Nome"
            placeholder="ex.: Riscos do time Plataforma"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            data-autofocus
            onKeyDown={(event) => event.key === 'Enter' && name.trim() && submit()}
          />
          <Checkbox label="Fixar no menu lateral" checked={pinned} onChange={(event) => setPinned(event.currentTarget.checked)} />
          {save.error && (
            <Text size="sm" c="red">
              {save.error.message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button onClick={submit} disabled={!name.trim()} loading={save.isPending}>
              Salvar
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
  const views = useViews();
  const save = useSaveView();
  const items = views.data?.items ?? [];
  if (!items.length) {
    return (
      <Text size="xs" c="dimmed" p="xs">
        Nenhuma visão salva. Use “Salvar esta visão” para guardar a tela atual com os filtros.
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
          <Tooltip label={view.pinned ? 'Desafixar do menu' : 'Fixar no menu'}>
            <Checkbox
              size="xs"
              checked={view.pinned}
              aria-label={`Fixar ${view.name} no menu`}
              onChange={() => save.mutate({ ...view, pinned: !view.pinned })}
            />
          </Tooltip>
          <ActionIcon size="sm" variant="subtle" color="red" aria-label={`Excluir a visão ${view.name}`} onClick={() => onDelete(view)}>
            <IconTrash size={14} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}

/** RF-95, RF-96, RF-98: how this person reads the screen, kept in this browser. The theme is one of them (M20). */
export function PreferencesMenu() {
  const [preferences, set] = usePreferences();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <Menu position="bottom-end" width={290} closeOnItemClick={false} withinPortal>
      <Menu.Target>
        <Tooltip label="Preferências de exibição">
          <ActionIcon variant="default" size="lg" aria-label="Preferências de exibição">
            <IconSettings2 size={18} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Stack gap="sm" p="xs">
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              Tema
            </Text>
            <SegmentedControl
              size="xs"
              value={colorScheme}
              onChange={(value) => setColorScheme(value as 'light' | 'dark' | 'auto')}
              data={[
                { value: 'light', label: 'Claro' },
                { value: 'dark', label: 'Escuro' },
                { value: 'auto', label: 'Sistema' },
              ]}
            />
          </Stack>
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              Densidade das tabelas
            </Text>
            <SegmentedControl
              size="xs"
              value={preferences.density}
              onChange={(value) => set({ density: value as 'confortavel' | 'compacta' })}
              data={[
                { value: 'confortavel', label: 'Confortável' },
                { value: 'compacta', label: 'Compacta' },
              ]}
            />
          </Stack>
          <Switch
            size="xs"
            label="Padrões nos gráficos"
            description="hachuras além da cor, para distinguir séries sem depender dela"
            checked={preferences.chartPatterns}
            onChange={(event) => set({ chartPatterns: event.currentTarget.checked })}
          />
          <Switch
            size="xs"
            label="Reduzir animações"
            description="o sistema operacional também é respeitado"
            checked={preferences.reduceMotion}
            onChange={(event) => set({ reduceMotion: event.currentTarget.checked })}
          />
        </Stack>
        <Menu.Divider />
        <Menu.Item leftSection={<IconKeyboard size={14} />} rightSection={<Kbd size="xs">?</Kbd>} onClick={openShortcuts} closeMenuOnClick>
          Atalhos de teclado
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
