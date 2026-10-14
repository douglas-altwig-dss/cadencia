import { Alert, Anchor, Badge, Button, Group, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLayoutKanban, IconRefresh, IconUsersGroup } from '@tabler/icons-react';
import { Link } from 'react-router';

import { useCollect, useStatus } from '../api/hooks';
import type { StatusEntity } from '../api/types';
import { CollectionProgress } from '../components/CollectionProgress';
import { ErrorState, Loading, PageHeader, useConfirm } from '../components/common';
import { HealthPanel } from '../components/HealthPanel';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { fmtDateTime, fromNow } from '../lib/format';

const STATUS_COLOR: Record<string, string> = { success: 'teal', partial: 'yellow', failed: 'red', running: 'petrol', empty: 'gray' };

function StatusBadge({ status }: { status: string }) {
  const labels = useT().tracking.status.runStatus;
  return (
    <Badge variant="light" color={STATUS_COLOR[status] ?? 'gray'}>
      {labels[status] ?? status}
    </Badge>
  );
}

const counter = (counters: Record<string, unknown>, key: string) => (counters[key] === undefined ? '—' : String(counters[key]));

/** Which level of the hierarchy the row is: the team (space) or one of its boards. Colour alone
 *  never carries the distinction — the icon and the word do. */
function EntityBadge({ entity }: { entity: StatusEntity['entity'] }) {
  const space = entity === 'space';
  const Icon = space ? IconUsersGroup : IconLayoutKanban;
  const m = useT().tracking.status;
  return (
    <Badge variant={space ? 'light' : 'default'} color={space ? 'petrol' : 'gray'} leftSection={<Icon size={12} />}>
      {space ? m.entitySpace : m.entityBoard}
    </Badge>
  );
}

