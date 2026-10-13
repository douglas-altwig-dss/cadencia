import { Button, Tooltip } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';

import { useHealth } from '../api/hooks';
import { useT } from '../i18n';
import { baseFromIssueUrl, jiraSearchUrl } from '../lib/jira';

/**
 * RF-76: "Abrir no Jira" for a whole list, as one JQL search. The base address comes from the
 * health check or, when that is hidden from an unauthenticated caller, from an item's own link.
 */
export function OpenInJira({ keys, sampleUrl, label }: { keys: string[]; sampleUrl?: string | null; label?: string }) {
  const t = useT();
  const health = useHealth();
  const url = jiraSearchUrl(health.data?.jira_base_url ?? baseFromIssueUrl(sampleUrl), keys);
  if (!url) return null;
  return (
    <Tooltip label={t.shell.openInJira.tooltip(Math.min(new Set(keys).size, 200))}>
      <Button component="a" href={url} target="_blank" rel="noreferrer" size="xs" variant="default" leftSection={<IconExternalLink size={14} />}>
        {label ?? t.shell.openInJira.label}
      </Button>
    </Tooltip>
  );
}
