import { Box, NavLink, Tabs, Text } from '@mantine/core';
import { Link } from 'react-router';

import { useT } from '../../i18n';
import { SECTIONS, isSection, type SectionGroup, type SectionId } from './sections';

/**
 * The section navigation: a sticky side list grouped System / Jira data / Delivery, and on a phone a
 * single row of tabs that scrolls sideways. Choosing goes through `onSelect`, which may ask before
 * leaving unsaved changes; the links still carry `?tab=` so they open in a new tab too.
 */
export function SettingsNav({ active, onSelect }: { active: SectionId; onSelect: (id: SectionId) => void }) {
  const m = useT().config;
  const groupLabel: Record<SectionGroup, string> = {
    system: m.page.groupSystem,
    jira: m.page.groupJira,
    delivery: m.page.groupDelivery,
  };
  return (
    <>
      <Box component="nav" aria-label={m.page.navAria} className="settings-nav" visibleFrom="sm">
        {SECTIONS.map((group) => (
          <Box key={group.group} mb="md">
            <Text className="kpi-label" mb={6} px={12}>
              {groupLabel[group.group]}
            </Text>
            {group.items.map(({ id, icon: Icon }) => (
              <NavLink
                key={id}
                component={Link}
                to={`/settings?tab=${id}`}
                label={m.nav[id]}
                leftSection={<Icon size={16} />}
                active={active === id}
                aria-current={active === id ? 'page' : undefined}
                className="settings-nav-link"
                onClick={(event) => {
                  // A modified click opens a new tab, as any link does.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  onSelect(id);
                }}
              />
            ))}
          </Box>
        ))}
      </Box>
      <Box hiddenFrom="sm" mb="md">
        <Tabs value={active} onChange={(value) => value && isSection(value) && onSelect(value)} variant="pills" radius="xl">
          <Tabs.List aria-label={m.page.navAria}>
            {SECTIONS.flatMap((group) =>
              group.items.map(({ id, icon: Icon }) => (
                <Tabs.Tab key={id} value={id} leftSection={<Icon size={14} />}>
                  {m.nav[id]}
                </Tabs.Tab>
              )),
            )}
          </Tabs.List>
        </Tabs>
      </Box>
    </>
  );
}
