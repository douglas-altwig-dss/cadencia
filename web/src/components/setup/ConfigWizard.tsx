import { Anchor, Badge, Box, Button, Checkbox, Collapse, Group, Paper, Progress, SimpleGrid, Stack, Stepper, Text, Title, UnstyledButton } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCheck, IconChevronDown, IconChevronRight, IconExternalLink, IconPlugConnected } from '@tabler/icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { useConfig, useImportEnv, useSaveConfig, useTestJiraDraft } from '../../api/hooks';
import type { ConfigField as Field, ConfigView } from '../../api/types';
import { announce } from '../Announcer';
import { ErrorState, Loading, Note } from '../common';
import { ConfigField, fieldText } from '../config/ConfigField';
import { JiraTestResult } from '../config/JiraTestResult';
import { useConfigDraft, type ConfigDraft } from '../config/useConfigDraft';
import { LOCALE_NAMES, isLocale, useT, type Messages } from '../../i18n';
import { fieldErrorOf, hourLabel, jiraTestBody } from '../../lib/config';
import { WIZARD_STEPS, fieldsOfStep, isRecommended, stepOfField, wizardLayout, type WizardStepId } from '../../lib/configWizard';
import { fmtNum, weekdays } from '../../lib/format';

const API_TOKEN_HELP = 'https://id.atlassian.com/manage-profile/security/api-tokens';

/** Steps the person may skip: nothing else depends on them. */
const OPTIONAL: ReadonlySet<WizardStepId> = new Set(['notifications', 'ai']);

/**
 * The configuration phase of `/setup`: the runtime settings of `GET /config` asked in order —
 * connection, calendar, collection, then the optional e-mail and AI — over one draft, reviewed and
 * saved with a single `PUT /config` at the end. Nothing is written before the last step; `onDone`
 * moves the setup on to its first run.
 */
export function ConfigWizard({ onDone }: { onDone: () => void }) {
  const config = useConfig();
  if (config.isLoading) return <Loading />;
  if (config.error || !config.data) return <ErrorState error={config.error} />;
  return <ConfigSteps view={config.data} onDone={onDone} />;
}

