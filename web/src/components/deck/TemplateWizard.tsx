import { Alert, Badge, Button, Divider, Group, List, Loader, Modal, Select, Stack, Stepper, Text } from '@mantine/core';
import { useState } from 'react';

import { useCloneMapping, useSaveMapping, useTemplate, useTemplateReadiness, useTemplates } from '../../api/hooks';
import type { CloneMappingPlan } from '../../api/hooks';
import { useT } from '../../i18n';
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
  const t = useT();
  const w = t.deck.wizard;
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
    <Modal opened={opened} onClose={onClose} title={data ? w.titleOf(data.name) : w.title} size="80rem">
      <Stepper active={step} onStepClick={setStep} size="sm" allowNextStepsSelect>
        <Stepper.Step label={w.diagnostics} description={w.diagnosticsHint}>
          <Stack gap="sm" mt="md">
            <Text size="sm" c="dimmed">
              {w.diagnosticsIntro}
            </Text>
            <TemplateDiagnosticsPanel templateId={templateId} />
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={w.mapping} description={w.mappingHint}>
          <Stack gap="sm" mt="md">
            {!data && <Loader size="sm" />}
            {data && (
              <>
                <Text size="sm">
                  {w.proposed(suggested, <b key="n">{suggested}</b>, Object.keys(data.suggestion.slides).length)}
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
                    {w.mappingSaved}
                  </Badge>
                ) : (
                  <Group>
                    <Button loading={save.isPending} onClick={() => {
                        const { notes: _notes, ...mapping } = data.suggestion;
                        save.mutate(mapping, { onSuccess: () => void detail.refetch() });
                      }}>
                      {w.useSuggestion}
                    </Button>
                    <Text size="xs" c="dimmed">
                      {w.adjustLater}
                    </Text>
                  </Group>
                )}
                {save.error && <ErrorState error={save.error} title={w.mappingFailed} />}
                {!data.mapping && (templates.data?.items.length ?? 0) > 1 && (
                  <>
                    <Divider label={w.or} labelPosition="center" />
                    <Text size="sm" c="dimmed">
                      {w.cloneIntro}
                    </Text>
                    <Group align="flex-end">
                      <Select
                        size="sm"
                        label={w.cloneFrom}
                        placeholder={w.choose}
                        data={(templates.data?.items ?? [])
                          .filter((item) => item.id !== templateId)
                          .map((item) => ({ value: String(item.id), label: item.name }))}
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
                        {w.clonePreview}
                      </Button>
                    </Group>
                    {clonePlan && (
                      <Alert color={clonePlan.matched ? 'blue' : 'yellow'} variant="light">
                        <Text size="sm">
                          {w.cloneMatched(clonePlan.matched)}
                          {clonePlan.unmatched.length > 0 ? ` ${w.cloneUnmatched(clonePlan.unmatched.length)}` : ''}
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
                          {w.apply}
                        </Button>
                      </Alert>
                    )}
                    {clone.error && <ErrorState error={clone.error} title={w.cloneFailed} />}
                  </>
                )}
              </>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={w.variables} description={w.variablesHint}>
          <Stack gap="sm" mt="md">
            {readiness.isLoading && <Loader size="sm" />}
            {readiness.data && !notReady.length && (
              <Text size="sm" c="teal.8">
                {w.allFilled(readiness.data.boards.join(', ') || w.trackedBoards)}
              </Text>
            )}
            {notReady.length > 0 && (
              <Alert color="yellow" variant="light" title={w.noValueYet}>
                <List size="sm">
                  {notReady.map((slide) => (
                    <List.Item key={slide.slide_id}>
                      <b>{slide.name || t.deck.slideN(slide.index)}</b>:{' '}
                      {slide.problems
                        .map((p) => (p.kind === 'nao_registrada' ? w.notRegistered(p.variable) : t.deck.readiness.noValue(p.variable, p.boards)))
                        .join(' · ')}
                    </List.Item>
                  ))}
                </List>
                <Button size="xs" mt="sm" variant="light" onClick={onVariables}>
                  {w.openVariables}
                </Button>
              </Alert>
            )}
          </Stack>
        </Stepper.Step>
        <Stepper.Step label={w.preview} description={w.previewHint}>
          <Stack mt="md">{data && <PreviewBody templateId={templateId} boards={data.boards} audiences={data.mapping?.audiences ?? []} />}</Stack>
        </Stepper.Step>
      </Stepper>
      <Group justify="space-between" mt="lg">
        <Button variant="default" onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
          {step === 0 ? w.skip : w.back}
        </Button>
        <Button onClick={() => (step === 3 ? onClose() : setStep(step + 1))}>{step === 3 ? w.toEditor : w.next}</Button>
      </Group>
    </Modal>
  );
}
