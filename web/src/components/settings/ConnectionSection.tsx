import { Alert, Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { IconPlugConnected } from '@tabler/icons-react';
import { useMemo } from 'react';
import { Link } from 'react-router';

import { useDiscovery, useTestJiraDraft } from '../../api/hooks';
import type { ConfigView } from '../../api/types';
import { useT } from '../../i18n';
import { fieldsOf, jiraTestBody } from '../../lib/config';
import { ErrorState } from '../common';
import { ConfigCard } from '../config/ConfigCard';
import { JiraTestResult } from '../config/JiraTestResult';

/** The credential itself; concurrency, retries and timeout sit in the collapsed advanced area. */
const CREDENTIAL = new Set(['jira_base_url', 'jira_email', 'jira_api_token']);

/**
 * The Jira credential, edited like every other setting, plus a test that runs on what is in the
 * form — saved or not — and the discovery of boards and fields, which runs on what is saved.
 */
export function ConnectionSection({ view, onDirtyChange }: { view: ConfigView; onDirtyChange: (dirty: boolean) => void }) {
  const t = useT();
  const m = t.config;
  const old = t.tracking.settings.connection;
  const fields = fieldsOf(view, 'jira');
  const main = useMemo(() => fields.filter((field) => CREDENTIAL.has(field.key)), [fields]);
  const advanced = useMemo(() => fields.filter((field) => !CREDENTIAL.has(field.key)), [fields]);
  const test = useTestJiraDraft();
  const discovery = useDiscovery();

  return (
    <Stack gap="md">
      <ConfigCard
        title={m.groups.jira.title}
        description={m.groups.jira.description}
        fields={main}
        advanced={advanced}
        advancedLabel={m.connection.advanced}
        advancedHint={m.connection.advancedHint}
        onDirtyChange={onDirtyChange}
      >
        {(draft) => (
          <Stack gap="sm">
            <Group gap="sm" wrap="wrap">
              <Button
                leftSection={<IconPlugConnected size={16} />}
                onClick={() => test.mutate(jiraTestBody(draft.fields, draft.edits))}
                loading={test.isPending}
              >
                {m.connection.test}
              </Button>
              <Button
                variant="default"
                onClick={() => discovery.mutate()}
                loading={discovery.isPending}
                disabled={!view.jira_configured || draft.isDirty}
              >
                {old.discover}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {draft.isDirty ? m.connection.discoverHint : m.connection.testHint}
            </Text>
            <JiraTestResult result={test.data} error={test.error} />
            {discovery.error && <ErrorState error={discovery.error} />}
            {discovery.data && (
              <Alert color={discovery.data.missing_fields.length ? 'yellow' : 'teal'} variant="light" title={old.discoveryDone}>
                {old.discoveryFound(discovery.data.boards.length, discovery.data.statuses.length)}{' '}
                {discovery.data.missing_fields.length ? old.missingFields(discovery.data.missing_fields.join(', ')) : old.allFound}
              </Alert>
            )}
          </Stack>
        )}
      </ConfigCard>
      <Text size="xs" c="dimmed">
        {old.fromScratchBefore}{' '}
        <Anchor component={Link} to="/setup" size="xs">
          {old.guideLink}
        </Anchor>{' '}
        {old.fromScratchAfter}
      </Text>
    </Stack>
  );
}
