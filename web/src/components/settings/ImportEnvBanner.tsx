import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDatabaseImport } from '@tabler/icons-react';

import { useImportEnv } from '../../api/hooks';
import type { ConfigView } from '../../api/types';
import { useT } from '../../i18n';
import { announce } from '../Announcer';
import { Note } from '../common';

/** Values still read from `.env` are offered for import once, above every System section. */
export function ImportEnvBanner({ view }: { view: ConfigView }) {
  const m = useT().config.importEnv;
  const importEnv = useImportEnv();
  const count = view.importable.length;
  if (!count) return null;
  const run = () =>
    importEnv.mutate(undefined, {
      onSuccess: (result) => {
        const message = m.done(result.imported?.length ?? count);
        notifications.show({ title: m.doneTitle, message });
        announce(message);
      },
      onError: (error) => notifications.show({ color: 'red', title: m.failed, message: error.message }),
    });
  return (
    <Note>
      <Group justify="space-between" gap="sm" wrap="wrap">
        <Text size="sm" style={{ flex: '1 1 320px' }}>
          {m.body(count)}
        </Text>
        <Button size="xs" variant="light" leftSection={<IconDatabaseImport size={14} />} onClick={run} loading={importEnv.isPending}>
          {m.action}
        </Button>
      </Group>
    </Note>
  );
}
