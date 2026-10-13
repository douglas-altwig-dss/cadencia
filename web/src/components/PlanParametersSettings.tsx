import { Button, Group, NumberInput, Paper, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';

import { usePlanParameters, useSavePlanParameters } from '../api/planHooks';
import type { HoursSource, PlanParameters } from '../api/types';
import { currentLocale, useT } from '../i18n';
import { ErrorState, Loading } from './common';

type Numeric = 'jornada_h' | 'overhead_jira_h' | 'code_review_h' | 'cadastro_card_min' | 'granularidade_h' | 'limite_solver_s';
type LabelKey = 'rotulo_code_review' | 'rotulo_cadastro_jira' | 'rotulo_planejamento' | 'rotulo_sem_codigo';

// Labels, descriptions and suffixes come from the catalogue (`epicPlan.settings`), read at render time.
const NUMERIC: { key: Numeric; step: number }[] = [
  { key: 'jornada_h', step: 0.5 },
  { key: 'overhead_jira_h', step: 0.5 },
  { key: 'code_review_h', step: 0.5 },
  { key: 'cadastro_card_min', step: 1 },
  { key: 'granularidade_h', step: 0.25 },
  { key: 'limite_solver_s', step: 5 },
];

const LABELS: LabelKey[] = ['rotulo_code_review', 'rotulo_cadastro_jira', 'rotulo_planejamento', 'rotulo_sem_codigo'];

/** The current language's decimal separator, so "8,5" or "8.5" is typed the way numbers are shown. */
const decimalSeparator = () => (1.5).toLocaleString(currentLocale()).charAt(1);

/**
 * The epic plan's own parameters (jornada, overheads, labels, hours source, solver limit): global
 * to every epic, not to any one of them, so they live here rather than inside a Plano tab — a
 * setting that only ever changes for the whole instance had no business being a click into one
 * epic away from Configuração. `EpicPlanTab`'s "Parâmetros" section is a summary with a link back
 * to this tab, not a second place that edits the same numbers.
 */
export function PlanParametersSettings() {
  const t = useT();
  const m = t.epicPlan.settings;
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
      onSuccess: () => notifications.show({ title: m.saved, message: m.savedMessage }),
      onError: (error) => notifications.show({ color: 'red', title: m.rejected, message: error.message }),
    });

  return (
    <Stack gap="md" maw={1000}>
      <Text size="sm" c="dimmed">
        {m.intro}
      </Text>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          {m.numericTitle}
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {NUMERIC.map((field) => (
            <NumberInput
              key={field.key}
              label={m.numeric[field.key].label}
              description={m.numeric[field.key].description}
              value={draft[field.key]}
              step={field.step}
              min={0}
              decimalSeparator={decimalSeparator()}
              suffix={m.numeric[field.key].suffix}
              onChange={(value) => setDraft({ ...draft, [field.key]: Number(value) || 0 })}
            />
          ))}
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          {m.jiraTitle}
        </Title>
        <Stack gap="sm">
          <Select
            label={m.source}
            description={m.sourceDescription}
            data={[
              { value: 'estimativa_original', label: m.sourceOriginal },
              { value: 'campo_estimativa', label: m.sourceField },
            ]}
            value={draft.fonte_horas}
            onChange={(value) => value && setDraft({ ...draft, fonte_horas: value as HoursSource })}
            allowDeselect={false}
            maw={520}
          />
          <Text size="xs" c="dimmed">
            {m.explanation}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            {LABELS.map((key) => (
              <TextInput
                key={key}
                label={m.labels[key].label}
                description={m.labels[key].description}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.currentTarget.value })}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Paper>
      <Group>
        <Button disabled={!dirty} loading={save.isPending} onClick={submit}>
          {m.save}
        </Button>
        <Button variant="default" disabled={!dirty} onClick={() => setDraft(query.data!)}>
          {m.discard}
        </Button>
      </Group>
    </Stack>
  );
}
