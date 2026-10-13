import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { useT } from '../../i18n';
import { fmtNum, fmtPct } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { KpiCard, Note, Tipped } from '../common';
import { hours, InfoTip, rich, roleIndex } from './shared';

function Figure({ label, value, hint, help }: { label: string; value: string; hint?: string; help?: string }) {
  return (
    <KpiCard label={label} value={value} help={help}>
      {hint}
    </KpiCard>
  );
}

export function EstimateSection({ view }: { view: EpicPlanView }) {
  const t = useT();
  const m = t.epicPlan.estimate;
  const roles = roleIndex(view);
  const h = view.horas;
  const rec = view.reconciliacao;
  const params = view.parametros;
  const shown = view.por_papel.filter((r) => r.horas_pessoa > 0);
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Figure label={m.planning} value={hours(h.planejamento)} help={HELP['plan:planning_hours']} />
        <Figure label={m.execution} value={hours(h.execucao)} hint={m.includesReview} help={HELP['plan:execution_hours']} />
        <Paper withBorder p="md">
          <Text className="kpi-label" mb={6}>
            <Tipped help={HELP['plan:overhead']}>{m.overhead}</Tipped>
          </Text>
          <Group justify="space-between">
            <Text size="sm">{m.jira}</Text>
            <Text size="sm" fw={700} className="num">
              {hours(h.jira)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {m.jiraHint(h.jira_subtarefas, hours(params.overhead_jira_h))}
          </Text>
          <Group justify="space-between">
            <Text size="sm">{m.codeReview}</Text>
            <Text size="sm" fw={700} className="num">
              {hours(h.code_review)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {m.reviewHint}
          </Text>
        </Paper>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
        {shown.map((entry) => {
          const role = roles.get(entry.papel_id);
          if (!role) return null;
          return (
            <Paper key={role.id} withBorder p="sm" style={{ borderTop: `4px solid ${role.cor}` }}>
              <Text size="xs" fw={700} tt="uppercase" lineClamp={2}>
                {role.nome}
              </Text>
              <Text fz="xl" fw={700}>
                {hours(entry.horas_pessoa)}
              </Text>
              <Progress
                value={(entry.percentual ?? 0) * 100}
                color={role.cor}
                size="sm"
                my={4}
                aria-label={m.shareAria(role.nome, fmtPct(entry.percentual))}
              />
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {m.share(fmtPct(entry.percentual))}
                </Text>
                <InfoTip label={t.epicPlan.tips.personHours} width={260} />
              </Group>
              <Text size="xs" c="dimmed">
                {t.epicPlan.count.subtasks(entry.subtarefas)}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>

      <Note title={m.noteTitle}>{rich(m.noteBody)}</Note>
      <Group gap="xs" wrap="wrap">
        <Badge
          color={rec.fecha ? 'teal' : 'red'}
          variant="light"
          tt="none"
          leftSection={rec.fecha ? <IconCheck size={12} /> : <IconX size={12} />}
        >
          {rec.fecha ? m.reconciles : m.doesNotReconcile}
        </Badge>
        <Text size="sm">
          {m.reconciliation(
            hours(rec.horas_pessoa),
            hours(rec.horas_compostas),
            hours(rec.horas_pessoa - rec.horas_compostas),
            hours(rec.horas_planejamento),
            hours(rec.horas_execucao),
            fmtNum(rec.horas_planejamento + rec.horas_execucao, 2),
          )}
          {!rec.fecha && m.reconciliationGap}
        </Text>
      </Group>
    </Stack>
  );
}
