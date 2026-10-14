import { Alert, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

import type { ConnectionResult } from '../../api/types';
import { useT } from '../../i18n';
import { ErrorState } from '../common';

/**
 * What a connection test answered: who the credential signs in as, or why it failed and what to do.
 * Settings' connection card and the configuration wizard both show it.
 */
export function JiraTestResult({ result, error }: { result?: ConnectionResult; error?: Error | null }) {
  const m = useT().tracking.settings.connection;
  if (error) return <ErrorState error={error} />;
  if (!result) return null;
  if (result.ok) {
    return (
      <Alert color="teal" variant="light" icon={<IconCheck size={18} />} title={m.connected}>
        {m.authenticatedAs(
          result.identity?.name ?? '',
          result.identity?.email ?? result.identity?.account_id ?? '',
          Boolean(result.permissions?.BROWSE_PROJECTS),
        )}
      </Alert>
    );
  }
  return (
    <Alert color="red" variant="light" title={m.failed(String(result.error?.cause))}>
      {result.error?.message}
      {result.error?.action && (
        <Text size="sm" fw={500} mt={4}>
          {m.whatToDo(String(result.error.action))}
        </Text>
      )}
    </Alert>
  );
}
