import { Stack } from '@mantine/core';

import { useConfig } from '../../api/hooks';
import { useT } from '../../i18n';
import { fieldsOf } from '../../lib/config';
import { ErrorState, Loading, Note } from '../common';
import { ConfigCard } from '../config/ConfigCard';
import { ConnectionSection } from './ConnectionSection';
import { EnvironmentCard } from './EnvironmentCard';
import { ImportEnvBanner } from './ImportEnvBanner';
import { CONFIG_GROUP_OF, type SystemSectionId } from './sections';

/**
 * One System section: the `.env` import banner, then the section's group of `GET /config` as a card.
 * Render it with `key={section}` so a draft never carries over from one section to the next.
 */
export function SystemSection({ section, onDirtyChange }: { section: SystemSectionId; onDirtyChange: (dirty: boolean) => void }) {
  const m = useT().config;
  const config = useConfig();
  if (config.isLoading) return <Loading />;
  if (config.error || !config.data) return <ErrorState error={config.error} />;
  const view = config.data;
  const group = CONFIG_GROUP_OF[section];
  const text = m.groups[group];

  return (
    <Stack gap="md">
      <ImportEnvBanner view={view} />
      {section === 'conexao' ? (
        <ConnectionSection view={view} onDirtyChange={onDirtyChange} />
      ) : (
        <ConfigCard title={text.title} description={text.description} fields={fieldsOf(view, group)} onDirtyChange={onDirtyChange}>
          {section === 'ia'
            ? (draft) => {
                const enabled = draft.fields.find((field) => field.key === 'ai_enabled');
                return enabled && draft.value(enabled) ? <Note>{m.ai.privacy}</Note> : null;
              }
            : undefined}
        </ConfigCard>
      )}
      {section === 'geral' && <EnvironmentCard entries={view.bootstrap} />}
    </Stack>
  );
}