function ConfigSteps({ view, onDone }: { view: ConfigView; onDone: () => void }) {
  const t = useT();
  const m = t.config;
  const w = m.wizard;
  const phone = useMediaQuery('(max-width: 48em)') ?? false;

  const layout = useMemo(() => wizardLayout(view), [view]);
  const all = useMemo(() => view.groups.flatMap((group) => group.fields), [view]);
  const draft = useConfigDraft(all);
  const [active, setActive] = useState(0);
  const finished = active === WIZARD_STEPS.length;

  const test = useTestJiraDraft();
  const [passed, setPassed] = useState<string | null>(null);
  const save = useSaveConfig();
  const importEnv = useImportEnv();
  const [alsoImport, setAlsoImport] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fieldsAt = (index: number): Field[] => {
    const id = WIZARD_STEPS[index];
    return id && id !== 'review' ? fieldsOfStep(layout[id]) : [];
  };
  const hasLocalErrors = (index: number) => fieldsAt(index).some((field) => draft.localErrors[field.key]);

  // Step 1 is passed by a successful test of exactly what is in the form, or by a Jira that already
  // works and was not touched.
  const credential = layout.jira.main;
  const testBody = jiraTestBody(credential, draft.edits);
  const testKey = JSON.stringify(testBody);
  const credentialChanged = credential.some((field) => field.key in draft.changed);
  const tested = passed === testKey;
  const jiraReady = tested || (view.jira_configured && !credentialChanged);
  const runTest = () => test.mutate(testBody, { onSuccess: (result) => setPassed(result.ok ? testKey : null) });

  // A problem inside the collapsed area must not hide behind it.
  const advancedTrouble = layout.collection.advanced.some((field) => draft.serverErrors[field.key] || draft.localErrors[field.key]);
  useEffect(() => {
    if (advancedTrouble) setAdvancedOpen(true);
  }, [advancedTrouble]);

  const skip = (index: number) => {
    for (const field of fieldsAt(index)) draft.forget(field.key);
    setActive(index + 1);
  };

  const saving = save.isPending || importEnv.isPending;
  const submit = async () => {
    const values = draft.changed;
    try {
      if (alsoImport && view.importable.length) await importEnv.mutateAsync();
      if (Object.keys(values).length) await save.mutateAsync(values);
      draft.discard();
      setActive(WIZARD_STEPS.length);
      announce(w.done.title);
    } catch (error) {
      // A 400 naming a field goes under that field, on the step that asks for it.
      if (draft.takeError(error)) {
        const step = stepOfField(layout, fieldErrorOf(error)?.field ?? '');
        if (step >= 0) setActive(step);
      }
    }
  };
  const failure = save.error ?? importEnv.error;
  const generalError = failure && !(fieldErrorOf(failure) && all.some((field) => field.key === fieldErrorOf(failure)?.field)) ? failure : null;

  const grid = (list: Field[]) =>
    list.length > 0 && (
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" verticalSpacing="lg">
        {list.map((field) => (
          <ConfigField key={field.key} field={field} draft={draft} />
        ))}
      </SimpleGrid>
    );

  const header = (title: string, description?: string) => (
    <Stack gap={2}>
      <Title order={4}>{title}</Title>
      {description && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
    </Stack>
  );

  /** Back, then Skip on an optional step, then Next. */
  const footer = (index: number, { next, extra }: { next?: ReactNode; extra?: ReactNode } = {}) => (
    <Stack gap="xs">
      <Group justify="space-between" gap="sm" wrap="wrap" pt="sm">
        {index > 0 ? (
          <Button variant="default" onClick={() => setActive(index - 1)} disabled={saving}>
            {w.previous}
          </Button>
        ) : (
          <span />
        )}
        <Group gap="xs">
          {OPTIONAL.has(WIZARD_STEPS[index]) && (
            <Button variant="subtle" onClick={() => skip(index)}>
              {w.skip}
            </Button>
          )}
          {next ?? (
            <Button onClick={() => setActive(index + 1)} disabled={hasLocalErrors(index)}>
              {w.next}
            </Button>
          )}
        </Group>
      </Group>
      {extra}
    </Stack>
  );

  // Step 2's preview sentence, from the draft as it stands.
  const valueOf = (key: string) => {
    const field = all.find((candidate) => candidate.key === key);
    return field ? draft.value(field) : null;
  };
  const day = weekdays()[Number(valueOf('checkpoint_weekday'))];
  const hour = Number(valueOf('checkpoint_hour'));
  const zone = valueOf('timezone');
  const preview =
    day && Number.isInteger(hour) && hour >= 0 && hour < 24 && typeof zone === 'string' && zone ? w.calendar.preview(day, hourLabel(hour), zone) : null;

  const collectionFields = [...layout.collection.main, ...layout.collection.advanced];
  const offRecommended = collectionFields.filter((field) => !isRecommended(field, draft.value(field)));

  const aiSwitch = layout.ai.main.find((field) => field.key === 'ai_enabled');
  const aiOn = Boolean(aiSwitch && draft.value(aiSwitch));
  const aiRest = layout.ai.main.filter((field) => field !== aiSwitch);
  const aiShown = aiOn || aiRest.some((field) => draft.serverErrors[field.key]) ? aiRest : [];

  const stepLabel = (id: WizardStepId) => w.steps[id];

  return (
    <>
      <Text size="sm" c="dimmed" mb="sm">
        {w.subtitle}
      </Text>
      <Paper withBorder p={phone ? 'md' : 'lg'}>
        {phone && !finished && (
          // On a phone six step markers take a screen of their own; one line and a bar say the same.
          <Stack gap={6}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="sm" fw={600}>
                {stepLabel(WIZARD_STEPS[active]).label}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {w.stepOf(active + 1, WIZARD_STEPS.length)}
              </Text>
            </Group>
            <Progress value={((active + 1) / WIZARD_STEPS.length) * 100} size="sm" aria-label={w.stepOf(active + 1, WIZARD_STEPS.length)} />
          </Stack>
        )}
        <Stepper
          active={active}
          onStepClick={finished ? undefined : setActive}
          allowNextStepsSelect={false}
          size="sm"
          styles={phone ? { steps: { display: 'none' } } : undefined}
        >
          <Stepper.Step label={stepLabel('jira').label} description={phone ? undefined : stepLabel('jira').description}>
            <Stack gap="lg" mt="lg">
              {header(m.groups.jira.title, m.groups.jira.description)}
              {grid(layout.jira.main)}
              <Anchor href={API_TOKEN_HELP} target="_blank" rel="noreferrer" size="sm" style={{ alignSelf: 'flex-start' }}>
                <Group gap={4} wrap="nowrap" component="span">
                  {w.jira.tokenHelp}
                  <IconExternalLink size={14} aria-hidden />
                </Group>
              </Anchor>
              <Stack gap="sm">
                <Group gap="sm" wrap="wrap">
                  <Button variant={tested ? 'default' : 'filled'} leftSection={<IconPlugConnected size={16} />} onClick={runTest} loading={test.isPending}>
                    {m.connection.test}
                  </Button>
                  {tested && (
                    <Badge color="teal" variant="light" leftSection={<IconCheck size={12} />}>
                      {w.jira.tested}
                    </Badge>
                  )}
                </Group>
                <JiraTestResult result={test.data} error={test.error} />
                {!jiraReady && !test.data && (
                  <Text size="xs" c="dimmed">
                    {view.jira_configured ? w.jira.retest : w.jira.needsTest}
                  </Text>
                )}
                {view.jira_configured && !credentialChanged && !tested && (
                  <Text size="xs" c="dimmed">
                    {w.jira.alreadyConfigured}
                  </Text>
                )}
              </Stack>
              {footer(0, {
                next: (
                  <Button onClick={() => setActive(1)} disabled={!jiraReady || hasLocalErrors(0)}>
                    {w.next}
                  </Button>
                ),
                extra: !jiraReady && (
                  <Anchor component="button" type="button" size="xs" c="dimmed" onClick={() => setActive(1)} style={{ alignSelf: 'flex-end' }}>
                    {w.jira.continueUntested}
                  </Anchor>
                ),
              })}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={stepLabel('calendar').label} description={phone ? undefined : stepLabel('calendar').description}>
            <Stack gap="lg" mt="lg">
              {header(m.groups.calendar.title, m.groups.calendar.description)}
              {grid(layout.calendar.main)}
              {preview && (
                <Text size="sm" fw={500} role="status">
                  {preview}
                </Text>
              )}
              {layout.calendar.general.length > 0 && (
                <Stack gap="md" className="config-advanced">
                  {header(m.groups.general.title, m.groups.general.description)}
                  {grid(layout.calendar.general)}
                </Stack>
              )}
              {footer(1)}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={stepLabel('collection').label} description={phone ? undefined : stepLabel('collection').description}>
            <Stack gap="lg" mt="lg">
              {header(m.groups.collection.title, m.groups.collection.description)}
              <Note>
                {w.collection.recommended}
                {offRecommended.length > 0 && (
                  <>
                    {' '}
                    <Anchor
                      component="button"
                      type="button"
                      size="sm"
                      onClick={() => offRecommended.forEach((field) => draft.set(field.key, field.default))}
                    >
                      {w.collection.restore}
                    </Anchor>
                  </>
                )}
              </Note>
              {grid(layout.collection.main)}
              {layout.collection.advanced.length > 0 && (
                <Box className="config-advanced">
                  <UnstyledButton onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} className="config-advanced-toggle">
                    <Group gap={6} wrap="nowrap">
                      {advancedOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      <Text size="sm" fw={600}>
                        {m.connection.advanced}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {w.collection.advancedHint}
                      </Text>
                    </Group>
                  </UnstyledButton>
                  <Collapse expanded={advancedOpen}>
                    <Box pt="md">{grid(layout.collection.advanced)}</Box>
                  </Collapse>
                </Box>
              )}
              {footer(2)}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={stepLabel('notifications').label} description={phone ? undefined : stepLabel('notifications').description}>
            <Stack gap="lg" mt="lg">
              {header(m.groups.notifications.title, m.groups.notifications.description)}
              <Text size="xs" c="dimmed">
                {w.optional}
              </Text>
              {grid(fieldsOfStep(layout.notifications))}
              {footer(3)}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={stepLabel('ai').label} description={phone ? undefined : stepLabel('ai').description}>
            <Stack gap="lg" mt="lg">
              {header(m.groups.ai.title, m.groups.ai.description)}
              <Text size="xs" c="dimmed">
                {w.optional}
              </Text>
              {aiSwitch && grid([aiSwitch])}
              {aiOn && <Note>{m.ai.privacy}</Note>}
              {grid(aiShown)}
              {grid([...layout.ai.general, ...layout.ai.advanced])}
              {footer(4)}
            </Stack>
          </Stepper.Step>

          <Stepper.Step label={stepLabel('review').label} description={phone ? undefined : stepLabel('review').description}>
            <Stack gap="lg" mt="lg">
              {header(w.review.title, w.review.description)}
              {!draft.isDirty && (
                <Text size="sm" c="dimmed">
                  {w.review.nothingChanged}
                </Text>
              )}
              {(['jira', 'calendar', 'collection', 'notifications', 'ai'] as const).map((id) => (
                <ReviewGroup
                  key={id}
                  title={stepLabel(id).label}
                  fields={fieldsOfStep(layout[id])}
                  draft={draft}
                  onEdit={() => setActive(WIZARD_STEPS.indexOf(id))}
                />
              ))}
              {view.importable.length > 0 && (
                <Checkbox
                  checked={alsoImport}
                  onChange={(event) => setAlsoImport(event.currentTarget.checked)}
                  label={w.review.importEnv}
                  description={w.review.importEnvHint(view.importable.length)}
                />
              )}
              {generalError && <ErrorState error={generalError} title={w.review.notSaved} />}
              {footer(5, {
                next: (
                  <Button onClick={submit} loading={saving} disabled={!draft.valid}>
                    {w.review.save}
                  </Button>
                ),
              })}
            </Stack>
          </Stepper.Step>

          <Stepper.Completed>
            <Stack gap="md" mt="lg" align="flex-start">
              {header(w.done.title, w.done.body)}
              <Group gap="sm" wrap="wrap">
                <Button onClick={onDone}>{w.done.start}</Button>
                <Button component={Link} to="/settings" variant="default">
                  {w.done.settings}
                </Button>
              </Group>
            </Stack>
          </Stepper.Completed>
        </Stepper>
      </Paper>
    </>
  );
}

/** How a value reads in the review: words for switches, days and languages; a secret only by its fate. */
function reviewValue(field: Field, draft: ConfigDraft, m: Messages['config']): string {
  const r = m.wizard.review;
  if (field.kind === 'secret') {
    const state = draft.secretState(field);
    return state === 'replace' ? r.secretNew : state === 'remove' ? r.secretRemove : state === 'kept' ? r.secretKept : r.notSet;
  }
  const value = draft.value(field);
  if (field.kind === 'bool') return value ? r.on : r.off;
  if (value === null || value === '') return r.notSet;
  if (field.kind === 'weekday') return weekdays()[Number(value)] ?? String(value);
  if (field.kind === 'hour') return hourLabel(Number(value));
  if (field.kind === 'locale') {
    const text = String(value);
    return isLocale(text) ? LOCALE_NAMES[text] : text;
  }
  if (typeof value === 'number') return fmtNum(value, 2);
  return String(value);
}

function ReviewGroup({ title, fields, draft, onEdit }: { title: string; fields: Field[]; draft: ConfigDraft; onEdit: () => void }) {
  const m = useT().config;
  const r = m.wizard.review;
  if (!fields.length) return null;
  return (
    <Stack gap={4}>
      <Group justify="space-between" gap="sm" wrap="nowrap">
        <Text fw={600}>{title}</Text>
        <Anchor component="button" type="button" size="sm" onClick={onEdit}>
          {r.edit}
        </Anchor>
      </Group>
      <Box component="dl" className="config-env">
        {fields.map((field) => {
          const changed = field.key in draft.changed;
          const text = reviewValue(field, draft, m);
          // Unchanged values keep the page's text colour so the review stays legible; only an
          // absent value is quiet, so "not set" still reads as a gap.
          const absent = text === r.notSet;
          return (
            <Box key={field.key} className="config-env-row">
              <Box component="dt">
                <Text size="sm" fw={500}>
                  {fieldText(m, field.key).label}
                </Text>
              </Box>
              <Box component="dd">
                <Group gap={6} wrap="nowrap" align="baseline">
                  <Text
                    size="sm"
                    fw={changed ? 600 : undefined}
                    c={absent && !changed ? 'dimmed' : undefined}
                    fs={absent && !changed ? 'italic' : undefined}
                    style={{ overflowWrap: 'anywhere', minWidth: 0 }}
                  >
                    {text}
                  </Text>
                  {changed && (
                    <Badge size="xs" color="petrol" variant="light" style={{ flexShrink: 0 }}>
                      {r.changed}
                    </Badge>
                  )}
                </Group>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}
