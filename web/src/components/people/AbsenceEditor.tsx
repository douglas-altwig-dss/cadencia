import { ActionIcon, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { useAbsences, useAddAbsence, useDeleteAbsence, usePeople } from '../../api/hooks';
import { fmtDay } from '../../lib/format';
import { ErrorState, notifyUndo } from '../common';

/**
 * Ausências: the days a person is away, which come off the sprint capacity. One editor serves both places
 * it is needed: the whole team (no ``accountId``: a person picker and a Pessoa column, on Pessoas) and one
 * person (``accountId``: only that person's absences, on her own Capacidade tab).
 */
export function AbsenceEditor({ accountId }: { accountId?: string }) {
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
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [people.data],
  );
  const columns = accountId ? 4 : 5;

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Férias, folgas e eventos: cada dia útil de ausência sai da capacidade da sprint.
      </Text>
      <Group align="flex-end" wrap="wrap">
        {!accountId && (
          <Select
            label="Pessoa"
            data={options}
            value={picked}
            onChange={setPicked}
            searchable
            w={240}
            nothingFoundMessage="Ninguém com esse nome nos boards acompanhados"
          />
        )}
        <DatePickerInput type="range" label="Período" value={range} onChange={setRange} valueFormat="DD/MM/YYYY" w={260} />
        <TextInput label="Observação" value={note} onChange={(e) => setNote(e.currentTarget.value)} w={200} />
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
          Adicionar
        </Button>
      </Group>
      {add.error && <ErrorState error={add.error} />}
      {absences.error && <ErrorState error={absences.error} />}
      <Table.ScrollContainer minWidth={480}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              {!accountId && <Table.Th>Pessoa</Table.Th>}
              <Table.Th>De</Table.Th>
              <Table.Th>Até</Table.Th>
              <Table.Th>Observação</Table.Th>
              <Table.Th aria-label="Ações" />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {absences.data && absences.data.items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columns}>
                  <Text size="sm" c="dimmed">
                    Nenhuma ausência cadastrada.
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
                    aria-label={`Remover ausência de ${a.name}, de ${fmtDay(a.start)}`}
                    onClick={() =>
                      remove.mutate(a.id, {
                        // Removed at once, with a way back: an absence is cheap to re-enter.
                        onSuccess: () =>
                          notifyUndo(`Ausência de ${a.name} removida`, () =>
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
