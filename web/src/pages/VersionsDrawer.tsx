import { Alert, Badge, Button, Group, List, Paper, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useDeleteVersion, useNameVersion, useRestoreVersion, useVersion, useVersions } from '../api/featureHooks';
import { announce } from '../components/Announcer';
import { ErrorState, Loading } from '../components/common';
import { useAuthorName } from '../components/editor/CommentsPanel';
import { useT } from '../i18n';
import { fmtDateTime, fromNow } from '../lib/format';

/**
 * RF-87: the edits and the mapping, as versions somebody can go back to. Autosave leaves one
 * rolling copy per ten minutes (the last 50 kept); a version given a name is kept for good.
 * Restoring first stores what it replaces, so a restore can itself be undone.
 */
export function VersionsDrawer({ templateId, onRestored }: { templateId: number; onRestored: (kind: 'edits' | 'mapping') => void }) {
  const t = useT();
  const v = t.deck.versions;
  const [kind, setKind] = useState<'edits' | 'mapping'>('edits');
  const [selected, setSelected] = useState<number | null>(null);
  const [label, setLabel] = useState('');
  const [author] = useAuthorName();
  const versions = useVersions(templateId, kind);
  const detail = useVersion(selected);
  const name = useNameVersion(templateId);
  const restore = useRestoreVersion(templateId);
  const remove = useDeleteVersion(templateId);

  /** Two clicks, not a dialog: the first arms the button and says what will be kept. */
  const [armed, setArmed] = useState<number | null>(null);
  const doRestore = (id: number) =>
    restore.mutate(
      { id, author: author || undefined },
      {
        onSuccess: () => {
          notifications.show({ title: v.restored, message: kind === 'edits' ? v.restoredEdits : v.restoredMapping });
          announce(v.restoredAnnounce);
          setSelected(null);
          setArmed(null);
          onRestored(kind);
        },
      },
    );

  return (
    <Stack gap="md">
      <SegmentedControl
        value={kind}
        onChange={(value) => {
          setKind(value as 'edits' | 'mapping');
          setSelected(null);
        }}
        data={[
          { value: 'edits', label: v.edits },
          { value: 'mapping', label: v.mapping },
        ]}
      />
      <Paper withBorder p="sm">
        <Group gap="xs" align="flex-end">
          <TextInput label={v.saveAs} placeholder={v.saveAsPlaceholder} value={label} onChange={(e) => setLabel(e.currentTarget.value)} style={{ flex: 1 }} />
          <Button
            disabled={!label.trim()}
            loading={name.isPending}
            onClick={() => name.mutate({ kind, label, author: author || undefined }, { onSuccess: () => setLabel('') })}
          >
            {v.save}
          </Button>
        </Group>
      </Paper>
      {versions.isLoading && <Loading rows={4} />}
      {versions.error && <ErrorState error={versions.error} />}
      {versions.data && versions.data.items.length === 0 && (
        <Text size="sm" c="dimmed">
          {kind === 'edits' ? v.emptyEdits : v.emptyMapping}
        </Text>
      )}
      <Stack gap={4}>
        {versions.data?.items.map((version) => (
          <Paper
            key={version.id}
            withBorder
            p="xs"
            onClick={() => setSelected(version.id === selected ? null : version.id)}
            style={{ cursor: 'pointer', borderColor: version.id === selected ? 'var(--mantine-primary-color-filled)' : undefined }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm" fw={version.auto ? 400 : 600}>
                  {version.label || (version.auto ? v.autosave : v.unnamed)}
                </Text>
                <Text size="xs" c="dimmed">
                  <Tooltip label={fmtDateTime(version.updated_at)}>
                    <span>{fromNow(version.updated_at)}</span>
                  </Tooltip>
                  {version.author ? ` · ${version.author}` : ''}
                </Text>
              </Stack>
              <Badge size="xs" variant="light" color={version.auto ? 'gray' : 'petrol'}>
                {version.auto ? v.auto : v.named}
              </Badge>
            </Group>
            {selected === version.id && (
              <Stack gap="xs" mt="xs" onClick={(e) => e.stopPropagation()}>
                {detail.isLoading && <Loading rows={2} />}
                {detail.data && (detail.data.diff.same ? (
                  <Alert variant="light" color="gray" p="xs">
                    <Text size="xs">{v.same}</Text>
                  </Alert>
                ) : (
                  <Stack gap={2}>
                    <Text size="xs" fw={500}>
                      {v.wouldChange}
                    </Text>
                    <List size="xs">
                      {detail.data.diff.slides.slice(0, 12).map((s) => (
                        <List.Item key={s.slide}>
                          {v.slide(s.slide)}
                          {s.shapes?.length ? `: ${v.shapes(s.shapes.length)}` : ''}
                          {s.other?.length ? ` · ${s.other.join(', ')}` : ''}
                          {s.bindings !== undefined ? `: ${v.bindings(s.current_bindings, s.bindings)}` : ''}
                        </List.Item>
                      ))}
                      {detail.data.diff.deck.length > 0 && <List.Item>{v.deck(detail.data.diff.deck.join(', '))}</List.Item>}
                    </List>
                  </Stack>
                ))}
                <Group gap="xs">
                  <Button
                    size="compact-xs"
                    color={armed === version.id ? 'orange' : undefined}
                    disabled={detail.data?.diff.same}
                    loading={restore.isPending}
                    onClick={() => (armed === version.id ? doRestore(version.id) : setArmed(version.id))}
                  >
                    {armed === version.id ? v.confirmRestore : v.restore}
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => remove.mutate(version.id, { onSuccess: () => setSelected(null) })}>
                    {v.delete}
                  </Button>
                </Group>
              </Stack>
            )}
          </Paper>
        ))}
      </Stack>
    </Stack>
  );
}
