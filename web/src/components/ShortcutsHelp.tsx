import { Group, Kbd, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Fragment, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { useT } from '../i18n';
import { groupsFor, SHORTCUT_EVENT, typing } from '../lib/shortcuts';

/** RF-81: `?` anywhere shows the shortcuts, the current screen's first. */
export function ShortcutsHelp() {
  const t = useT();
  const [opened, setOpened] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '?' && !event.ctrlKey && !event.metaKey && !typing(event.target)) {
        event.preventDefault();
        setOpened(true);
      }
    };
    const onOpen = () => setOpened(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHORTCUT_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHORTCUT_EVENT, onOpen);
    };
  }, []);

  return (
    <Modal opened={opened} onClose={() => setOpened(false)} title={t.shell.shortcuts.title} size="xl">
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {groupsFor(location.pathname).map((group) => (
          <Stack key={group.id} gap={6}>
            <Title order={5}>{group.title}</Title>
            {group.items.map((item) => (
              <Group key={item.label} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm">{item.label}</Text>
                <Group gap={4} wrap="nowrap">
                  {item.keys.map((key, index) => (
                    <Fragment key={key}>
                      {index > 0 && item.keys.length > 1 && !['←', '→', '↑', '↓'].includes(key) && (
                        <Text size="xs" c="dimmed">
                          +
                        </Text>
                      )}
                      <Kbd size="xs">{key}</Kbd>
                    </Fragment>
                  ))}
                </Group>
              </Group>
            ))}
          </Stack>
        ))}
      </SimpleGrid>
      <Text size="xs" c="dimmed" mt="md">
        {t.shell.shortcuts.macNote}
      </Text>
    </Modal>
  );
}
