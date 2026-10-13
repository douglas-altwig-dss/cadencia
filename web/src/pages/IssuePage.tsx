import { Anchor, Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useParams } from 'react-router';

import { useIssue } from '../api/hooks';
import { ErrorState, Freshness, IssueLink, IssueStatusBadge, Loading, PageHeader, Stat } from '../components/common';
import { ItemDescription } from '../components/ItemDescription';
import { EvidenceList, RiskBadge } from '../components/risk';
import { useT } from '../i18n';
import { fmtDateTime, fmtDay, fmtDays, fmtNum, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';


export function IssuePage() {
  const key = useParams().key!;
  const { data, isLoading, error } = useIssue(key);
  const { tracking } = useT();
  const m = tracking.issue;
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
            <span>{issue.assignee ?? m.unassigned}</span>
            {issue.due_date && <span>{m.due(fmtDay(issue.due_date))}</span>}
            {issue.url && (
              <Anchor href={issue.url} target="_blank" rel="noreferrer" size="sm">
                {m.openInJira} <IconExternalLink size={12} />
              </Anchor>
            )}
          </Group>
        }
        crumbs={[{ label: tracking.crumbs.home, to: '/' }, { label: data.board.name, to: `/boards/${data.board.id}` }, { label: issue.key }]}
      />
      <Freshness freshness={data.freshness} />
      <Stack gap="lg">
        <Paper withBorder p="md">
          <Group mb="sm" gap="sm">
            <Title order={4}>{m.situation}</Title>
            <RiskBadge situation={data.risk.situation} />
          </Group>
          <EvidenceList risk={data.risk} />
        </Paper>
        <ItemDescription text={data.description} />
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Stat label={m.leadTime} help={HELP['issue:lead']} value={fmtDays(metrics.lead_days)} hint={m.leadHint} />
          <Stat label={m.cycleTime} help={HELP['issue:cycle']} value={fmtDays(metrics.cycle_days)} hint={m.cycleHint} />
          <Stat label={m.queueTime} help={HELP['issue:queue']} value={fmtDays(metrics.queue_days)} hint={m.queueHint} />
          <Stat label={m.blockedTime} help={HELP['issue:blocked']} value={fmtDays(metrics.blocked_days)} />
          <Stat label={m.activeTime} help={HELP['issue:active']} value={fmtDays(metrics.active_days)} />
          <Stat label={m.efficiency} help={HELP['issue:efficiency']} value={fmtPct(metrics.flow_efficiency)} hint={m.efficiencyHint} />
          <Stat label={m.backward} help={HELP['issue:backward']} value={metrics.backward_moves} hint={m.backwardHint} />
          <Stat label={m.reopened} help={HELP['issue:reopened']} value={metrics.reopened ? m.yes : m.no} />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          <Paper withBorder p="md">
            <Title order={5} mb="xs">
              {m.hierarchy}
            </Title>
            <Text size="sm" c="dimmed">
              {m.parent}
            </Text>
            {data.parent ? (
              <Group gap={6} wrap="nowrap" justify="space-between">
                <IssueLink issue={data.parent} />
                <IssueStatusBadge status={data.parent.status} category={data.parent.category} />
              </Group>
            ) : (
              <Text size="sm">{m.noParent}</Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              {m.children(data.children.length)}
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
                {m.noChildren}
              </Text>
            )}
            <Text size="sm" c="dimmed" mt="sm">
              {m.sprints}
            </Text>
            <Text size="sm">{data.sprints.map((s) => s.name).join(', ') || m.noSprints}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Title order={5} mb="xs">
              {m.statusTimeline}
            </Title>
            <Table verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.colStatus}</Table.Th>
                  <Table.Th>{m.colColumn}</Table.Th>
                  <Table.Th>{m.colSince}</Table.Th>
                  <Table.Th className="num">{m.colDays}</Table.Th>
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
            {m.history}
          </Title>
          <Table.ScrollContainer minWidth={600}>
            <Table verticalSpacing={4}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.colWhen}</Table.Th>
                  <Table.Th>{m.colField}</Table.Th>
                  <Table.Th>{m.colFrom}</Table.Th>
                  <Table.Th>{m.colTo}</Table.Th>
                  <Table.Th>{m.colAuthor}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.transitions.map((t, i) => (
                  <Table.Tr key={`${t.at}-${i}`}>
                    <Table.Td>{fmtDateTime(t.at)}</Table.Td>
                    <Table.Td>{m.fields[t.field] ?? t.field}</Table.Td>
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
