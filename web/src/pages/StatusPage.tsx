import { Alert, Anchor, Badge, Button, Group, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLayoutKanban, IconRefresh, IconUsersGroup } from '@tabler/icons-react';
import { Link } from 'react-router';

import { useCollect, useStatus } from '../api/hooks';
import type { StatusEntity } from '../api/types';
import { CollectionProgress } from '../components/CollectionProgress';
import { ErrorState, Loading, PageHeader, useConfirm } from '../components/common';
import { HealthPanel } from '../components/HealthPanel';
import { useFilters } from '../lib/filters';
import { fmtDateTime, fromNow, plural } from '../lib/format';

const STATUS_COLOR: Record<string, string> = { success: 'teal', partial: 'yellow', failed: 'red', running: 'petrol', empty: 'gray' };
const STATUS_LABEL: Record<string, string> = { success: 'sucesso', partial: 'parcial', failed: 'falhou', running: 'em andamento', empty: 'nada a coletar', cancelled: 'cancelada', skipped: 'ignorada (outra em andamento)' };

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="light" color={STATUS_COLOR[status] ?? 'gray'}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

const counter = (counters: Record<string, unknown>, key: string) => (counters[key] === undefined ? '—' : String(counters[key]));

/** Which level of the hierarchy the row is: the team (space) or one of its boards. Colour alone
 *  never carries the distinction — the icon and the word do. */
function EntityBadge({ entity }: { entity: StatusEntity['entity'] }) {
  const space = entity === 'space';
  const Icon = space ? IconUsersGroup : IconLayoutKanban;
  return (
    <Badge variant={space ? 'light' : 'default'} color={space ? 'petrol' : 'gray'} leftSection={<Icon size={12} />}>
      {space ? 'espaço (time)' : 'board'}
    </Badge>
  );
}

/** Observability: last successful run per board, counters, and failures with cause and action. */
export function StatusPage() {
  const status = useStatus();
  const collect = useCollect();
  const data = status.data;
  const { get, set } = useFilters();
  const tab = get('tab') ?? 'coleta';
  const { confirm, dialog: confirmDialog } = useConfirm();
  const start = (mode: 'incremental' | 'full') =>
    collect.mutate(
      { mode },
      {
        onSuccess: () =>
          notifications.show({
            title: mode === 'full' ? 'Reconciliação iniciada' : 'Coleta iniciada',
            message: 'O andamento aparece nesta página.',
          }),
      },
    );
  const reconcile = async () => {
    const ok = await confirm({
      title: 'Reconciliação completa?',
      body: 'Relê todo o histórico; demora mais e usa mais chamadas à API do Jira.',
      confirmLabel: 'Reconciliar',
    });
    if (ok) start('full');
  };

  return (
    <>
      <PageHeader
        title="Status da coleta"
        subtitle="A coleta acontece por board; a linha do espaço resume os boards do time pela coleta mais antiga. Falha de um board não derruba os outros."
        actions={
          <>
            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => start('incremental')}
              loading={collect.isPending || data?.collecting}
              disabled={!data?.jira_configured}
            >
              Coletar agora
            </Button>
            <Button variant="default" onClick={reconcile} disabled={!data?.jira_configured || data?.collecting}>
              Reconciliação completa
            </Button>
          </>
        }
      />
      {status.isLoading && <Loading />}
      {status.error && <ErrorState error={status.error} />}
      {collect.error && <ErrorState error={collect.error} title="A coleta não pôde começar" />}
      {data && !data.jira_configured && (
        <Alert color="yellow" variant="light" title="Jira não configurado" mb="md">
          Defina CADENCIA_JIRA_BASE_URL, CADENCIA_JIRA_EMAIL e CADENCIA_JIRA_API_TOKEN no ambiente da API (ou use <code>cadencia demo</code> para dados de exemplo).
        </Alert>
      )}
      <Tabs value={tab} onChange={(value) => set({ tab: value })} mb="md" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="coleta">Coleta</Tabs.Tab>
          <Tabs.Tab value="saude">Saúde dos dados</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="saude">
          <HealthPanel />
        </Tabs.Panel>
        <Tabs.Panel value="coleta">
        {data && (
          <Stack gap="lg">
            <CollectionProgress />
            <Stack gap="xs">
              <Title order={4}>Espaços e boards acompanhados</Title>
              <Table.ScrollContainer minWidth={1000}>
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Tipo</Table.Th>
                      <Table.Th>Nome</Table.Th>
                      <Table.Th>Última coleta bem-sucedida</Table.Th>
                      <Table.Th>Última reconciliação</Table.Th>
                      <Table.Th>Última execução</Table.Th>
                      <Table.Th>Itens · históricos · snapshots</Table.Th>
                      <Table.Th>Causa e ação</Table.Th>
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
                            {e.entity === 'space' ? plural(e.boards ?? 0, 'board', 'boards') : e.space.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {fromNow(e.last_success_at)}
                          <Text size="xs" c="dimmed">
                            {e.entity === 'space' && e.last_success_at ? `mais antiga · ${fmtDateTime(e.last_success_at)}` : fmtDateTime(e.last_success_at)}
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
              <Title order={4}>Execuções recentes</Title>
              <Table.ScrollContainer minWidth={900}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Execução</Table.Th>
                      <Table.Th>Modo</Table.Th>
                      <Table.Th>Status</Table.Th>
                      <Table.Th>Início</Table.Th>
                      <Table.Th>Fim</Table.Th>
                      <Table.Th className="num">Chamadas</Table.Th>
                      <Table.Th className="num">Esperas por limite</Table.Th>
                      <Table.Th className="num">Retentativas</Table.Th>
                      <Table.Th>Erros por tipo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.runs.map((r) => (
                      <Table.Tr key={r.id}>
                        <Table.Td className="mono">{r.id}</Table.Td>
                        <Table.Td>{r.mode === 'full' ? 'completa' : 'incremental'}</Table.Td>
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
