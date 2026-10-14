import { Anchor, Button, Checkbox, Group, Pagination, Stack, Table, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { useBoards, useSaveSelection } from '../../api/hooks';
import { useT } from '../../i18n';
import { fromNow } from '../../lib/format';
import { ErrorState, Loading } from '../common';

/** Which boards are tracked, grouped by the space they belong to. A tracked board's name opens its
 * own Settings tab, where its profile (columns, checkpoint, capacity) is edited. */
export function BoardsTab() {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const boards = useBoards(debounced, page, 25);
  const selectedNow = useBoards('', 1, 500, true);
  const save = useSaveSelection();
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const m = useT().tracking.settings.boards;

  useEffect(() => {
    if (selectedNow.data && draft === null) setDraft(new Set(selectedNow.data.items.map((b) => b.id)));
  }, [selectedNow.data, draft]);
  useEffect(() => setPage(1), [debounced]);

  const toggle = (id: number) =>
    setDraft((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Stack gap="sm">
      <Group align="flex-end" justify="space-between" wrap="wrap">
        <TextInput
          label={m.search}
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
        />
        <Group>
          <Text size="sm">{m.selected(draft?.size ?? 0)}</Text>
          <Button
            onClick={() =>
              draft &&
              save.mutate([...draft], {
                onSuccess: () => notifications.show({ title: m.savedTitle, message: m.savedMessage }),
              })
            }
            loading={save.isPending}
            disabled={!draft}
          >
            {m.save}
          </Button>
        </Group>
      </Group>
      {save.error && <ErrorState error={save.error} title={m.notSaved} />}
      {boards.isLoading && <Loading />}
      {boards.error && <ErrorState error={boards.error} />}
      {boards.data && boards.data.total === 0 && (
        <Text size="sm" c="dimmed">
          {m.noneBefore} <code>cadencia discover</code>
          {m.noneAfter}
        </Text>
      )}
      {boards.data && boards.data.items.length > 0 && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <span className="sr-only">{m.track}</span>
                  </Table.Th>
                  <Table.Th>{m.colBoard}</Table.Th>
                  <Table.Th>{m.colType}</Table.Th>
                  <Table.Th>{m.colLastCollection}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              {boards.data.spaces.map((group) => (
                <Table.Tbody key={group.space.key ?? '__sem_espaco__'}>
                  <Table.Tr bg="var(--mantine-color-default-hover)">
                    <Table.Th colSpan={4} scope="colgroup">
                      <Group gap="xs" align="baseline">
                        <Text fw={600}>{group.space.name}</Text>
                        {group.space.key && (
                          <Text size="xs" c="dimmed" className="mono">
                            {group.space.key}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed" fw={400}>
                          {m.spaceLine(group.boards.length)}
                        </Text>
                      </Group>
                    </Table.Th>
                  </Table.Tr>
                  {group.boards.map((b) => (
                    <Table.Tr key={b.id}>
                      <Table.Td>
                        <Checkbox
                          checked={draft?.has(b.id) ?? false}
                          onChange={() => toggle(b.id)}
                          aria-label={m.trackAria(b.name, group.space.name)}
                        />
                      </Table.Td>
                      <Table.Td>
                        {b.selected ? (
                          <Anchor component={Link} to={`/boards/${b.id}?tab=settings`} size="sm" aria-label={m.boardSettingsAria(b.name)}>
                            {b.name}
                          </Anchor>
                        ) : (
                          b.name
                        )}
                      </Table.Td>
                      <Table.Td>{b.type}</Table.Td>
                      <Table.Td>{b.selected ? fromNow(b.last_success_at) : '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              ))}
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {m.total(boards.data.total)}
            </Text>
            <Pagination total={Math.ceil(boards.data.total / boards.data.page_size)} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}
    </Stack>
  );
}
