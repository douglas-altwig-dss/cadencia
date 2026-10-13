import { Button, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';

import { plural } from '../lib/format';
import { useHealth } from '../api/hooks';
import { baseFromIssueUrl, jiraSearchUrl } from '../lib/jira';

/**
 * RF-76: "Abrir no Jira" for a whole list, as one JQL search. The base address comes from the
 * health check or, when that is hidden from an unauthenticated caller, from an item's own link.
 */
export function OpenInJira({ keys, sampleUrl, label = 'Abrir no Jira' }: { keys: string[]; sampleUrl?: string | null; label?: string }) {
  const health = useHealth();
  const url = jiraSearchUrl(health.data?.jira_base_url ?? baseFromIssueUrl(sampleUrl), keys);
  if (!url) return null;
  return (
    <Tooltip label={`Busca no Jira com ${plural(Math.min(new Set(keys).size, 200), 'item', 'itens')}: key in (…)`}>
      <Button component="a" href={url} target="_blank" rel="noreferrer" size="xs" variant="default" leftSection={<IconExternalLink size={14} />}>
        {label}
      </Button>
    </Tooltip>
  );
}
