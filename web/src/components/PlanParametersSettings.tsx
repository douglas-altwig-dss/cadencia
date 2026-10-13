import { Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import { usePlanParameters, useSavePlanParameters } from '../api/planHooks';
import type { HoursSource, PlanParameters } from '../api/types';
import { ErrorState, Loading } from './common';

type Numeric = 'jornada_h' | 'overhead_jira_h' | 'code_review_h' | 'cadastro_card_min' | 'granularidade_h' | 'limite_solver_s';
type LabelKey = 'rotulo_code_review' | 'rotulo_cadastro_jira' | 'rotulo_planejamento' | 'rotulo_sem_codigo';

const NUMERIC: { key: Numeric; label: string; description: string; step: number; suffix: string }[] = [
  {
    key: 'jornada_h',
    label: 'Jornada de planejamento',
    description:
      'Horas líquidas por dia já sem reuniões, para o cronograma de épicos. Diferente de “Horas por dia” em Perfil do board, que é bruta e passa pelo fator de foco: um número por board, este é único para todos os épicos. × 5 dias = capacidade semanal por pessoa.',
    step: 0.5,
    suffix: ' h/dia',
  },
  { key: 'overhead_jira_h', label: 'Overhead de Jira', description: 'Por subtarefa de execução de tarefa com código: leitura do card e prova.', step: 0.5, suffix: ' h' },
  { key: 'code_review_h', label: 'Code review', description: 'Por subtarefa de execução; confere as horas da subtarefa de code review.', step: 0.5, suffix: ' h' },
  { key: 'cadastro_card_min', label: 'Cadastro de cards', description: 'Por card; confere as horas da subtarefa de cadastro no Jira.', step: 1, suffix: ' min' },
  { key: 'granularidade_h', label: 'Granularidade de agenda', description: 'Menor unidade de tempo do cronograma e dos algoritmos.', step: 0.25, suffix: ' h' },
  { key: 'limite_solver_s', label: 'Limite de tempo dos solvers', description: 'MILP e CP-SAT.', step: 5, suffix: ' s' },
];

const LABELS: { key: LabelKey; label: string; description: string }[] = [
  { key: 'rotulo_code_review', label: 'Label de code review', description: 'Marca a subtarefa como code review.' },
  { key: 'rotulo_cadastro_jira', label: 'Label de cadastro no Jira', description: 'Marca a subtarefa como criação dos cards.' },
  { key: 'rotulo_planejamento', label: 'Label de fase de planejamento', description: 'Na tarefa: ela pertence ao planejamento.' },
  { key: 'rotulo_sem_codigo', label: 'Label de tarefa sem código', description: 'Na tarefa: sem overhead de Jira nem code review.' },
];

/**
 * The epic plan's own parameters (jornada, overheads, labels, hours source, solver limit): global
 * to every epic, not to any one of them, so they live here rather than inside a Plano tab — a
 * setting that only ever changes for the whole instance had no business being a click into one
 * epic away from Configuração. `EpicPlanTab`'s "Parâmetros" section is a summary with a link back
 * to this tab, not a second place that edits the same numbers.
 */
export function PlanParametersSettings() {
  const query = usePlanParameters();
  const save = useSavePlanParameters();
  const [draft, setDraft] = useState<PlanParameters | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  if (query.isLoading || !draft) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(query.data);
  const submit = () =>
    save.mutate(draft, {
      onSuccess: () => notifications.show({ title: 'Parâmetros salvos', message: 'Todos os épicos passam a usar os novos números.' }),
      onError: (error) => notifications.show({ color: 'red', title: 'Parâmetros recusados', message: error.message }),
    });

  return (
    <Stack gap="md" maw={1000}>
      <Text size="sm" c="dimmed">
        Valem para o planejamento de todos os épicos — não é uma configuração por board nem por épico.
      </Text>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Jornada, overheads e limites
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {NUMERIC.map((field) => (
            <NumberInput
              key={field.key}
              label={field.label}
              description={field.description}
              value={draft[field.key]}
              step={field.step}
              min={0}
              decimalSeparator=","
              suffix={field.suffix}
              onChange={(value) => setDraft({ ...draft, [field.key]: Number(value) || 0 })}
            />
          ))}
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Como o Jira vira plano
        </Title>
        <Stack gap="sm">
          <Select
            label="Fonte das horas"
            description="De onde vêm as horas de cada subtarefa no Jira. Há times que preenchem a estimativa original; outros usam o campo de estimativa (o mesmo dos story points) com horas."
            data={[
              { value: 'estimativa_original', label: 'Estimativa original (controle de tempo)' },
              { value: 'campo_estimativa', label: 'Campo de estimativa (story points)' },
            ]}
            value={draft.fonte_horas}
            onChange={(value) => value && setDraft({ ...draft, fonte_horas: value as HoursSource })}
            allowDeselect={false}
            maw={520}
          />
          <Text size="xs" c="dimmed">
            Tarefas são os filhos do épico; subtarefas, os filhos delas. O papel de uma subtarefa é, nesta ordem: o escolhido em
            “Papéis das subtarefas” do próprio épico; o das labels ou componentes cadastrados em cada papel (Pessoas → Funções e
            equipe); o do responsável, quando ele tem um papel só na equipe; o da tarefa, quando ela tem um só. Dois papéis fazem
            uma subtarefa composta. Links “é bloqueado por” são os pré-requisitos. Negócio, Técnico e Dependências são seções da
            descrição da tarefa, pelos títulos.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {LABELS.map((field) => (
              <TextInput
                key={field.key}
                label={field.label}
                description={field.description}
                value={draft[field.key]}
                onChange={(e) => setDraft({ ...draft, [field.key]: e.currentTarget.value })}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Paper>
      <Group>
        <Button disabled={!dirty} loading={save.isPending} onClick={submit}>
          Salvar parâmetros
        </Button>
        <Button variant="default" disabled={!dirty} onClick={() => setDraft(query.data!)}>
          Descartar
        </Button>
      </Group>
    </Stack>
  );
}
