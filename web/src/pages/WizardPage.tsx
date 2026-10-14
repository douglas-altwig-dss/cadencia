import { Alert, Anchor, Button, Code, Group, MultiSelect, Paper, Stack, Stepper, Text, Title } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconCheck, IconPlugConnected, IconSettings } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useBoards, useCollect, useConnectionTest, useDiscovery, useHealth, useSaveSelection, useStatus } from '../api/hooks';
import { CollectionProgress } from '../components/CollectionProgress';
import { ErrorState, PageHeader } from '../components/common';
import { useT } from '../i18n';

/**
 * RF-79: the first run as a guided path — connect, discover, choose boards, collect, then the deck —
 * instead of a README and a terminal (the M0 milestone). Each step unlocks the next and says what
 * it did; the position is remembered, and a step already satisfied (Jira configured, boards chosen,
 * a collection done) is recognised rather than asked again.
 */
export function WizardPage() {
  const navigate = useNavigate();
  const health = useHealth();
  const status = useStatus();
  const test = useConnectionTest();
  const discover = useDiscovery();
  const boards = useBoards('', 1, 200);
  const select = useSaveSelection();
  const collect = useCollect();
  const [step, setStep] = useLocalStorage({ key: 'cadencia-inicio-passo', defaultValue: 0, getInitialValueInEffect: false });
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
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <Button variant="subtle" size="xs" onClick={() => navigate('/')}>
            {m.skip}
          </Button>
        }
      />
      <Paper withBorder p="lg">
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false} size="sm">
          <Stepper.Step label={m.stepConnection} description={m.stepConnectionHint} completedIcon={<IconCheck size={16} />}>
            <Stack gap="sm" mt="md">
              {!configured ? (
                <Alert color="yellow" variant="light" title={m.notConfigured}>
                  <Stack gap="sm" align="flex-start">
                    <Text size="sm">{m.notConfiguredBody}</Text>
                    <Button component={Link} to="/settings/wizard" leftSection={<IconSettings size={16} />}>
                      {m.configure}
                    </Button>
                    <Text size="sm">
                      {m.noCredentialsBefore} <Code>make demo</Code> {m.noCredentialsAfter}
                    </Text>
                  </Stack>
                </Alert>
              ) : (
                <Text size="sm">
                  {m.instance} <b>{health.data?.jira_base_url ?? m.configured}</b>. {m.testHint}
                </Text>
              )}
              <Group>
                <Button leftSection={<IconPlugConnected size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!configured}>
                  {m.test}
                </Button>
                <Button variant="default" disabled={!test.data?.ok} onClick={() => setStep(1)}>
                  {m.continue}
                </Button>
              </Group>
              {test.data?.ok && (
                <Alert color="teal" variant="light">
                  {m.connectedAs(test.data.identity?.name ?? '', Boolean(test.data.permissions?.BROWSE_PROJECTS))}
                </Alert>
              )}
              {test.data && !test.data.ok && (
                <Alert color="red" variant="light" title={test.data.error?.cause ?? m.failed}>
                  {test.data.error?.message} {test.data.error?.action}
                </Alert>
              )}
              {test.error && <ErrorState error={test.error} />}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={m.stepDiscovery} description={m.stepDiscoveryHint}>
            <Stack gap="sm" mt="md">
              <Text size="sm">{m.discoveryBody}</Text>
              <Group>
                <Button onClick={() => discover.mutate()} loading={discover.isPending}>
                  {m.discover}
                </Button>
                <Button variant="default" disabled={!discover.data && !(boards.data?.total ?? 0)} onClick={() => setStep(2)}>
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
                  onClick={() => select.mutate(chosen.map(Number), { onSuccess: () => setStep(3) })}
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
                <Button variant="default" disabled={!collected} onClick={() => setStep(4)}>
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
                <Button component={Link} to="/presentation" onClick={() => setStep(5)}>
                  {m.openDeck}
                </Button>
                <Button variant="default" onClick={() => (setStep(5), navigate('/'))}>
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
