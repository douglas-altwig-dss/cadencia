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
import { fmtDateTime, plural } from '../lib/format';

const size = (bytes: number | null) =>
  bytes == null ? '—' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;

function Upload({ onUploaded }: { onUploaded: (id: number) => void }) {
  const upload = useUploadTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group align="flex-end" wrap="wrap">
          <FileInput
            label="Arquivo"
            placeholder="modelo .pptx"
            accept=".pptx"
            value={file}
            onChange={setFile}
            w={260}
            clearable
          />
          <TextInput
            label="Nome"
            description="opcional; sem isso usa o nome do arquivo"
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
            Enviar
          </Button>
        </Group>
        {upload.error && <ErrorState error={upload.error} title="Modelo recusado" />}
        {upload.isSuccess && (
          <Text size="xs" c="teal.8">
            Modelo enviado. A Cadência já leu o manifesto e sugeriu um mapeamento.
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
        <Alert variant="light" color="petrol" title="Nenhum modelo ainda">
          Envie o .pptx usado na reunião: a Cadência extrai o manifesto e propõe o mapeamento.
        </Alert>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Modelo</Table.Th>
                <Table.Th>Slides</Table.Th>
                <Table.Th>Estado</Table.Th>
                <Table.Th>Enviado</Table.Th>
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
                            aberto
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
                          mapeado
                        </Badge>
                      ) : (
                        <Badge size="xs" variant="outline" color="gray">
                          sem mapeamento
                        </Badge>
                      )}
                      {item.has_edits && (
                        <Badge size="xs" color="orange" variant="light">
                          com edições
                        </Badge>
                      )}
                      {item.runs > 0 && (
                        <Badge size="xs" variant="outline">
                          {plural(item.runs, 'geração', 'gerações')}
                        </Badge>
                      )}
                      {item.missing_file && (
                        <Tooltip label="o .pptx não está mais no disco; só dá para excluir o registro">
                          <Badge size="xs" color="red" variant="light" leftSection={<IconAlertTriangle size={10} />}>
                            arquivo ausente
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
                    <Tooltip label="diagnóstico do modelo">
                      <ActionIcon variant="subtle" aria-label={`Diagnóstico do modelo ${item.name}`} onClick={() => setDiagnosing(item)} disabled={item.missing_file}>
                        <IconStethoscope size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="excluir o modelo">
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={`Excluir o modelo ${item.name}`}
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
        <Note title="Mapeamento sugerido a partir dos rótulos do modelo">
          A Cadência leu os rótulos (“REPORT WEEK”, “Completed Activities”, “Blockers”…) e a legenda de cores do modelo e propôs os vínculos.
          Abra o modelo no editor para revisar — o mapeamento é salvo sozinho.
          {open.data.suggestion.notes.length > 0 && ` ${open.data.suggestion.notes.join(' ')}`}
        </Note>
      )}
      {open.data?.mapping_outdated && (
        <Alert color="yellow" variant="light" title="O modelo mudou desde o mapeamento">
          {open.data.missing_targets.length
            ? `Áreas que não existem mais: ${open.data.missing_targets.join(', ')}.`
            : 'Nenhuma área mapeada sumiu, mas confira o resultado.'}
        </Alert>
      )}

      {remove.error && <ErrorState error={remove.error} title="Modelo não excluído" />}

      <Modal opened={diagnosing !== null} onClose={() => setDiagnosing(null)} title={`Diagnóstico — ${diagnosing?.name ?? ''}`} size="lg">
        {diagnosing && <TemplateDiagnosticsPanel templateId={diagnosing.id} />}
      </Modal>

      <Modal
        opened={confirming !== null}
        onClose={() => setConfirming(null)}
        title={`Excluir “${confirming?.name}”?`}
      >
        <Stack gap="sm">
          <Text size="sm">Isto remove, sem volta:</Text>
          <List size="sm" spacing={2}>
            <List.Item>o arquivo .pptx do modelo e suas prévias;</List.Item>
            <List.Item>
              o mapeamento{confirming?.has_mapping ? '' : ' (não há nenhum salvo)'};
            </List.Item>
            <List.Item>
              as edições manuais{confirming?.has_edits ? '' : ' (não há nenhuma)'}.
            </List.Item>
          </List>
          {confirming && confirming.runs > 0 && (
            <Alert variant="light" color="petrol" title="As apresentações já geradas ficam">
              {confirming.runs === 1
                ? '1 apresentação gerada com este modelo continua disponível'
                : `${confirming.runs} apresentações geradas com este modelo continuam disponíveis`}{' '}
              para download no histórico. O editor delas abre sem o tema e sem as marcas de campo vinculado, que vêm do modelo.
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() =>
                confirming &&
                remove.mutate(confirming.id, {
                  onSuccess: () => {
                    const left = items.filter((t) => t.id !== confirming.id);
                    if (confirming.id === current) onSelect(left[0]?.id ?? null);
                    setConfirming(null);
                  },
                })
              }
            >
              Excluir
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
