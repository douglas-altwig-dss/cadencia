import { Badge, Button, Group, Loader, Modal, Stack, Table, Text } from '@mantine/core';

import { useRestoreSlide, useSlideHistory } from '../../api/deckHooks';
import { fmtDateTime } from '../../lib/format';
import { ErrorState } from '../common';

/**
 * #20: the versions of the edits in which *this* slide changed, and a way back to one of them
 * without undoing what happened on every other slide since — which is what restoring a whole
 * version (RF-87) would do.
 */
export function SlideHistoryModal({
  templateId,
  slideKey,
  title,
  onClose,
  onRestored,
}: {
  templateId: number;
  slideKey: string | null;
  title: string;
  onClose: () => void;
  onRestored: () => void;
}) {
  const history = useSlideHistory(templateId, slideKey ?? undefined);
  const restore = useRestoreSlide(templateId);
  return (
    <Modal opened={slideKey !== null} onClose={onClose} title={`Histórico — ${title}`} size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Restaurar troca só as edições deste slide pelas daquela versão; os outros slides ficam como estão.
          A versão atual é guardada antes, então a troca também pode ser desfeita daqui.
        </Text>
        {history.isLoading && <Loader size="sm" />}
        {history.error && <ErrorState error={history.error} />}
        {restore.error && <ErrorState error={restore.error} title="Não restaurado" />}
        {history.data && !history.data.items.length && (
          <Text size="sm" c="dimmed">
            Nenhuma versão guardada mudou este slide ainda. As versões automáticas saem a cada 10 minutos de edição.
          </Text>
        )}
        {history.data && history.data.items.length > 0 && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Quando</Table.Th>
                <Table.Th>Versão</Table.Th>
                <Table.Th>Autor</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.data.items.map((entry) => (
                <Table.Tr key={entry.version_id}>
                  <Table.Td>{fmtDateTime(entry.at)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Text size="sm">{entry.label || (entry.auto ? 'automática' : 'sem nome')}</Text>
                      {entry.removed && (
                        <Badge size="xs" color="gray" variant="light">
                          sem edições
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>{entry.author ?? '—'}</Table.Td>
                  <Table.Td>
                    <Button
                      size="compact-xs"
                      variant="light"
                      loading={restore.isPending && restore.variables?.versionId === entry.version_id}
                      onClick={() =>
                        slideKey &&
                        restore.mutate(
                          { slideKey, versionId: entry.version_id },
                          {
                            onSuccess: () => {
                              onRestored();
                              onClose();
                            },
                          },
                        )
                      }
                    >
                      Restaurar
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Modal>
  );
}