/** Observability: last successful run per board, counters, and failures with cause and action. */
export function StatusPage() {
  const status = useStatus();
  const collect = useCollect();
  const data = status.data;
  const { get, set } = useFilters();
  const tab = get('tab') ?? 'collection';
  const { confirm, dialog: confirmDialog } = useConfirm();
  const m = useT().tracking.status;
  const start = (mode: 'incremental' | 'full') =>
    collect.mutate(
      { mode },
      {
        onSuccess: () =>
          notifications.show({
            title: mode === 'full' ? m.fullStarted : m.started,
            message: m.progressHere,
          }),
      },
    );
  const reconcile = async () => {
    const ok = await confirm({
      title: m.confirmTitle,
      body: m.confirmBody,
      confirmLabel: m.confirmLabel,
    });
    if (ok) start('full');
  };

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => start('incremental')}
              loading={collect.isPending || data?.collecting}
              disabled={!data?.jira_configured}
            >
              {m.collectNow}
            </Button>
            <Button variant="default" onClick={reconcile} disabled={!data?.jira_configured || data?.collecting}>
              {m.fullReconciliation}
            </Button>
          </>
        }
      />
      {status.isLoading && <Loading />}
      {status.error && <ErrorState error={status.error} />}
      {collect.error && <ErrorState error={collect.error} title={m.couldNotStart} />}
      {data && !data.jira_configured && (
        <Alert color="yellow" variant="light" title={m.jiraNotConfigured} mb="md">
          {m.jiraBefore} <code>cadencia demo</code> {m.jiraAfter}
        </Alert>
      )}
      <Tabs value={tab} onChange={(value) => set({ tab: value })} mb="md" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="collection">{m.tabCollection}</Tabs.Tab>
          <Tabs.Tab value="health">{m.tabHealth}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="health">
          <HealthPanel />
        </Tabs.Panel>
        <Tabs.Panel value="collection">
        {data && (
          <Stack gap="lg">
            <CollectionProgress />
            <Stack gap="xs">
              <Title order={4}>{m.tracked}</Title>
              <Table.ScrollContainer minWidth={1000}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{m.colType}</Table.Th>
                      <Table.Th>{m.colName}</Table.Th>
                      <Table.Th>{m.colLastSuccess}</Table.Th>
                      <Table.Th>{m.colLastFull}</Table.Th>
                      <Table.Th>{m.colLastRun}</Table.Th>
                      <Table.Th>{m.colCounters}</Table.Th>
                      <Table.Th>{m.colCause}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.entities.map((e) => (
                      <Table.Tr key={e.id} bg={e.entity === 'space' ? 'var(--mantine-color-default-hover)' : undefined}>
                        <Table.Td>
                          <EntityBadge entity={e.entity} />
                        </Table.Td>
                        <Table.Td pl={e.entity === 'board' ? 'lg' : undefined}>
                          {e.entity === 'board' && e.board ? (
                            <Anchor component={Link} to={`/boards/${e.board.id}`} fw={400}>
                              {e.name}
                            </Anchor>
                          ) : (
                            <Text fw={600}>{e.name}</Text>
                          )}
                          <Text size="xs" c="dimmed">
                            {e.entity === 'space' ? m.boards(e.boards ?? 0) : e.space.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {fromNow(e.last_success_at)}
                          <Text size="xs" c="dimmed">
                            {e.entity === 'space' && e.last_success_at ? m.oldest(fmtDateTime(e.last_success_at)) : fmtDateTime(e.last_success_at)}
                          </Text>
                        </Table.Td>
                        <Table.Td>{fmtDateTime(e.last_full_at)}</Table.Td>
                        <Table.Td>{e.last_run?.status ? <StatusBadge status={e.last_run.status} /> : '—'}</Table.Td>
                        <Table.Td className="num">
                          {e.last_run?.counters
                            ? `${counter(e.last_run.counters, 'issues')} · ${counter(e.last_run.counters, 'changelogs')} · ${counter(e.last_run.counters, 'snapshots')}`
                            : '—'}
                        </Table.Td>
                        <Table.Td>
                          {e.last_run?.status === 'failed' && e.entity === 'board' ? (
                            <Stack gap={2}>
                              <Text size="sm" fw={500} c="red">
                                {e.last_run.cause}
                              </Text>
                              <Text size="xs">{e.last_run.action}</Text>
                              <Text size="xs" c="dimmed">
                                {e.last_run.error}
                              </Text>
                            </Stack>
                          ) : (
                            '—'
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
            <Stack gap="xs">
              <Title order={4}>{m.recentRuns}</Title>
              <Table.ScrollContainer minWidth={900}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{m.colRun}</Table.Th>
                      <Table.Th>{m.colMode}</Table.Th>
                      <Table.Th>{m.colStatus}</Table.Th>
                      <Table.Th>{m.colStart}</Table.Th>
                      <Table.Th>{m.colEnd}</Table.Th>
                      <Table.Th className="num">{m.colCalls}</Table.Th>
                      <Table.Th className="num">{m.colWaits}</Table.Th>
                      <Table.Th className="num">{m.colRetries}</Table.Th>
                      <Table.Th>{m.colErrors}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.runs.map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td className="mono">{r.id}</Table.Td>
                        <Table.Td>{r.mode === 'full' ? m.modeFull : m.modeIncremental}</Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            <StatusBadge status={r.status} />
                          </Group>
                        </Table.Td>
                        <Table.Td>{fmtDateTime(r.started_at)}</Table.Td>
                        <Table.Td>{fmtDateTime(r.finished_at)}</Table.Td>
                        <Table.Td className="num">{counter(r.counters, 'calls')}</Table.Td>
                        <Table.Td className="num">{counter(r.counters, 'rate_limit_waits')}</Table.Td>
                        <Table.Td className="num">{counter(r.counters, 'retries')}</Table.Td>
                        <Table.Td>
                          <Group gap={4}>
                            {Object.entries((r.counters.errors ?? {}) as Record<string, number>).map(([kind, n]) => (
                              <Badge key={kind} variant="light" color="red" size="sm">
                                {kind}: {n}
                              </Badge>
                            ))}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          </Stack>
        )}
        </Tabs.Panel>
      </Tabs>
      {confirmDialog}
    </>
  );
}
