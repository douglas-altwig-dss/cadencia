import { Button, Chip, Collapse, Group, Select, Stack, Table, Text } from '@mantine/core';
import { Fragment, useMemo, useState } from 'react';

import { useRisks } from '../api/hooks';
import { useFilters } from '../lib/filters';
import { fmtDay, plural } from '../lib/format';
import { Empty, ErrorState, ExportMenu, IssueLink, Loading, Note } from './common';
import { OpenInJira } from './OpenInJira';
import { EvidenceList, RiskBadge, SITUATIONS } from './risk';

/** Items by risk situation with the evidence behind each classification (RF-15 … RF-19). */
export function RiskTable({ sprintId, boardId }: { sprintId?: number; boardId?: number }) {
  const { get, set } = useFilters();
  const situation = get('situation');
  const person = get('person');
  const type = get('type');
  const risks = useRisks({ sprintId, boardId }, { situation, person, type });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of risks.data?.items ?? []) if (item.assignee_id && item.assignee) seen.set(item.assignee_id, item.assignee);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [risks.data]);
  const types = useMemo(() => [...new Set((risks.data?.items ?? []).map((i) => i.type))].sort(), [risks.data]);

  const selected = situation ? situation.split(',') : [];

  return (
    <Stack gap="sm">
      <Note title="Atraso é um sinal para investigar, não um veredito">
        Cada marcação descreve um fato do histórico do Jira e mostra a regra que a gerou. Clique em “evidência” para ver a última transição, a data e o autor.
      </Note>
      <Group gap="sm" align="flex-end" wrap="wrap">
        <Stack gap={4}>
          <Text size="sm" fw={500} id="situation-filter">
            Situação
          </Text>
          <Chip.Group multiple value={selected} onChange={(value) => set({ situation: value.join(',') })}>
            <Group gap={6} aria-labelledby="situation-filter" role="group">
              {SITUATIONS.map((s) => (
                <Chip key={s.key} value={s.key} size="xs" color={s.color}>
                  {s.label}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </Stack>
        <Select label="Pessoa" placeholder="Todas" data={people} value={person ?? null} onChange={(value) => set({ person: value })} clearable searchable w={200} />
        <Select label="Tipo" placeholder="Todos" data={types} value={type ?? null} onChange={(value) => set({ type: value })} clearable w={160} />
        <ExportMenu dataset="risks" params={{ sprint_id: sprintId, board_id: boardId, person, type }} />
        <OpenInJira keys={(risks.data?.items ?? []).map((i) => i.key)} sampleUrl={risks.data?.items[0]?.url} />
      </Group>
      {risks.isLoading && <Loading />}
      {risks.error && <ErrorState error={risks.error} />}
      {risks.data && risks.data.items.length === 0 && <Empty title="Nenhum item com esses filtros" action={{ label: 'Limpar os filtros', onClick: () => set({ situation: null, person: null, type: null }) }}>
          Os filtros de situação, pessoa e tipo ficam no endereço da página; limpe-os para ver tudo.
        </Empty>}
      {risks.data && risks.data.items.length > 0 && (
        <Table.ScrollContainer minWidth={900}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Situação</Table.Th>
                <Table.Th>Item</Table.Th>
                <Table.Th>Coluna</Table.Th>
                <Table.Th>Responsável</Table.Th>
                <Table.Th>O que aconteceu</Table.Th>
                <Table.Th>Prazo</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {risks.data.items.map((item) => (
                <Fragment key={item.key}>
                  <Table.Tr>
                    <Table.Td>
                      <RiskBadge situation={item.risk.situation} size="xs" />
                    </Table.Td>
                    <Table.Td>
                      <IssueLink issue={item} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.risk.column ?? item.status}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.assignee ?? 'Sem responsável'}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.risk.evidence[0]?.message ?? '—'}</Text>
                      {item.risk.evidence.length > 1 && (
                        <Text size="xs" c="dimmed">
                          +{plural(item.risk.evidence.length - 1, 'outra regra', 'outras regras')}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.due_date ? fmtDay(item.due_date) : '—'}</Text>
                    </Table.Td>
                    <Table.Td>
                      {item.risk.evidence.length > 0 && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() => setOpen((o) => ({ ...o, [item.key]: !o[item.key] }))}
                          aria-expanded={!!open[item.key]}
                        >
                          evidência
                        </Button>
                      )}
                    </Table.Td>
                  </Table.Tr>
                  {open[item.key] && (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Collapse expanded>
                          <EvidenceList risk={item.risk} />
                        </Collapse>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}
