import { Button, Code, Group, Stack, Text } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { Link } from 'react-router';

import type { PlanParameters } from '../../api/types';
import { fmtNum } from '../../lib/format';

/**
 * A read-only summary of the plan's own parameters (jornada, overheads, labels, hours source):
 * global to every epic, so this section only shows what they currently are and points at the one
 * place that edits them — Configuração — rather than repeating the editor once per epic.
 */
export function ParametersSummary({ parameters }: { parameters: PlanParameters }) {
  const summary = [
    `horas do ${parameters.fonte_horas === 'campo_estimativa' ? 'campo de estimativa' : 'estimativa original'}`,
    `jornada ${fmtNum(parameters.jornada_h)} h/dia`,
    `Jira ${fmtNum(parameters.overhead_jira_h)} h/subtarefa`,
    `code review ${fmtNum(parameters.code_review_h)} h`,
    `cadastro ${fmtNum(parameters.cadastro_card_min)} min/card`,
    `agenda em ${fmtNum(parameters.granularidade_h, 2)} h`,
    `solvers até ${fmtNum(parameters.limite_solver_s)} s`,
  ];
  return (
    <Group justify="space-between" wrap="nowrap" align="flex-start">
      <Stack gap={6}>
        <Text size="sm">{summary.join(' · ')}</Text>
        <Group gap={6}>
          <Text size="xs" c="dimmed">
            Labels:
          </Text>
          {[parameters.rotulo_code_review, parameters.rotulo_cadastro_jira, parameters.rotulo_planejamento, parameters.rotulo_sem_codigo].map((label) => (
            <Code key={label}>{label}</Code>
          ))}
        </Group>
        <Text size="xs" c="dimmed">
          Vale para todos os épicos, não só este.
        </Text>
      </Stack>
      <Button component={Link} to="/configuracao?tab=plano-epico" variant="default" leftSection={<IconSettings size={16} />}>
        Editar em Configuração
      </Button>
    </Group>
  );
}
