import { Alert, Badge, Button, Divider, Group, List, Loader, Modal, Select, Stack, Stepper, Text } from '@mantine/core';
import { useState } from 'react';

import { plural } from '../../lib/format';
import { useCloneMapping, useSaveMapping, useTemplate, useTemplateReadiness, useTemplates } from '../../api/hooks';
import type { CloneMappingPlan } from '../../api/hooks';
import { ErrorState } from '../common';
import { PreviewBody } from './RunPanels';
import { TemplateDiagnosticsPanel } from './TemplatePanels';

/**
 * #23: the first ten minutes with a new template, in order — what to fix in the file, the mapping
 * the labels suggest, which variables still have no value, and the deck it makes for one board.
 * Every step can be skipped: the editor behind it is where the real work happens anyway.
 */
export function TemplateWizard({
  templateId,
  opened,
  onClose,
  onVariables,
}: {
  templateId: number;
  opened: boolean;
  onClose: () => void;
  onVariables: () => void;
}) {
  const [step, setStep] = useState(0);
  const detail = useTemplate(opened ? templateId : undefined);
  const readiness = useTemplateReadiness(opened && step >= 2 ? templateId : undefined);
  const save = useSaveMapping(templateId);
  const templates = useTemplates();
  const clone = useCloneMapping(templateId);
  const [cloneFrom, setCloneFrom] = useState<string | null>(null);
  const [clonePlan, setClonePlan] = useState<CloneMappingPlan | null>(null);
  const data = detail.data;
  const suggested = data ? Object.values(data.suggestion.slides).reduce((n, s) => n + s.bindings.length, 0) : 0;
  const notReady = (readiness.data?.slides ?? []).filter((s) => s.problems.length);

  return (
    <Modal opened={opened} onClose={onClose} title={data ? `Novo modelo — ${data.name}` : 'Novo modelo'} size="80rem">
      <Stepper active={step} onStepClick={setStep} size="sm" allowNextStepsSelect>
        <Stepper.Step label="Diagnóstico" description="o arquivo">
          <Stack gap="sm" mt="md">
            <Text size="sm" c="dimmed">
              O que vale corrigir no .pptx antes da primeira geração. Nada aqui impede de seguir.
            </Text>
            <TemplateDiagnosticsPanel templateId={templateId} />
          </Stack>
        </Stepper.Step>
        <Stepper.Step label="Mapeamento" description="o que vai onde">
          <Stack gap="sm" mt="md">
            {!data && <Loader size="sm" />}
            {data && (
              <>
                <Text size="sm">
                  A Cadência leu os rótulos e a legenda de cores do modelo e propôs <b>{suggested}</b> {suggested === 1 ? 'vínculo' : 'vínculos'} em{' '}
                  {plural(Object.keys(data.suggestion.slides).length, 'slide', 'slides')}.
                </Text>
                {data.suggestion.notes.length > 0 && (
                  <List size="sm">
                    {data.suggestion.notes.map((note) => (
                      <List.Item key={note}>{note}</List.Item>
                    ))}
                  </List>
                )}
                {data.mapping ? (
                  <Badge color="teal" variant="light">
                    mapeamento salvo
                  </Badge>
                ) : (
                  <Group>
                    <Button loading={save.isPending} onClick={() => {
                        const { notes: _notes, ...mapping } = data.suggestion;
                        save.mutate(mapping, { onSuccess: () => void detail.refetch() });
                      }}>
                      Usar a sugestão
                    </Button>
                    <Text size="xs" c="dimmed">
                      Dá para ajustar tudo depois, clicando nas formas do slide.
                    </Text>
                  </Group>
                )}
                {save.error && <ErrorState error={save.error} title="Mapeamento não salvo" />}
                {!data.mapping && (templates.data?.items.length ?? 0) > 1 && (
                  <>
                    <Divider label="ou" labelPosition="center" />
                    <Text size="sm" c="dimmed">
                      Se este modelo é uma versão redesenhada de outro que a Cadência já conhece, tente
                      trazer o mapeamento dele — casa cada vínculo pelo nome da forma e a posição do
                      slide, o que dois modelos costumam manter mesmo quando o layout muda.
                    </Text>
                    <Group align="flex-end">
                      <Select
                        size="sm"
                        label="Modelo de origem"
                        placeholder="Escolher"
                        data={(templates.data?.items ?? [])
                          .filter((t) => t.id !== templateId)
                          .map((t) => ({ value: String(t.id), label: t.name }))}
                        value={cloneFrom}
                        onChange={(value) => {
                          setCloneFrom(value);
                          setClonePlan(null);
                        }}
                        w={240}
                      />
                      <Button
                        size="sm"
                        variant="default"
                        loading={clone.isPending && !clonePlan}
                        disabled={!cloneFrom}
                        onClick={() =>
                          cloneFrom &&
                          clone.mutate({ fromTemplateId: Number(cloneFrom) }, { onSuccess: setClonePlan })
                        }
                      >
                        Ver o que seria copiado
                      </Button>
                    </Group>
                    {clonePlan && (
                      <Alert color={clonePlan.matched ? 'blue' : 'yellow'} variant="light">
                        <Text size="sm">
                          {plural(clonePlan.matched, 'vínculo encontraria', 'vínculos encontrariam')} a mesma
                          forma no modelo novo.
                          {clonePlan.unmatched.length > 0
                            ? ` ${plural(clonePlan.unmatched.length, 'outro não seria', 'outros não seriam')} encontrado; seria preciso refazê-lo à mão.`
                            : ''}
                        </Text>
                        <Button
                          size="compact-sm"
                          mt="xs"
                          disabled={!clonePlan.matched}
                          loading={clone.isPending}
                          onClick={() =>
                            cloneFrom &&
                            clone.mutate(
                              { fromTemplateId: Number(cloneFrom), apply: true },
                              { onSuccess: () => void detail.refetch() },
                            )
                          }
                        >
                          Aplicar
                        </Button>
                      </Alert>
                    )}
                    {clone.error && <ErrorState error={clone.error} title="Não foi possível clonar" />}
                  </>
                )}
              </>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label="Variáveis" description="o que falta preencher">
          <Stack gap="sm" mt="md">
            {readiness.isLoading && <Loader size="sm" />}
            {readiness.data && !notReady.length && (
              <Text size="sm" c="teal.8">
                Toda variável usada pelo modelo tem valor para {readiness.data.boards.join(', ') || 'os boards acompanhados'}.
              </Text>
            )}
            {notReady.length > 0 && (
              <Alert color="yellow" variant="light" title="Sem valor ainda">
                <List size="sm">
                  {notReady.map((slide) => (
                    <List.Item key={slide.slide_id}>
                      <b>{slide.name || `Slide ${slide.index}`}</b>:{' '}
                      {slide.problems
                        .map((p) => (p.kind === 'nao_registrada' ? `${p.variable} não registrada` : `${p.variable} sem valor para ${p.boards.join(', ')}`))
                        .join(' · ')}
                    </List.Item>
                  ))}
                </List>
                <Button size="xs" mt="sm" variant="light" onClick={onVariables}>
                  Abrir Variáveis
                </Button>
              </Alert>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label="Prévia" description="um board de verdade">
          <Stack mt="md">{data && <PreviewBody templateId={templateId} boards={data.boards} audiences={data.mapping?.audiences ?? []} />}</Stack>
        </Stepper.Step>
      </Stepper>
      <Group justify="space-between" mt="lg">
        <Button variant="default" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
          {step === 0 ? 'Pular o assistente' : 'Voltar'}
        </Button>
        <Button onClick={() => (step === 3 ? onClose() : setStep(step + 1))}>{step === 3 ? 'Ir para o editor' : 'Próximo'}</Button>
      </Group>
    </Modal>
  );
}
