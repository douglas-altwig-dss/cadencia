import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  Modal,
  Paper,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconStethoscope, IconTrash, IconUpload } from '@tabler/icons-react';
import { useState } from 'react';

import { useDeleteTemplate, useTemplate, useTemplates, useUploadTemplate } from '../api/hooks';
import type { TemplateSummary } from '../api/types';
import { ErrorState, Loading, Note } from '../components/common';
import { TemplateDiagnosticsPanel } from '../components/deck/TemplatePanels';
import { useT } from '../i18n';
import { fmtDateTime } from '../lib/format';

const size = (bytes: number | null) =>
  bytes == null ? '—' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;

function Upload({ onUploaded }: { onUploaded: (id: number) => void }) {
  const t = useT();
  const u = t.deck.templates;
  const upload = useUploadTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group align="flex-end" wrap="wrap">
          <FileInput
            label={u.file}
            placeholder={u.filePlaceholder}
            accept=".pptx"
            value={file}
            onChange={setFile}
            w={260}
            clearable
          />
          <TextInput
            label={u.name}
            description={u.nameHint}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            w={220}
          />
          <Button
            leftSection={<IconUpload size={16} />}
            disabled={!file}
            loading={upload.isPending}
            onClick={() =>
              file &&
              upload.mutate(
                { file, name: name.trim() || undefined },
                {
                  onSuccess: (row) => {
                    setFile(null);
                    setName('');
                    onUploaded(row.id);
                  },
                },
              )
            }
          >
            {u.upload}
          </Button>
        </Group>
        {upload.error && <ErrorState error={upload.error} title={u.refused} />}
        {upload.isSuccess && (
          <Text size="xs" c="teal.8">
            {u.uploaded}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * RF-51: the templates as things you own, not a one-way upload.
 *
 * Deleting takes the mapping and the manual edits with it — they mean nothing without their
 * template — but never the decks already generated from it: those are finished deliverables whose
 * .pptx stands on its own, and the dialog says so before asking.
 */
export function TemplatesDrawer({
  current,
  onSelect,
  onUploaded,
}: {
  current: number;
  onSelect: (id: number | null) => void;
  /** #23: a freshly uploaded template; defaults to simply opening it. */
  onUploaded?: (id: number) => void;
}) {
  const t = useT();
  const u = t.deck.templates;
  const templates = useTemplates();
  // M13: what the open template used to say on the slides drawer lives with the template itself.
  const open = useTemplate(current > 0 ? current : undefined);
  const remove = useDeleteTemplate();
  const [confirming, setConfirming] = useState<TemplateSummary | null>(null);
  const [diagnosing, setDiagnosing] = useState<TemplateSummary | null>(null);

  if (templates.isLoading) return <Loading rows={4} />;
  if (templates.error) return <ErrorState error={templates.error} />;
  const items = templates.data?.items ?? [];

  return (
    <Stack gap="md">
      <Upload onUploaded={onUploaded ?? onSelect} />

      {items.length === 0 ? (
        <Alert variant="light" color="petrol" title={u.emptyTitle}>
          {u.emptyBody}
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{u.colTemplate}</Table.Th>
                <Table.Th>{u.colSlides}</Table.Th>
                <Table.Th>{u.colState}</Table.Th>
                <Table.Th>{u.colUploaded}</Table.Th>
                <Table.Th w={72} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.id} bg={item.id === current ? 'var(--mantine-color-default-hover)' : undefined}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Group gap={6}>
                        <Text
                          size="sm"
                          fw={item.id === current ? 600 : 400}
                          style={{ cursor: 'pointer' }}
                          onClick={() => onSelect(item.id)}
                        >
                          {item.name}
                        </Text>
                        {item.id === current && (
                          <Badge size="xs" variant="light" leftSection={<IconCheck size={10} />}>
                            {u.open}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {item.filename} · {size(item.size)} · <span className="mono">{item.sha256.slice(0, 10)}</span>
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td className="num">{item.slides ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      {item.has_mapping ? (
                        <Badge size="xs" variant="light">
                          {t.deck.gallery.mapped}
                        </Badge>
                      ) : (
                        <Badge size="xs" variant="outline" color="gray">
                          {t.deck.gallery.unmapped}
                        </Badge>
                      )}
                      {item.has_edits && (
                        <Badge size="xs" color="orange" variant="light">
                          {u.withEdits}
                        </Badge>
                      )}
                      {item.runs > 0 && (
                        <Badge size="xs" variant="outline">
                          {t.deck.gallery.runs(item.runs)}
                        </Badge>
                      )}
                      {item.missing_file && (
                        <Tooltip label={u.missingTip}>
                          <Badge size="xs" color="red" variant="light" leftSection={<IconAlertTriangle size={10} />}>
                            {t.deck.gallery.missingFile}
                          </Badge>
                        </Tooltip>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{fmtDateTime(item.uploaded_at)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={2} wrap="nowrap">
                    <Tooltip label={u.diagnoseTip}>
                      <ActionIcon variant="subtle" aria-label={u.diagnose(item.name)} onClick={() => setDiagnosing(item)} disabled={item.missing_file}>
                        <IconStethoscope size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={u.deleteTip}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={u.deleteNamed(item.name)}
                        onClick={() => setConfirming(item)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {open.data && !open.data.mapping && (
        <Note title={u.suggestedTitle}>
          {u.suggestedBody}
          {open.data.suggestion.notes.length > 0 && ` ${open.data.suggestion.notes.join(' ')}`}
        </Note>
      )}
      {open.data?.mapping_outdated && (
        <Alert color="yellow" variant="light" title={u.outdatedTitle}>
          {open.data.missing_targets.length
            ? u.missingAreas(open.data.missing_targets.join(', '))
            : u.noAreaMissing}
        </Alert>
      )}

      {remove.error && <ErrorState error={remove.error} title={u.deleteFailed} />}

      <Modal opened={diagnosing !== null} onClose={() => setDiagnosing(null)} title={u.diagnosisTitle(diagnosing?.name ?? '')} size="lg">
        {diagnosing && <TemplateDiagnosticsPanel templateId={diagnosing.id} />}
      </Modal>

      <Modal
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title={u.confirmTitle(confirming?.name ?? '')}
      >
        <Stack gap="sm">
          <Text size="sm">{u.removes}</Text>
          <List size="sm" spacing={2}>
            <List.Item>{u.removesFile}</List.Item>
            <List.Item>
              {confirming?.has_mapping ? u.removesMapping : u.removesMappingNone}
            </List.Item>
            <List.Item>
              {confirming?.has_edits ? u.removesEdits : u.removesEditsNone}
            </List.Item>
          </List>
          {confirming && confirming.runs > 0 && (
            <Alert variant="light" color="petrol" title={u.runsStayTitle}>
              {u.runsStay(confirming.runs)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(null)}>
              {u.cancel}
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() =>
                confirming &&
                remove.mutate(confirming.id, {
                  onSuccess: () => {
                    const left = items.filter((other) => other.id !== confirming.id);
                    if (confirming.id === current) onSelect(left[0]?.id ?? null);
                    setConfirming(null);
                  },
                })
              }
            >
              {u.delete}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
