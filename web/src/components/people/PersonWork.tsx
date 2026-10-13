import { Anchor, Badge, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';

import type { PersonDetail, PersonItem } from '../../api/types';
import { fmtDate, fmtNum, plural } from '../../lib/format';
import { blockSeverity } from '../../lib/people';
import { Empty, IssueLink } from '../common';
import { RiskBadge } from '../risk';
import { SeverityBadge } from './indicators';

const dueText = (item: PersonItem) => {
  if (!item.open || item.due_in_days == null) return item.due_date ? fmtDate(item.due_date) : '—';
  if (item.due_in_days < 0) return `vencido há ${-item.due_in_days} d`;
  if (item.due_in_days === 0) return 'vence hoje';
  return `em ${item.due_in_days} d`;
};

function Items({ items }: { items: PersonItem[] }) {
  const [show, setShow] = useState('abertos');
  // "Em risco" is the open items whose situation is not "em dia": the same rule the Pedem um olhar list uses.
  const atRisk = (i: PersonItem) => i.open && Boolean(i.risk) && i.risk?.situation !== 'em_dia';
  const shown = items.filter((i) => {
    if (show === 'abertos') return i.open;
    if (show === 'concluidos') return !i.open;
    if (show === 'risco') return atRisk(i);
    return true;
  });
  return (
    <Stack gap="sm">
      <SegmentedControl
        size="xs"
        w="fit-content"
        aria-label="Quais itens mostrar"
        value={show}
        onChange={setShow}
        data={[
          { value: 'abertos', label: `Abertos · ${items.filter((i) => i.open).length}` },
          { value: 'risco', label: `Em risco · ${items.filter(atRisk).length}` },
          { value: 'concluidos', label: `Concluídos (14 d) · ${items.filter((i) => !i.open).length}` },
          { value: 'todos', label: 'Todos' },
        ]}
      />
      {shown.length === 0 ? (
        <Text size="sm" c="dimmed">
          Nenhum item neste filtro.
        </Text>
      ) : (
        <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={680} mb={0}>
            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Épico</Table.Th>
                  <Table.Th>Situação</Table.Th>
                  <Table.Th>Prazo</Table.Th>
                  <Table.Th className="num">Est.</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {shown.map((item) => (
                  <Table.Tr key={item.key}>
                    <Table.Td>
                      <IssueLink issue={item} />
                      <Text size="xs" c="dimmed">
                        {item.board.name} · {item.status}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.type}</Text>
                    </Table.Td>
                    <Table.Td>
                      {item.epic ? (
                        <Anchor component={Link} to={`/issues/${item.epic.key}`} size="sm" className="mono">
                          {item.epic.key}
                        </Anchor>
                      ) : (
                        <Text size="sm" c="dimmed">
                          —
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {item.open && item.risk ? (
                        <RiskBadge situation={item.risk.situation} size="xs" />
                      ) : (
                        <Badge variant="light" color="teal" size="xs">
                          concluído
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c={item.open && item.due_in_days != null && item.due_in_days < 0 ? 'red.8' : undefined}>
                        {dueText(item)}
                      </Text>
                    </Table.Td>
                    <Table.Td className="num">{item.estimate == null ? '—' : fmtNum(item.estimate)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
    </Stack>
  );
}

function Epics({ epics }: { epics: PersonDetail['epics'] }) {
  if (!epics.length) {
    return (
      <Text size="sm" c="dimmed">
        Os itens desta pessoa não estão ligados a nenhum épico.
      </Text>
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
      {epics.map((epic) => (
        <Paper key={epic.key} withBorder p="sm">
          <Stack gap={6}>
            <Anchor component={Link} to={`/issues/${epic.key}`} className="mono" fw={600}>
              {epic.key}
            </Anchor>
            <Text size="sm" lineClamp={2}>
              {epic.summary}
            </Text>
            <Group gap={6}>
              <Badge variant="light" size="sm">
                {plural(epic.open, 'aberto', 'abertos')}
              </Badge>
              <Badge variant="light" color="teal" size="sm">
                {plural(epic.finished, 'concluído', 'concluídos')}
              </Badge>
              {epic.blocked > 0 && (
                <Badge variant="light" color="red" size="sm">
                  {plural(epic.blocked, 'bloqueado', 'bloqueados')}
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed">
              {epic.boards.join(', ')}
            </Text>
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

function Blocks({ blocks }: { blocks: PersonItem[] }) {
  if (!blocks.length) return <Empty title="Nenhum bloqueio aberto">Nada desta pessoa está sinalizado, em status de bloqueio ou esperando outro item.</Empty>;
  return (
    <Paper withBorder p={0} style={{ overflow: 'hidden' }}>
      <Table.ScrollContainer minWidth={620} mb={0}>
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Item</Table.Th>
              <Table.Th>Motivo</Table.Th>
              <Table.Th>Parado há</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {blocks.map((item) => {
              const days = item.blocked_days ?? 0;
              const level = blockSeverity(days);
              return (
                <Table.Tr key={item.key}>
                  <Table.Td>
                    <IssueLink issue={item} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.block_reason}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <Text size="sm" className="num">
                        {days} d
                      </Text>
                      <SeverityBadge level={level} />
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

/** Activities, epics and blocks: the lists the cards deliberately do not have. */
export function PersonWork({ detail }: { detail: PersonDetail }) {
  const [view, setView] = useState('itens');
  return (
    <Stack gap="md">
      <SegmentedControl
        w="fit-content"
        aria-label="Visão do trabalho"
        value={view}
        onChange={setView}
        data={[
          { value: 'itens', label: 'Atividades e histórias' },
          { value: 'epicos', label: `Épicos · ${detail.epics.length}` },
          { value: 'bloqueios', label: `Bloqueios · ${detail.blocks.length}` },
        ]}
      />
      {view === 'itens' && <Items items={detail.items} />}
      {view === 'epicos' && <Epics epics={detail.epics} />}
      {view === 'bloqueios' && <Blocks blocks={detail.blocks} />}
    </Stack>
  );
}
