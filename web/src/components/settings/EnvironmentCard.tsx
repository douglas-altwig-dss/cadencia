import { Box, Paper, Stack, Text, Title } from '@mantine/core';

import type { BootstrapEntry } from '../../api/types';
import { useT, type Messages } from '../../i18n';

/** Settings that only say whether they exist: their value is a secret the API never returns. */
const PRESENCE_ONLY = new Set(['api_token', 'secret_key']);

function shown(entry: BootstrapEntry, m: Messages['config']['environment']): string {
  const { value } = entry;
  if (Array.isArray(value)) return value.length ? value.join(', ') : m.empty;
  if (typeof value === 'boolean') return PRESENCE_ONLY.has(entry.key) ? (value ? m.set : m.notSet) : value ? m.yes : m.no;
  if (value === null || value === '') return PRESENCE_ONLY.has(entry.key) ? m.notSet : m.empty;
  return String(value);
}

/**
 * The settings the deployment owns (env only): needed before the database can be reached, or
 * guarding the API itself. Read-only, as the server reports them, already masked.
 */
export function EnvironmentCard({ entries }: { entries: BootstrapEntry[] }) {
  const m = useT().config.environment;
  if (!entries.length) return null;
  return (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={4}>{m.title}</Title>
          <Text size="sm" c="dimmed">
            {m.description}
          </Text>
        </Stack>
        <Box component="dl" className="config-env">
          {entries.map((entry) => (
            <Box key={entry.key} className="config-env-row">
              <Box component="dt">
                <Text size="sm" fw={500}>
                  {(m.labels as Record<string, string | undefined>)[entry.key] ?? entry.key}
                </Text>
                <Text size="xs" c="dimmed" className="mono">
                  {entry.key}
                </Text>
              </Box>
              <Box component="dd">
                <Text size="sm" className="mono" style={{ overflowWrap: 'anywhere' }}>
                  {shown(entry, m)}
                </Text>
                <Text size="xs" c="dimmed">
                  {(m.sources as Record<string, string | undefined>)[entry.source] ?? entry.source}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}
