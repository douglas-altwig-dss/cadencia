import { ActionIcon, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useAbsences, useAddAbsence, useDeleteAbsence, usePeople } from '../../api/hooks';
import { collator, useT } from '../../i18n';
import { fmtDay } from '../../lib/format';
import { ErrorState, notifyUndo } from '../common';

/**
 * Ausências: the days a person is away, which come off the sprint capacity. One editor serves both places
 * it is needed: the whole team (no ``accountId``: a person picker and a Pessoa column, on Pessoas) and one
 * person (``accountId``: only that person's absences, on her own Capacidade tab).
 */
export function AbsenceEditor({ accountId }: { accountId?: string }) {
  const t = useT();
  const absences = useAbsences(accountId);
  const people = usePeople();
  const add = useAddAbsence();
  const remove = useDeleteAbsence();
  const [picked, setPicked] = useState<string | null>(null);
  const [range, setRange] = useState<[string | null, string | null]>([null, null]);
  const [note, setNote] = useState('');
  const who = accountId ?? picked;
  const options = useMemo(
    () =>
      (people.data?.items ?? [])
        .map((p) => ({ value: p.account_id, label: p.name }))
        .sort((a, b) => collator().compare(a.label, b.label)),
    [people.data],
  );
  const columns = accountId ? 4 : 5;

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {t.people.absences.intro}
      </Text>
      <Group align="flex-end" wrap="wrap">
        {!accountId && (
          <Select
            label={t.people.common.person}
            data={options}
            value={picked}
            onChange={setPicked}
            searchable
            w={240}
            nothingFoundMessage={t.people.common.nobodyNamed}
          />
        )}
        <DatePickerInput type="range" label={t.people.common.period} value={range} onChange={setRange} valueFormat={t.people.absences.dateFormat} w={260} />
        <TextInput label={t.people.absences.note} value={note} onChange={(e) => setNote(e.currentTarget.value)} w={200} />
        <Button
          disabled={!who || !range[0] || !range[1]}
          loading={add.isPending}
          onClick={() => {
            if (!who || !range[0] || !range[1]) return;
            add.mutate(
              { account_id: who, start: range[0], end: range[1], note: note || undefined },
              {
                onSuccess: () => {
                  setRange([null, null]);
                  setNote('');
                },
              },
            );
          }}
        >
          {t.people.common.add}
        </Button>
      </Group>
      {add.error && <ErrorState error={add.error} />}
      {absences.error && <ErrorState error={absences.error} />}
      <Table.ScrollContainer minWidth={480}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              {!accountId && <Table.Th>{t.people.common.person}</Table.Th>}
              <Table.Th>{t.people.absences.from}</Table.Th>
              <Table.Th>{t.people.absences.until}</Table.Th>
              <Table.Th>{t.people.absences.note}</Table.Th>
              <Table.Th aria-label={t.people.absences.actions} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {absences.data && absences.data.items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columns}>
                  <Text size="sm" c="dimmed">
                    {t.people.absences.empty}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
            {(absences.data?.items ?? []).map((a) => (
              <Table.Tr key={a.id}>
                {!accountId && <Table.Td>{a.name}</Table.Td>}
                <Table.Td>{fmtDay(a.start)}</Table.Td>
                <Table.Td>{fmtDay(a.end)}</Table.Td>
                <Table.Td>{a.note ?? '—'}</Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={t.people.absences.removeLabel(a.name, fmtDay(a.start))}
                    onClick={() =>
                      remove.mutate(a.id, {
                        // Removed at once, with a way back: an absence is cheap to re-enter.
                        onSuccess: () =>
                          notifyUndo(t.people.absences.removed(a.name), () =>
                            add.mutate({ account_id: a.account_id, start: a.start, end: a.end, note: a.note ?? undefined }),
                          ),
                      })
                    }
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Stack>
  );
}
