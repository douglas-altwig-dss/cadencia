import { Badge, Group, SimpleGrid } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { fmtNum } from '../../lib/format';
import { useT } from '../../i18n';
import { HELP } from '../../lib/indicatorHelp';
import { KpiCard } from '../common';
import { gainText, hours, StatusBadge } from './shared';

/** The answer first: what the epic costs, how long it takes, what planning gains, who does it. */
export function PlanSummary({ view }: { view: EpicPlanView }) {
  const t = useT();
  const m = t.epicPlan.summary;
  const count = t.epicPlan.count;
  const h = view.horas;
  const base = view.base;
  const plan = view.plano;
  // The epic's own errors also block the baseline: count each problem once.
  const errors = new Set([...view.problemas.filter((p) => p.nivel === 'erro'), ...view.bloqueios_base].map((p) => p.codigo + p.mensagem)).size;
  const warnings = view.problemas.filter((p) => p.nivel === 'aviso').length;
  const gain = plan?.ganho_dias !== undefined ? gainText(plan.ganho_dias) : null;
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, lg: 5 }} spacing="sm">
      <KpiCard label={m.hours} value={hours(h.total)} help={HELP['plan:hours']}>
        {m.hoursHint(hours(h.planejamento), hours(h.execucao), hours(h.jira))}
      </KpiCard>
      <KpiCard label={m.baseline} value={base ? count.workingDays(base.duracao.total_dias) : '—'} help={HELP['plan:baseline']}>
        {base ? m.baselineHint(base.duracao.planejamento_dias, base.duracao.execucao_dias) : m.baselineBlocked}
      </KpiCard>
      <KpiCard label={m.plan} value={plan ? count.workingDays(plan.duracao.total_dias) : '—'} help={HELP['plan:plan']}>
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
          m.noPlan
        )}
      </KpiCard>
      <KpiCard label={m.team} value={count.people(view.capacidade.pessoas)} help={HELP['plan:team']}>
        {m.teamHint(fmtNum(view.capacidade.real), view.capacidade.flutuantes.length)}
      </KpiCard>
      <KpiCard label={m.data} value={count.tasks(view.tarefas.length)} help={HELP['plan:data']}>
        <Group gap={6}>
          <span>{count.subtasks(view.subtarefas.length)}</span>
          {errors > 0 ? (
            <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={12} />}>
              {count.errors(errors)}
            </Badge>
          ) : warnings > 0 ? (
            <Badge color="yellow" variant="light" leftSection={<IconInfoCircle size={12} />}>
              {count.warnings(warnings)}
            </Badge>
          ) : (
            <Badge color="teal" variant="light" leftSection={<IconCircleCheck size={12} />}>
              {m.noProblems}
            </Badge>
          )}
        </Group>
      </KpiCard>
    </SimpleGrid>
  );
}
