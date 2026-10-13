import { Anchor, Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useParams } from 'react-router';

import { useIssue } from '../api/hooks';
import { ErrorState, Freshness, IssueLink, IssueStatusBadge, Loading, PageHeader, Stat } from '../components/common';
import { ItemDescription } from '../components/ItemDescription';
import { EvidenceList, RiskBadge } from '../components/risk';
import { fmtDateTime, fmtDay, fmtDays, fmtNum, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';

const FIELD_LABELS: Record<string, string> = {
  status: 'Status',
  assignee: 'Responsável',
  sprint: 'Sprint',
  estimate: 'Estimativa',
  flagged: 'Impedimento',
  parent: 'Pai',
};

export function IssuePage() {
  const key = useParams().key!;
  const { data, isLoading, error } = useIssue(key);
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;
  const { issue, metrics } = data;

  return (
    <>
      <PageHeader
        documentTitle={`${issue.key} ${issue.summary}`}
        title={
          <Group gap="sm">
            <span className="mono">{issue.key}</span>
            <span>{issue.summary}</span>
          </Group>
        }
        subtitle={
          <Group gap="xs" component="span">
            <Badge variant="outline">{issue.type}</Badge>
            <IssueStatusBadge status={issue.status} category={issue.category} />
            <span>{issue.assignee ?? 'Sem responsável'}</span>
            {issue.due_date && <span>· prazo {fmtDay(issue.due_date)}</span>}
            {issue.url && (
              <Anchor href={issue.url} target="_blank" rel="noreferrer" size="sm">
                abrir no Jira <IconExternalLink size={12} />
              </Anchor>
            )}
          </Group>
        }
        crumbs={[{ label: 'Painel', to: '/' }, { label: data.board.name, to: `/boards/${data.board.id}` }, { label: issue.key }]}
      />
      <Freshness freshness={data.freshness} />
      <Stack gap="lg">
        <Paper withBorder p="md">
          <Group mb="sm" gap="sm">
            <Title order={4}>Situação</Title>
            <RiskBadge situation={data.risk.situation} />
          </Group>
          <EvidenceList risk={data.risk} />
        </Paper>
        <ItemDescription text={data.description} />
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label="Lead time" help={HELP['issue:lead']} value={fmtDays(metrics.lead_days)} hint="criação → conclusão" />
          <Stat label="Cycle time" help={HELP['issue:cycle']} value={fmtDays(metrics.cycle_days)} hint="início do trabalho → conclusão" />
          <Stat label="Tempo em fila" help={HELP['issue:queue']} value={fmtDays(metrics.queue_days)} hint="antes do início" />
          <Stat label="Tempo bloqueado" help={HELP['issue:blocked']} value={fmtDays(metrics.blocked_days)} />
          <Stat label="Tempo ativo" help={HELP['issue:active']} value={fmtDays(metrics.active_days)} />
          <Stat label="Eficiência de fluxo" help={HELP['issue:efficiency']} value={fmtPct(metrics.flow_efficiency)} hint="ativo ÷ lead time" />
          <Stat label="Transições para trás" help={HELP['issue:backward']} value={metrics.backward_moves} hint="indicador de retrabalho" />
          <Stat label="Reaberto" help={HELP['issue:reopened']} value={metrics.reopened ? 'sim' : 'não'} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper withBorder p="md">
            <Title order={5} mb="xs">
              Hierarquia
            </Title>
            <Text size="sm" c="dimmed">
              Pai
            </Text>
            {data.parent ? (
              <Group gap={6} wrap="nowrap" justify="space-between">
                <IssueLink issue={data.parent} />
                <IssueStatusBadge status={data.parent.status} category={data.parent.category} />
              </Group>
            ) : (
              <Text size="sm">sem pai (“sem épico”)</Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              Filhos ({data.children.length})
            </Text>
            {data.children.length ? (
              <Stack gap={2}>
                {data.children.map((c) => (
                  <Group key={c.key} gap={6} wrap="nowrap" justify="space-between">
                    <IssueLink issue={c} />
                    <IssueStatusBadge status={c.status} category={c.category} />
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">
                nenhum
              </Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              Sprints
            </Text>
            <Text size="sm">{data.sprints.map((s) => s.name).join(', ') || 'nenhuma'}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Title order={5} mb="xs">
              Linha do tempo de status
            </Title>
            <Table verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Coluna</Table.Th>
                  <Table.Th>Desde</Table.Th>
                  <Table.Th className="num">Dias</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.status_intervals.map((iv) => (
                  <Table.Tr key={iv.start}>
                    <Table.Td>{iv.status}</Table.Td>
                    <Table.Td>{iv.column ?? '—'}</Table.Td>
                    <Table.Td>{fmtDateTime(iv.start)}</Table.Td>
                    <Table.Td className="num">{fmtNum(iv.days)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </SimpleGrid>
        <Paper withBorder p="md">
          <Title order={5} mb="xs">
            Histórico de alterações
          </Title>
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Quando</Table.Th>
                  <Table.Th>Campo</Table.Th>
                  <Table.Th>De</Table.Th>
                  <Table.Th>Para</Table.Th>
                  <Table.Th>Autor</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.transitions.map((t, i) => (
                  <Table.Tr key={`${t.at}-${i}`}>
                    <Table.Td>{fmtDateTime(t.at)}</Table.Td>
                    <Table.Td>{FIELD_LABELS[t.field] ?? t.field}</Table.Td>
                    <Table.Td>{t.from ?? '—'}</Table.Td>
                    <Table.Td>{t.to ?? '—'}</Table.Td>
                    <Table.Td>{t.author ?? '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>
    </>
  );
}
