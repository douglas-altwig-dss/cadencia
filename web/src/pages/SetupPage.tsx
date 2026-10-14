import { Alert, Anchor, Button, Code, Group, MultiSelect, Paper, Stack, Stepper, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconSettings } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useBoards, useCollect, useDiscovery, useHealth, useSaveSelection, useStatus } from '../api/hooks';
import { CollectionProgress } from '../components/CollectionProgress';
import { ErrorState, Loading, PageHeader } from '../components/common';
import { ConfigWizard } from '../components/setup/ConfigWizard';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';

type Phase = 'configure' | 'first-run';

/**
 * RF-79: setting Cadência up, as one guided path at `/setup`. Two phases: *configure* (the runtime
 * settings — Jira, calendar, collection, e-mail, AI — reviewed and saved at once) and *first run*
 * (discover, choose boards, collect, then the deck). It replaces the getting-started guide and the
 * configuration wizard, which both began by asking for Jira. `?phase=` says which phase is open;
 * without it, a Jira already configured opens on the first run.
 */
export function SetupPage() {
  const t = useT();
  const m = t.tracking.wizard;
  const navigate = useNavigate();
  const { get, set } = useFilters();
  const health = useHealth();
  const requested = get('phase');
  if (health.isLoading && requested !== 'configure' && requested !== 'first-run') return <Loading />;
  const phase: Phase =
    requested === 'configure' || requested === 'first-run' ? requested : health.data?.jira_configured ? 'first-run' : 'configure';
  const phases: Phase[] = ['configure', 'first-run'];

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <Button variant="subtle" size="xs" onClick={() => navigate('/')}>
            {m.skip}
          </Button>
        }
      />
      <Stepper active={phases.indexOf(phase)} onStepClick={(index) => set({ phase: phases[index] })} size="sm" mb="lg">
        <Stepper.Step label={m.phaseConfigure} description={m.phaseConfigureHint} />
        <Stepper.Step label={m.phaseFirstRun} description={m.phaseFirstRunHint} />
      </Stepper>
      {phase === 'configure' ? (
        <ConfigWizard onDone={() => set({ phase: 'first-run' })} />
      ) : (
        <FirstRun onConfigure={() => set({ phase: 'configure' })} />
      )}
    </>
  );
}

function FirstRun({ onConfigure }: { onConfigure: () => void }) {
  const navigate = useNavigate();
  const health = useHealth();
  const status = useStatus();
  const discover = useDiscovery();
  const boards = useBoards('', 1, 200);
  const select = useSaveSelection();
  const collect = useCollect();
  const [step, setStep] = useLocalStorage({ key: 'cadencia-setup-passo', defaultValue: 0, getInitialValueInEffect: false });
  const [chosen, setChosen] = useState<string[]>([]);
  const m = useT().tracking.wizard;

  const selected = useMemo(() => (boards.data?.items ?? []).filter((b) => b.selected).map((b) => String(b.id)), [boards.data]);
  useEffect(() => {
    if (selected.length && !chosen.length) setChosen(selected);
  }, [selected, chosen.length]);

  const collected = (status.data?.runs ?? []).some((r) => r.status === 'success' || r.status === 'partial');
  const configured = health.data?.jira_configured ?? false;

  const options = (boards.data?.spaces ?? []).map((group) => ({
    group: group.space.name ?? m.noSpace,
    items: group.boards.map((b) => ({ value: String(b.id), label: `${b.name} (${b.type})` })),
  }));

  return (
    <>
      {!configured && health.data && (
        <Alert color="yellow" variant="light" title={m.notConfigured} mb="md">
          <Stack gap="sm" align="flex-start">
            <Text size="sm">{m.notConfiguredBody}</Text>
            <Button onClick={onConfigure} leftSection={<IconSettings size={16} />}>
              {m.configure}
            </Button>
            <Text size="sm">
              {m.noCredentialsBefore} <Code>make demo</Code> {m.noCredentialsAfter}
            </Text>
          </Stack>
        </Alert>
      )}
      <Paper withBorder p="lg">
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label={m.stepDiscovery} description={m.stepDiscoveryHint}>
            <Stack gap="sm" mt="md">
              <Text size="sm">{m.discoveryBody}</Text>
              <Group>
                <Button onClick={() => discover.mutate()} loading={discover.isPending} disabled={!configured}>
                  {m.discover}
                </Button>
                <Button variant="default" disabled={!discover.data && !(boards.data?.total ?? 0)} onClick={() => setStep(1)}>
                  {m.continue}
                </Button>
              </Group>
              {discover.data && (
                <Alert color="teal" variant="light">
                  {m.discovered(discover.data.boards.length, discover.data.spaces.length)}
                  {discover.data.missing_fields.length > 0 && (
                    <>
                      {' '}
                      {m.missingFields(discover.data.missing_fields.join(', '))}{' '}
                      <Anchor component={Link} to="/settings?tab=fields">
                        {m.fillManually}
                      </Anchor>
                      .
                    </>
                  )}
                </Alert>
              )}
              {discover.error && <ErrorState error={discover.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={m.stepBoards} description={m.stepBoardsHint}>
            <Stack gap="sm" mt="md">
              <MultiSelect
                label={m.trackedBoards}
                description={m.trackedBoardsHint}
                data={options}
                value={chosen}
                onChange={setChosen}
                searchable
                maw={640}
              />
              <Group>
                <Button
                  disabled={!chosen.length}
                  loading={select.isPending}
                  onClick={() => select.mutate(chosen.map(Number), { onSuccess: () => setStep(2) })}
                >
                  {m.saveAndContinue}
                </Button>
              </Group>
              {select.error && <ErrorState error={select.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={m.stepCollection} description={m.stepCollectionHint}>
            <Stack gap="sm" mt="md">
              <Text size="sm">{m.collectionBody}</Text>
              <Group>
                <Button onClick={() => collect.mutate({ mode: 'full' })} loading={collect.isPending} disabled={status.data?.collecting}>
                  {m.collectNow}
                </Button>
                <Button variant="default" disabled={!collected} onClick={() => setStep(3)}>
                  {m.continue}
                </Button>
              </Group>
              <CollectionProgress />
              {collected && !status.data?.collecting && <Alert color="teal" variant="light">{m.collected}</Alert>}
              {collect.error && <ErrorState error={collect.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={m.stepDeck} description={m.stepDeckHint}>
            <Stack gap="sm" mt="md">
              <Title order={5}>{m.deckTitle}</Title>
              <Text size="sm">{m.deckBody}</Text>
              <Group>
                <Button component={Link} to="/presentation" onClick={() => setStep(4)}>
                  {m.openDeck}
                </Button>
                <Button variant="default" onClick={() => (setStep(4), navigate('/'))}>
                  {m.later}
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
          <Stepper.Completed>
            <Stack gap="sm" mt="md" align="flex-start">
              <Text>{m.allSet}</Text>
              <Button component={Link} to="/">
                {m.goHome}
              </Button>
            </Stack>
          </Stepper.Completed>
        </Stepper>
      </Paper>
    </>
  );
}
