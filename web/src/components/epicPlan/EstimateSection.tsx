import { Badge, Group, Paper, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

import type { EpicPlanView } from '../../api/types';
import { fmtNum, fmtPct } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { KpiCard, Note, Tipped } from '../common';
import { hours, InfoTip, plural, roleIndex, TIPS } from './shared';

function Figure({ label, value, hint, help }: { label: string; value: string; hint?: string; help?: string }) {
  return (
    <KpiCard label={label} value={value} help={help}>
      {hint}
    </KpiCard>
  );
}

export function EstimateSection({ view }: { view: EpicPlanView }) {
  const roles = roleIndex(view);
  const h = view.horas;
  const rec = view.reconciliacao;
  const params = view.parametros;
  const shown = view.por_papel.filter((r) => r.horas_pessoa > 0);
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <Figure label="Planejamento" value={hours(h.planejamento)} help={HELP['plan:planning_hours']} />
        <Figure label="Execução" value={hours(h.execucao)} hint="inclui code review" help={HELP['plan:execution_hours']} />
        <Paper withBorder p="md">
          <Text className="kpi-label" mb={6}>
            <Tipped help={HELP['plan:overhead']}>Overhead</Tipped>
          </Text>
          <Group justify="space-between">
            <Text size="sm">Jira</Text>
            <Text size="sm" fw={700} className="num">
              {hours(h.jira)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            {plural(h.jira_subtarefas, 'subtarefa', 'subtarefas')} × {hours(params.overhead_jira_h)}; custo do épico, fora dos papéis
          </Text>
          <Group justify="space-between">
            <Text size="sm">Code review</Text>
            <Text size="sm" fw={700} className="num">
              {hours(h.code_review)}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            subconjunto da execução
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
                aria-label={`${role.nome}: ${fmtPct(entry.percentual)} das horas-pessoa`}
              />
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {fmtPct(entry.percentual)} das horas-pessoa
                </Text>
                <InfoTip label={TIPS.personHours} width={260} />
              </Group>
              <Text size="xs" c="dimmed">
                {plural(entry.subtarefas, 'subtarefa', 'subtarefas')}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>

      <Note title="Como as horas-pessoa somam">
        Calculado a partir das horas de cada subtarefa no Jira. Quando uma subtarefa é composta (“A + B”, por exemplo uma
        integração conjunta), cada papel envolvido soma a hora <b>cheia</b>, não a metade: as duas pessoas trabalham ao mesmo
        tempo. Por isso a soma por papel é maior que as horas do épico. O overhead de Jira é custo do épico como um todo e não
        entra em nenhum papel.
      </Note>
      <Group gap="xs" wrap="wrap">
        <Badge
          color={rec.fecha ? 'teal' : 'red'}
          variant="light"
          tt="none"
          leftSection={rec.fecha ? <IconCheck size={12} /> : <IconX size={12} />}
        >
          {rec.fecha ? 'reconciliação fecha' : 'reconciliação não fecha'}
        </Badge>
        <Text size="sm">
          Σ horas-pessoa {hours(rec.horas_pessoa)} − {hours(rec.horas_compostas)} em subtarefas compostas ={' '}
          {hours(rec.horas_pessoa - rec.horas_compostas)} = planejamento {hours(rec.horas_planejamento)} + execução{' '}
          {hours(rec.horas_execucao)} ({fmtNum(rec.horas_planejamento + rec.horas_execucao, 2)}h)
          {!rec.fecha && ' — há subtarefas sem papel; veja os problemas nos dados.'}
        </Text>
      </Group>
    </Stack>
  );
}
