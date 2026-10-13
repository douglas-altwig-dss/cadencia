import { Badge, Button, Group, Loader, Modal, Stack, Table, Text } from '@mantine/core';

import { useRestoreSlide, useSlideHistory } from '../../api/deckHooks';
import { fmtDateTime } from '../../lib/format';
import { ErrorState } from '../common';
import { useT } from '../../i18n';

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
  const t = useT();
  const history = useSlideHistory(templateId, slideKey ?? undefined);
  const restore = useRestoreSlide(templateId);
  return (
    <Modal opened={slideKey !== null} onClose={onClose} title={t.editor.slideHistory.title(title)} size="lg">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {t.editor.slideHistory.hint}
        </Text>
        {history.isLoading && <Loader size="sm" />}
        {history.error && <ErrorState error={history.error} />}
        {restore.error && <ErrorState error={restore.error} title={t.editor.slideHistory.notRestored} />}
        {history.data && !history.data.items.length && (
          <Text size="sm" c="dimmed">
            {t.editor.slideHistory.empty}
          </Text>
        )}
        {history.data && history.data.items.length > 0 && (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t.editor.slideHistory.when}</Table.Th>
                <Table.Th>{t.editor.slideHistory.version}</Table.Th>
                <Table.Th>{t.editor.slideHistory.author}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.data.items.map((entry) => (
                <Table.Tr key={entry.version_id}>
                  <Table.Td>{fmtDateTime(entry.at)}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Text size="sm">{entry.label || (entry.auto ? t.editor.slideHistory.automatic : t.editor.slideHistory.unnamed)}</Text>
                      {entry.removed && (
                        <Badge size="xs" color="gray" variant="light">
                          {t.editor.slideHistory.noEdits}
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
                      {t.editor.slideHistory.restore}
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
