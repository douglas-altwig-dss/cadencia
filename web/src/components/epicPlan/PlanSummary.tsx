import { Badge, Group, SimpleGrid } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { fmtNum } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { KpiCard } from '../common';
import { gainText, hours, plural, StatusBadge } from './shared';

/** The answer first: what the epic costs, how long it takes, what planning gains, who does it. */
export function PlanSummary({ view }: { view: EpicPlanView }) {
  const h = view.horas;
  const base = view.base;
  const plan = view.plano;
  // The epic's own errors also block the baseline: count each problem once.
  const errors = new Set([...view.problemas.filter((p) => p.nivel === 'erro'), ...view.bloqueios_base].map((p) => p.codigo + p.mensagem)).size;
  const warnings = view.problemas.filter((p) => p.nivel === 'aviso').length;
  const gain = plan?.ganho_dias !== undefined ? gainText(plan.ganho_dias) : null;
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, lg: 5 }} spacing="sm">
      <KpiCard label="Horas do épico" value={hours(h.total)} help={HELP['plan:hours']}>
        planejamento {hours(h.planejamento)} · execução {hours(h.execucao)} · Jira {hours(h.jira)}
      </KpiCard>
      <KpiCard label="Cronograma base" value={base ? plural(base.duracao.total_dias, 'dia útil', 'dias úteis') : '—'} help={HELP['plan:baseline']}>
        {base ? `${base.duracao.planejamento_dias} d de planejamento + ${base.duracao.execucao_dias} d de execução` : 'bloqueado — veja os dados'}
      </KpiCard>
      <KpiCard label="Plano gerado" value={plan ? plural(plan.duracao.total_dias, 'dia útil', 'dias úteis') : '—'} help={HELP['plan:plan']}>
        {plan ? (
          <Group gap={6}>
            {gain && (
              <Badge variant="light" color={gain.good ? 'teal' : 'gray'}>
                {gain.text}
              </Badge>
            )}
            {plan.status !== 'heuristico' && <StatusBadge status={plan.status} gap={plan.gap} />}
          </Group>
        ) : (
          'sem plano para a equipe atual'
        )}
      </KpiCard>
      <KpiCard label="Equipe" value={plural(view.capacidade.pessoas, 'pessoa', 'pessoas')} help={HELP['plan:team']}>
        {fmtNum(view.capacidade.real)}h/semana · {plural(view.capacidade.flutuantes.length, 'cobre', 'cobrem')} mais de um papel
      </KpiCard>
      <KpiCard label="Dados do Jira" value={plural(view.tarefas.length, 'tarefa', 'tarefas')} help={HELP['plan:data']}>
        <Group gap={6}>
          <span>{plural(view.subtarefas.length, 'subtarefa', 'subtarefas')}</span>
          {errors > 0 ? (
            <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              {plural(errors, 'erro', 'erros')}
            </Badge>
          ) : warnings > 0 ? (
            <Badge color="yellow" variant="light" leftSection={<IconInfoCircle size={12} />}>
              {plural(warnings, 'aviso', 'avisos')}
            </Badge>
          ) : (
            <Badge color="teal" variant="light" leftSection={<IconCircleCheck size={12} />}>
              sem problemas
            </Badge>
          )}
        </Group>
      </KpiCard>
    </SimpleGrid>
  );
}
