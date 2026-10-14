import { Alert, Button, Group, Stack, Table, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import { useFields, useSaveOverrides } from '../../api/hooks';
import type { FieldMap } from '../../api/types';
import { useT } from '../../i18n';
import { ErrorState, Loading, Note } from '../common';

const FIELD_KEYS: (keyof FieldMap)[] = ['story_points', 'sprint', 'epic_link', 'flagged', 'rank'];

/** The instance's custom field ids, as discovered, with a manual override for each. */
export function FieldsTab() {
  const fields = useFields();
  const save = useSaveOverrides();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const m = useT().tracking.settings.fields;
  useEffect(() => {
    if (fields.data) {
      const o = fields.data.overrides;
      setDraft({
        story_points: (o.story_points ?? []).join(', '),
        sprint: o.sprint ?? '',
        epic_link: o.epic_link ?? '',
        flagged: o.flagged ?? '',
        rank: o.rank ?? '',
      });
    }
  }, [fields.data]);
  if (fields.isLoading) return <Loading />;
  if (fields.error) return <ErrorState error={fields.error} />;
  const data = fields.data!;
  const submit = () =>
    save.mutate(
      {
        story_points: draft.story_points ? draft.story_points.split(',').map((s) => s.trim()).filter(Boolean) : [],
        sprint: draft.sprint || null,
        epic_link: draft.epic_link || null,
        flagged: draft.flagged || null,
        rank: draft.rank || null,
      },
      { onSuccess: () => notifications.show({ title: m.savedTitle, message: m.savedMessage }) },
    );
  return (
    <Stack gap="sm">
      <Note>{m.note}</Note>
      {data.missing.length > 0 && (
        <Alert color="yellow" variant="light">
          {m.missing(data.missing.join(', '))}
        </Alert>
      )}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.colField}</Table.Th>
            <Table.Th>{m.colDiscovered}</Table.Th>
            <Table.Th>{m.colOverride}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {FIELD_KEYS.map((key) => {
            const discovered = data.discovered[key];
            return (
              <Table.Tr key={key}>
                <Table.Td>{m.labels[key]}</Table.Td>
                <Table.Td className="mono">{Array.isArray(discovered) ? discovered.join(', ') || '—' : discovered ?? '—'}</Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label={m.overrideAria(m.labels[key])}
                    placeholder="customfield_…"
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.currentTarget.value })}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group>
        <Button onClick={() => submit()} loading={save.isPending}>
          {m.save}
        </Button>
        {save.error && <ErrorState error={save.error} title={m.notSaved} />}
      </Group>
    </Stack>
  );
}
