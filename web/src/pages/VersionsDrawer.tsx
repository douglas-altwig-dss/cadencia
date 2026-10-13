import { Alert, Badge, Button, Group, List, Paper, SegmentedControl, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';

import { useDeleteVersion, useNameVersion, useRestoreVersion, useVersion, useVersions } from '../api/featureHooks';
import { announce } from '../components/Announcer';
import { ErrorState, Loading } from '../components/common';
import { useAuthorName } from '../components/editor/CommentsPanel';
import { fmtDateTime, fromNow, plural } from '../lib/format';

/**
 * RF-87: the edits and the mapping, as versions somebody can go back to. Autosave leaves one
 * rolling copy per ten minutes (the last 50 kept); a version given a name is kept for good.
 * Restoring first stores what it replaces, so a restore can itself be undone.
 */
export function VersionsDrawer({ templateId, onRestored }: { templateId: number; onRestored: (kind: 'edits' | 'mapping') => void }) {
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
          notifications.show({ title: 'Versão restaurada', message: kind === 'edits' ? 'O editor recarregou as edições.' : 'O mapeamento foi recarregado.' });
          announce('Versão restaurada.');
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
        onChange={(v) => {
          setKind(v as 'edits' | 'mapping');
          setSelected(null);
        }}
        data={[
          { value: 'edits', label: 'Edições do editor' },
          { value: 'mapping', label: 'Mapeamento' },
        ]}
      />
      <Paper withBorder p="sm">
        <Group gap="xs" align="flex-end">
          <TextInput label="Guardar o estado atual como" placeholder="ex.: antes da reunião de 12/09" value={label} onChange={(e) => setLabel(e.currentTarget.value)} style={{ flex: 1 }} />
          <Button
            disabled={!label.trim()}
            loading={name.isPending}
            onClick={() => name.mutate({ kind, label, author: author || undefined }, { onSuccess: () => setLabel('') })}
          >
            Salvar versão
          </Button>
        </Group>
      </Paper>
      {versions.isLoading && <Loading rows={4} />}
      {versions.error && <ErrorState error={versions.error} />}
      {versions.data && versions.data.items.length === 0 && (
        <Text size="sm" c="dimmed">
          Nenhuma versão ainda: a primeira aparece quando {kind === 'edits' ? 'o editor salvar' : 'o mapeamento for salvo'}.
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
                  {version.label || (version.auto ? 'Salvamento automático' : 'Sem nome')}
                </Text>
                <Text size="xs" c="dimmed">
                  <Tooltip label={fmtDateTime(version.updated_at)}>
                    <span>{fromNow(version.updated_at)}</span>
                  </Tooltip>
                  {version.author ? ` · ${version.author}` : ''}
                </Text>
              </Stack>
              <Badge size="xs" variant="light" color={version.auto ? 'gray' : 'petrol'}>
                {version.auto ? 'automática' : 'com nome'}
              </Badge>
            </Group>
            {selected === version.id && (
              <Stack gap="xs" mt="xs" onClick={(e) => e.stopPropagation()}>
                {detail.isLoading && <Loading rows={2} />}
                {detail.data && (detail.data.diff.same ? (
                  <Alert variant="light" color="gray" p="xs">
                    <Text size="xs">Igual ao estado atual.</Text>
                  </Alert>
                ) : (
                  <Stack gap={2}>
                    <Text size="xs" fw={500}>
                      Restaurar mudaria:
                    </Text>
                    <List size="xs">
                      {detail.data.diff.slides.slice(0, 12).map((s) => (
                        <List.Item key={s.slide}>
                          slide {s.slide}
                          {s.shapes?.length ? `: ${plural(s.shapes.length, 'forma', 'formas')}` : ''}
                          {s.other?.length ? ` · ${s.other.join(', ')}` : ''}
                          {s.bindings !== undefined ? `: ${s.current_bindings} → ${plural(s.bindings, 'vínculo', 'vínculos')}` : ''}
                        </List.Item>
                      ))}
                      {detail.data.diff.deck.length > 0 && <List.Item>apresentação: {detail.data.diff.deck.join(', ')}</List.Item>}
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
                    {armed === version.id ? 'Confirmar: o estado atual vira uma versão' : 'Restaurar'}
                  </Button>
                  <Button size="compact-xs" variant="subtle" color="red" onClick={() => remove.mutate(version.id, { onSuccess: () => setSelected(null) })}>
                    Excluir
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
