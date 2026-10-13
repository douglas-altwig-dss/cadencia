import { Button, Code, Group, Stack, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { Link } from 'react-router';

import type { PlanParameters } from '../../api/types';
import { useT } from '../../i18n';
import { fmtNum } from '../../lib/format';

/**
 * A read-only summary of the plan's own parameters (jornada, overheads, labels, hours source):
 * global to every epic, so this section only shows what they currently are and points at the one
 * place that edits them — Configuração — rather than repeating the editor once per epic.
 */
export function ParametersSummary({ parameters }: { parameters: PlanParameters }) {
  const t = useT();
  const m = t.epicPlan.parametersSummary;
  const summary = [
    parameters.fonte_horas === 'campo_estimativa' ? m.hoursFromField : m.hoursFromOriginal,
    m.workday(fmtNum(parameters.jornada_h)),
    m.jira(fmtNum(parameters.overhead_jira_h)),
    m.codeReview(fmtNum(parameters.code_review_h)),
    m.cardCreation(fmtNum(parameters.cadastro_card_min)),
    m.granularity(fmtNum(parameters.granularidade_h, 2)),
    m.solverLimit(fmtNum(parameters.limite_solver_s)),
  ];
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Stack gap={6}>
        <Text size="sm">{summary.join(' · ')}</Text>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            {m.labels}
          </Text>
          {[parameters.rotulo_code_review, parameters.rotulo_cadastro_jira, parameters.rotulo_planejamento, parameters.rotulo_sem_codigo].map((label) => (
            <Code key={label}>{label}</Code>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          {m.appliesToAll}
        </Text>
      </Stack>
      <Button component={Link} to="/configuracao?tab=plano-epico" variant="default" leftSection={<IconSettings size={16} />}>
        {m.edit}
      </Button>
    </Group>
  );
}
