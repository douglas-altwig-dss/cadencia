import { Badge, Button, Group, Paper, Progress, Stack, Text } from '@mantine/core';
import { IconPlayerStop } from '@tabler/icons-react';

import { useCancelCollection } from '../api/featureHooks';
import { useStatus } from '../api/hooks';
import { fromNow } from '../lib/format';

const PHASES: Record<string, string> = {
  configuracao: 'lendo a configuração do board',
  itens: 'buscando os itens',
  historico: 'lendo o histórico dos itens',
  gravando: 'gravando e congelando checkpoints',
};

function eta(seconds: number | null) {
  if (seconds == null) return null;
  if (seconds < 60) return 'menos de 1 min';
  return `~${Math.round(seconds / 60)} min`;
}

/**
 * RF-82: a running collection, board by board — which step, how far through the item histories,
 * about how long is left (from the board's own recent runs) — and a way to stop it. It used to be a
 * single "coletando" flag for minutes on end.
 */
export function CollectionProgress({ compact = false }: { compact?: boolean }) {
  const status = useStatus();
  const cancel = useCancelCollection();
  const current = status.data?.current;
  if (!current) return null;
  const mode = current.mode === 'full' ? 'reconciliação completa' : 'coleta incremental';
  return (
    <Paper withBorder p="sm" role="region" aria-label="Coleta em andamento">
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Badge variant="light" color="petrol">
              coletando
            </Badge>
            <Text size="sm">
              {mode} · começou {fromNow(current.started_at)}
            </Text>
          </Group>
          <Button
            size="compact-xs"
            variant="default"
            color="red"
            leftSection={<IconPlayerStop size={13} />}
            disabled={current.cancel_requested}
            loading={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {current.cancel_requested ? 'cancelando no próximo passo…' : 'Cancelar'}
          </Button>
        </Group>
        {!compact &&
          current.boards.map((board) => {
            const running = board.status === 'running';
            const ratio = board.total ? (board.done ?? 0) / board.total : null;
            return (
              <Stack key={board.board_id} gap={2}>
                <Group justify="space-between" gap="xs" wrap="nowrap">
                  <Text size="sm" fw={500} lineClamp={1}>
                    {board.name}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                    {running
                      ? [PHASES[board.phase ?? ''] ?? 'começando', board.total ? `${board.done ?? 0}/${board.total}` : null, eta(board.eta_seconds)]
                          .filter(Boolean)
                          .join(' · ')
                      : board.status === 'success'
                        ? 'concluído'
                        : board.status === 'cancelled'
                          ? 'cancelado'
                          : 'falhou'}
                  </Text>
                </Group>
                <Progress
                  size="sm"
                  value={running ? (ratio ?? 0.05) * 100 : 100}
                  animated={running && ratio === null}
                  color={board.status === 'failed' ? 'red' : board.status === 'cancelled' ? 'gray' : undefined}
                  aria-label={`Progresso de ${board.name}`}
                />
              </Stack>
            );
          })}
      </Stack>
    </Paper>
  );
}
