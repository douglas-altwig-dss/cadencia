import {
  ActionIcon,
  AppShell,
  Box,
  Burger,
  Group,
  Loader,
  NavLink,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconBookmark,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconWaveSine,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';

import { useViews } from './api/featureHooks';

import { useHealth, useStatus } from './api/hooks';
import { Announcer, announce } from './components/Announcer';
import { CommandPalette } from './components/CommandPalette';
import { Empty } from './components/common';
import { PreferencesMenu, SaveViewButton, SearchButton, SearchIconButton } from './components/HeaderTools';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { FetchBar } from './components/FetchBar';
import { useT } from './i18n';
import { nav } from './lib/navigation';
import { useApplyPreferences } from './lib/preferences';
import { useScrollHints } from './lib/scrollHints';
import { AudienceView } from './pages/AudienceView';
import { fmtDateTime, fromNow, setDisplayTimeZone } from './lib/format';
import { BoardPage } from './pages/BoardPage';
import { DashboardPage } from './pages/DashboardPage';
import { DeckPage } from './pages/DeckPage';
import { EpicPage } from './pages/EpicPage';
import { FlowPage } from './pages/FlowPage';
import { IssuePage } from './pages/IssuePage';
import { PeoplePage, PersonPage } from './pages/PeoplePages';
import { SettingsPage } from './pages/SettingsPage';
import { SharedDeckPage } from './pages/SharedDeckPage';
import { SprintPage } from './pages/SprintPage';
import { StatusPage } from './pages/StatusPage';
import { TimelineFocusPage } from './pages/TimelineFocusPage';
import { WizardPage } from './pages/WizardPage';

const NAV_WIDTH = 220;
/** Just wide enough for the icon plus its focus ring. */
const NAV_RAIL = 64;

/**
 * RF-35, globally: how fresh the data behind every screen is, one glance from anywhere. On a phone
 * there is no room for the words, so ``compact`` keeps the coloured dot and its label for screen readers.
 */
function CollectionPill({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const status = useStatus();
  const data = status.data;
  if (!data) return null;
  const successes = data.boards.map((b) => b.last_success_at).filter((v): v is string => !!v);
  const oldest = successes.sort()[0] ?? null;
  const failed = data.boards.some((b) => b.last_run?.status === 'failed');
  const partial = data.boards.some((b) => b.last_run?.status === 'partial');
  const color = failed ? 'red' : partial ? 'yellow' : oldest ? 'teal' : 'gray';
  const label = data.collecting ? t.shell.pill.collecting : oldest ? t.shell.pill.collected(fromNow(oldest)) : t.shell.pill.neverCollected;
  const dot = data.collecting ? (
    <Loader size={10} />
  ) : (
    <Box w={8} h={8} style={{ borderRadius: 99, background: `var(--mantine-color-${color}-6)` }} aria-hidden />
  );
  if (compact) {
    return (
      <UnstyledButton component={Link} to="/status" hiddenFrom="sm" aria-label={t.shell.pill.openStatus(label)}>
        <Group justify="center" w={36} h={36} style={{ border: '1px solid var(--border-soft)', borderRadius: 99, background: 'var(--surface-sunken)' }}>
          {dot}
        </Group>
      </UnstyledButton>
    );
  }
  return (
    <Tooltip
      label={
        data.collecting
          ? t.shell.pill.tipCollecting
          : oldest
            ? failed
              ? t.shell.pill.tipOldestFailed(fmtDateTime(oldest))
              : t.shell.pill.tipOldest(fmtDateTime(oldest))
            : t.shell.pill.tipNever
      }
      multiline
      w={260}
    >
      <UnstyledButton component={Link} to="/status" visibleFrom="sm" aria-label={t.shell.pill.openStatus(label)}>
        <Group gap={6} px="sm" py={6} style={{ border: '1px solid var(--border-soft)', borderRadius: 99, background: 'var(--surface-sunken)' }}>
          {dot}
          <Text size="xs" fw={500}>
            {label}
          </Text>
        </Group>
      </UnstyledButton>
    </Tooltip>
  );
}

/** When a background collection finishes, every view is refreshed. */
function useCollectionWatcher() {
  const t = useT();
  const status = useStatus();
  const client = useQueryClient();
  const previous = useRef(false);
  const collecting = status.data?.collecting ?? false;
  useEffect(() => {
    if (previous.current && !collecting) {
      client.invalidateQueries();
      notifications.show({ title: t.shell.app.collectionDoneTitle, message: t.shell.app.collectionDoneMessage });
      announce(t.shell.app.collectionDoneAnnounce);
    }
    previous.current = collecting;
  }, [collecting, client, t]);
}

export function App() {
  const location = useLocation();
  useApplyPreferences();
  useScrollHints();
  // RF-100: the projector window is the slide and nothing else — no menu, no header.
  if (location.pathname.startsWith('/apresentar/plateia')) return <AudienceView />;
  // #14: a read-only share link — no shell, no sign-in, one deck.
  if (location.pathname.startsWith('/compartilhado/')) {
    return (
      <Routes>
        <Route path="/compartilhado/:token" element={<SharedDeckPage />} />
      </Routes>
    );
  }
  return <Shell />;
}

/** RF-75: views someone pinned, under the main navigation. */
function PinnedViews({ rail }: { rail: boolean }) {
  const t = useT();
  const views = useViews();
  const location = useLocation();
  const pinned = (views.data?.items ?? []).filter((v) => v.pinned);
  if (!pinned.length) return null;
  return (
    <>
      {!rail && <div className="nav-section">{t.shell.app.savedViews}</div>}
      {pinned.map((view) => {
        const active = location.pathname + location.search === view.url;
        const link = (
          <NavLink
            key={view.id}
            component={Link}
            to={view.url}
            label={rail ? undefined : view.name}
            leftSection={<IconBookmark size={16} />}
            active={active}
            aria-label={rail ? view.name : undefined}
            styles={rail ? { root: { justifyContent: 'center', paddingInline: 0 }, section: { marginInlineEnd: 0 }, body: { display: 'none' } } : undefined}
          />
        );
        return rail ? (
          <Tooltip key={view.id} label={view.name} position="right" withArrow>
            {link}
          </Tooltip>
        ) : (
          link
        );
      })}
    </>
  );
}

function Shell() {
  const t = useT();
  const [opened, { toggle, close }] = useDisclosure();
  // Remembered per browser: a rail is a working preference, not something to re-choose every visit.
  const [collapsed, setCollapsed] = useLocalStorage({ key: 'cadencia-nav-collapsed', defaultValue: false });
  // The rail is a desktop idea. On a phone the navbar is a drawer, and a drawer of bare icons is
  // worse than no drawer, so the collapse never applies there.
  const wide = useMediaQuery('(min-width: 48em)') ?? true;
  const rail = collapsed && wide;
  const location = useLocation();
  const health = useHealth();
  useCollectionWatcher();

  useEffect(() => setDisplayTimeZone(health.data?.timezone), [health.data?.timezone]);
  useEffect(() => close(), [location.pathname, close]);

  return (
    <>
      <a href="#conteudo" className="skip-link">
        {t.shell.app.skipToContent}
      </a>
      <FetchBar />
      <AppShell
        header={{ height: 60 }}
        navbar={{ width: rail ? NAV_RAIL : NAV_WIDTH, breakpoint: 'sm', collapsed: { mobile: !opened } }}
        padding="md"
      >
        <AppShell.Header className="app-header">
          <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="md">
            <Group gap="sm" wrap="nowrap">
              <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t.shell.app.openNavigation} />
              <Tooltip label={collapsed ? t.shell.app.expandMenu : t.shell.app.collapseMenu}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  visibleFrom="sm"
                  onClick={() => setCollapsed((value) => !value)}
                  aria-label={collapsed ? t.shell.app.expandSidebar : t.shell.app.collapseSidebar}
                  aria-expanded={!collapsed}
                  aria-controls="menu-lateral"
                >
                  {collapsed ? <IconLayoutSidebarLeftExpand size={18} /> : <IconLayoutSidebarLeftCollapse size={18} />}
                </ActionIcon>
              </Tooltip>
              <UnstyledButton component={Link} to="/" aria-label={t.shell.app.brandHome}>
                <Group gap={8} wrap="nowrap">
                  <span className="brand-mark" aria-hidden>
                    <IconWaveSine size={18} stroke={2.2} />
                  </span>
                  <Text fw={700} size="lg" style={{ letterSpacing: '-0.01em' }}>
                    Cadência
                  </Text>
                </Group>
              </UnstyledButton>
            </Group>
            <SearchButton />
            <SearchIconButton />
            <Group gap="xs" wrap="nowrap">
              <CollectionPill />
              <CollectionPill compact />
              <SaveViewButton />
              <PreferencesMenu />
            </Group>
          </Group>
        </AppShell.Header>
        <AppShell.Navbar p="xs" id="menu-lateral" aria-label={t.shell.app.mainNavigation} className="app-nav">
          {nav().map((group, index) => (
            <Box key={group.section} mt={index === 0 ? 0 : rail ? 'sm' : 0}>
              {!rail && <div className="nav-section">{group.section}</div>}
              {group.items.map((item) => {
                const IconComponent = item.icon;
                const active = item.match(location.pathname);
                const link = (
                  <NavLink
                    key={item.to}
                    component={Link}
                    to={item.to}
                    label={rail ? undefined : item.label}
                    leftSection={<IconComponent size={18} stroke={1.8} />}
                    active={active}
                    // The label is gone from the screen but never from the accessibility tree.
                    aria-label={rail ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    styles={
                      rail
                        ? {
                            root: { justifyContent: 'center', paddingInline: 0 },
                            section: { marginInlineEnd: 0 },
                            body: { display: 'none' },
                          }
                        : undefined
                    }
                  />
                );
                // Collapsed, the icon alone has to say where it goes.
                return rail ? (
                  <Tooltip key={item.to} label={item.label} position="right" withArrow openDelay={200}>
                    {link}
                  </Tooltip>
                ) : (
                  link
                );
              })}
            </Box>
          ))}
          <PinnedViews rail={rail} />
          {wide && !rail && (
            <Text size="xs" c="dimmed" mt="auto" px="sm" pb="xs">
              {t.shell.app.pressForShortcuts(<b key="key">?</b>)}
            </Text>
          )}
        </AppShell.Navbar>
        <AppShell.Main id="conteudo">
          <div className={location.pathname.startsWith('/apresentacao') ? 'page is-wide' : 'page'}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/inicio" element={<WizardPage />} />
              {/* Now a tab of Pessoas — kept as a redirect so an old bookmark or link still lands. */}
              <Route path="/minha-semana" element={<Navigate to="/pessoas?tab=minha-semana" replace />} />
              <Route path="/boards/:boardId" element={<BoardPage />} />
              <Route path="/boards/:boardId/sprints/:sprintId" element={<SprintPage />} />
              <Route path="/boards/:boardId/epics/:epicKey" element={<EpicPage />} />
              <Route path="/issues/:key" element={<IssuePage />} />
              <Route path="/fluxo" element={<FlowPage />} />
              <Route path="/pessoas" element={<PeoplePage />} />
              <Route path="/pessoas/:accountId" element={<PersonPage />} />
              <Route path="/apresentacao" element={<DeckPage />} />
              <Route path="/timeline-foco" element={<TimelineFocusPage />} />
              <Route path="/status" element={<StatusPage />} />
              <Route path="/configuracao" element={<SettingsPage />} />
              <Route path="*" element={<Empty title={t.shell.app.notFoundTitle}>{t.shell.app.notFoundBody}</Empty>} />
            </Routes>
          </div>
        </AppShell.Main>
      </AppShell>
      <Announcer />
      <CommandPalette />
      <ShortcutsHelp />
    </>
  );
}
