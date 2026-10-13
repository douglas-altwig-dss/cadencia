import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Pagination,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useDebouncedValue } from '@mantine/hooks';
import { IconCheck, IconPlugConnected, IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';

import {
  useBoardDetail,
  useBoards,
  useConnectionTest,
  useDiscovery,
  useFields,
  useHealth,
  usePeople,
  useSaveBoardSettings,
  useSaveOverrides,
  useSaveSelection,
} from '../api/hooks';
import type { BoardSettings, FieldMap } from '../api/types';
import { ErrorState, Loading, Note, PageHeader, useConfirm } from '../components/common';
import { NotificationsSettings } from '../components/NotificationsSettings';
import { PlanParametersSettings } from '../components/PlanParametersSettings';
import { currentLocale, useT, type Messages } from '../i18n';
import { useFilters } from '../lib/filters';
import { TIMEZONES, fromNow, weekdays } from '../lib/format';

function ConnectionTab() {
  const health = useHealth();
  const test = useConnectionTest();
  const discovery = useDiscovery();
  const m = useT().tracking.settings.connection;
  return (
    <Stack gap="md" maw={760}>
      <Note>
        {m.noteBefore} <code>CADENCIA_JIRA_*</code> {m.noteMid} <code>secrets/jira_api_token</code> {m.noteAfter}
      </Note>
      <Paper withBorder p="md">
        <Stack gap="xs">
          <Text size="sm">
            {m.instance} <b>{health.data?.jira_base_url ?? m.notConfigured}</b>
            {m.dbAndTz(health.data?.database ?? '—', health.data?.timezone ?? '—')}
          </Text>
          <Group>
            <Button leftSection={<IconPlugConnected size={16} />} onClick={() => test.mutate()} loading={test.isPending} disabled={!health.data?.jira_configured}>
              {m.test}
            </Button>
            <Button variant="default" onClick={() => discovery.mutate()} loading={discovery.isPending} disabled={!health.data?.jira_configured}>
              {m.discover}
            </Button>
          </Group>
          {test.error && <ErrorState error={test.error} />}
          {test.data?.ok && (
            <Alert color="teal" variant="light" icon={<IconCheck size={18} />} title={m.connected}>
              {m.authenticatedAs(
                test.data.identity?.name ?? '',
                test.data.identity?.email ?? test.data.identity?.account_id ?? '',
                Boolean(test.data.permissions?.BROWSE_PROJECTS),
              )}
            </Alert>
          )}
          {test.data && !test.data.ok && (
            <Alert color="red" variant="light" title={m.failed(String(test.data.error?.cause))}>
              {test.data.error?.message}
              <Text size="sm" fw={500} mt={4}>
                {m.whatToDo(String(test.data.error?.action))}
              </Text>
            </Alert>
          )}
          {discovery.error && <ErrorState error={discovery.error} />}
          {discovery.data && (
            <Alert color={discovery.data.missing_fields.length ? 'yellow' : 'teal'} variant="light" title={m.discoveryDone}>
              {m.discoveryFound(discovery.data.boards.length, discovery.data.statuses.length)}{' '}
              {discovery.data.missing_fields.length ? m.missingFields(discovery.data.missing_fields.join(', ')) : m.allFound}
            </Alert>
          )}
        </Stack>
      </Paper>
      <Text size="xs" c="dimmed">
        {m.fromScratchBefore} <Anchor component={Link} to="/inicio">{m.guideLink}</Anchor> {m.fromScratchAfter}
      </Text>
    </Stack>
  );
}

function BoardsTab() {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const boards = useBoards(debounced, page, 25);
  const selectedNow = useBoards('', 1, 500, true);
  const save = useSaveSelection();
  const [draft, setDraft] = useState<Set<number> | null>(null);
  const m = useT().tracking.settings.boards;

  useEffect(() => {
    if (selectedNow.data && draft === null) setDraft(new Set(selectedNow.data.items.map((b) => b.id)));
  }, [selectedNow.data, draft]);
  useEffect(() => setPage(1), [debounced]);

  const toggle = (id: number) =>
    setDraft((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Stack gap="sm">
      <Group align="flex-end" justify="space-between" wrap="wrap">
        <TextInput
          label={m.search}
          leftSection={<IconSearch size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          w={320}
        />
        <Group>
          <Text size="sm">{m.selected(draft?.size ?? 0)}</Text>
          <Button
            onClick={() =>
              draft &&
              save.mutate([...draft], {
                onSuccess: () => notifications.show({ title: m.savedTitle, message: m.savedMessage }),
              })
            }
            loading={save.isPending}
            disabled={!draft}
          >
            {m.save}
          </Button>
        </Group>
      </Group>
      {save.error && <ErrorState error={save.error} title={m.notSaved} />}
      {boards.isLoading && <Loading />}
      {boards.error && <ErrorState error={boards.error} />}
      {boards.data && boards.data.total === 0 && (
        <Text size="sm" c="dimmed">
          {m.noneBefore} <code>cadencia discover</code>
          {m.noneAfter}
        </Text>
      )}
      {boards.data && boards.data.items.length > 0 && (
        <>
          <Table.ScrollContainer minWidth={700}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={40}>
                    <span className="sr-only">{m.track}</span>
                  </Table.Th>
                  <Table.Th>{m.colBoard}</Table.Th>
                  <Table.Th>{m.colType}</Table.Th>
                  <Table.Th>{m.colLastCollection}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              {boards.data.spaces.map((group) => (
                <Table.Tbody key={group.space.key ?? '__sem_espaco__'}>
                  <Table.Tr bg="var(--mantine-color-default-hover)">
                    <Table.Th colSpan={4} scope="colgroup">
                      <Group gap="xs" align="baseline">
                        <Text fw={600}>{group.space.name}</Text>
                        {group.space.key && (
                          <Text size="xs" c="dimmed" className="mono">
                            {group.space.key}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed" fw={400}>
                          {m.spaceLine(group.boards.length)}
                        </Text>
                      </Group>
                    </Table.Th>
                  </Table.Tr>
                  {group.boards.map((b) => (
                    <Table.Tr key={b.id}>
                      <Table.Td>
                        <Checkbox
                          checked={draft?.has(b.id) ?? false}
                          onChange={() => toggle(b.id)}
                          aria-label={m.trackAria(b.name, group.space.name)}
                        />
                      </Table.Td>
                      <Table.Td>{b.name}</Table.Td>
                      <Table.Td>{b.type}</Table.Td>
                      <Table.Td>{b.selected ? fromNow(b.last_success_at) : '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              ))}
            </Table>
          </Table.ScrollContainer>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {m.total(boards.data.total)}
            </Text>
            <Pagination total={Math.ceil(boards.data.total / boards.data.page_size)} value={page} onChange={setPage} size="sm" />
          </Group>
        </>
      )}
    </Stack>
  );
}

const FIELD_KEYS: (keyof FieldMap)[] = ['story_points', 'sprint', 'epic_link', 'flagged', 'rank'];

function FieldsTab() {
  const fields = useFields();
  const save = useSaveOverrides();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const m = useT().tracking.settings.fields;
  useEffect(() => {
    if (fields.data) {
      const o = fields.data.overrides;
      setDraft({
        story_points: (o.story_points ?? []).join(', '),
        sprint: o.sprint ?? '',
        epic_link: o.epic_link ?? '',
        flagged: o.flagged ?? '',
        rank: o.rank ?? '',
      });
    }
  }, [fields.data]);
  if (fields.isLoading) return <Loading />;
  if (fields.error) return <ErrorState error={fields.error} />;
  const data = fields.data!;
  const submit = () =>
    save.mutate(
      {
        story_points: draft.story_points ? draft.story_points.split(',').map((s) => s.trim()).filter(Boolean) : [],
        sprint: draft.sprint || null,
        epic_link: draft.epic_link || null,
        flagged: draft.flagged || null,
        rank: draft.rank || null,
      },
      { onSuccess: () => notifications.show({ title: m.savedTitle, message: m.savedMessage }) },
    );
  return (
    <Stack gap="sm" maw={900}>
      <Note>{m.note}</Note>
      {data.missing.length > 0 && (
        <Alert color="yellow" variant="light">
          {m.missing(data.missing.join(', '))}
        </Alert>
      )}
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{m.colField}</Table.Th>
            <Table.Th>{m.colDiscovered}</Table.Th>
            <Table.Th>{m.colOverride}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {FIELD_KEYS.map((key) => {
            const discovered = data.discovered[key];
            return (
              <Table.Tr key={key}>
                <Table.Td>{m.labels[key]}</Table.Td>
                <Table.Td className="mono">{Array.isArray(discovered) ? discovered.join(', ') || '—' : discovered ?? '—'}</Table.Td>
                <Table.Td>
                  <TextInput
                    aria-label={m.overrideAria(m.labels[key])}
                    placeholder="customfield_…"
                    value={draft[key] ?? ''}
                    onChange={(e) => setDraft({ ...draft, [key]: e.currentTarget.value })}
                  />
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Group>
        <Button onClick={() => submit()} loading={save.isPending}>
          {m.save}
        </Button>
        {save.error && <ErrorState error={save.error} title={m.notSaved} />}
      </Group>
    </Stack>
  );
}

/** The confirmation asked before unsaved profile edits are thrown away; read at use time. */
const discardDialog = (m: Messages['tracking']['settings']) => ({
  title: m.discardTitle,
  body: m.discardBody,
  confirmLabel: m.discardLabel,
});

/**
 * The board's own profile. It reads and writes its own ``perfil`` parameter (not the shared ``board`` filter,
 * which the flow page uses), and it keeps the edits: a board or tab change asks first, and the save
 * bar says how many changes are waiting.
 */
function ProfileTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const selected = useBoards('', 1, 500, true);
  const people = usePeople();
  const { get, set } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const boardId = get('perfil') ? Number(get('perfil')) : selected.data?.items[0]?.id;
  const detail = useBoardDetail(boardId);
  const save = useSaveBoardSettings(boardId);
  const [draft, setDraft] = useState<BoardSettings | null>(null);
  const [affinityQuery, setAffinityQuery] = useState('');
  const settings = useT().tracking.settings;
  const m = settings.profile;
  useEffect(() => {
    if (detail.data) setDraft(detail.data.settings);
  }, [detail.data]);

  const peopleOptions = useMemo(() => (people.data?.items ?? []).map((p) => ({ value: p.account_id, label: p.name })), [people.data]);
  const columns = (detail.data?.columns ?? []).map((c) => c.name);

  // Only what differs from the saved profile is sent, and the count of it is what "não salvas" means.
  const changed = (): Partial<BoardSettings> => {
    if (!draft || !detail.data) return {};
    const original = detail.data.settings;
    return Object.fromEntries(
      (Object.keys(draft) as (keyof BoardSettings)[])
        .filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(original[k]))
        .map((k) => [k, draft[k]]),
    ) as Partial<BoardSettings>;
  };
  const pending = Object.keys(changed()).length;
  useEffect(() => onDirtyChange(pending > 0), [pending, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const switchBoard = async (value: string | null) => {
    if (!value) return;
    if (pending && !(await confirm(discardDialog(settings)))) return;
    set({ perfil: value });
  };

  if (selected.data && !selected.data.items.length) return <Text size="sm">{m.selectBoardsFirst}</Text>;
  if (detail.isLoading || !draft) return <Loading />;
  if (detail.error) return <ErrorState error={detail.error} />;

  const patch = <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]) => setDraft({ ...draft, [key]: value });
  const num = (value: string | number, fallback: number) => (value === '' ? fallback : Number(value));
  // The thresholds are stored as a fraction of the remaining capacity; people read them as a percentage of it.
  const percentOf = (fraction: number) => Math.round((1 + fraction) * 100);
  const fractionOf = (percent: number | string, fallback: number) => (percent === '' ? fallback : Number((Number(percent) / 100 - 1).toFixed(4)));
  const affinityPeople = (draft.members.length ? draft.members : peopleOptions.map((p) => p.value))
    .map((account) => ({ account, label: peopleOptions.find((p) => p.value === account)?.label ?? account }))
    .filter((p) => p.label.toLocaleLowerCase(currentLocale()).includes(affinityQuery.trim().toLocaleLowerCase(currentLocale())));

  return (
    <Stack gap="md" maw={1000}>
      <Select
        label={m.board}
        data={(selected.data?.items ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
        value={boardId ? String(boardId) : null}
        onChange={switchBoard}
        w={300}
        allowDeselect={false}
      />
      {detail.data!.overridden.length > 0 && (
        <Text size="xs" c="dimmed">
          {m.overridden(detail.data!.overridden.join(', '))}
        </Text>
      )}
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          {m.flowTitle}
        </Title>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <MultiSelect
            label={m.wipColumns}
            description={m.wipColumnsHint}
            data={columns}
            value={draft.wip_columns ?? []}
            onChange={(value) => patch('wip_columns', value.length ? value : null)}
          />
          <MultiSelect
            label={m.activeColumns}
            description={m.activeColumnsHint}
            data={columns}
            value={draft.active_columns ?? []}
            onChange={(value) => patch('active_columns', value.length ? value : null)}
          />
          <TagsInput label={m.blockedStatuses} value={draft.blocked_status_names} onChange={(value) => patch('blocked_status_names', value)} />
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          {m.checkpointTitle}
        </Title>
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <Select
            label={m.checkpointDay}
            data={weekdays().map((d, i) => ({ value: String(i), label: d }))}
            value={String(draft.checkpoint_weekday)}
            onChange={(value) => value && patch('checkpoint_weekday', Number(value))}
            allowDeselect={false}
          />
          <NumberInput label={m.checkpointHour} min={0} max={23} value={draft.checkpoint_hour} onChange={(v) => patch('checkpoint_hour', num(v, 18))} />
          <Select label={m.timezone} data={TIMEZONES} value={draft.timezone} onChange={(value) => value && patch('timezone', value)} searchable allowDeselect={false} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {m.defaultDuration}
            </Text>
            <SegmentedControl
              value={String(draft.default_sprint_weeks)}
              onChange={(value) => patch('default_sprint_weeks', Number(value))}
              data={[
                { value: '2', label: m.weeks(2) },
                { value: '3', label: m.weeks(3) },
              ]}
            />
          </Stack>
          <NumberInput
            label={m.stagnation}
            description={m.stagnationHint}
            min={1}
            max={6}
            value={draft.stagnation_checkpoints}
            onChange={(v) => patch('stagnation_checkpoints', num(v, 1))}
          />
          <NumberInput
            label={m.agingPercentile}
            description={m.agingPercentileHint}
            min={50}
            max={99}
            value={draft.aging_percentile}
            onChange={(v) => patch('aging_percentile', num(v, 85))}
          />
          <TagsInput
            label={m.holidays}
            value={draft.holidays}
            onChange={(value) => patch('holidays', value.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))}
          />
        </SimpleGrid>
      </Paper>
      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          {m.capacityTitle}
        </Title>
        <SimpleGrid cols={{ base: 1, md: 4 }}>
          <NumberInput
            label={m.hoursPerDay}
            description={m.hoursPerDayHint}
            min={1}
            max={12}
            value={draft.hours_per_day}
            onChange={(v) => patch('hours_per_day', num(v, 8))}
          />
          <NumberInput label={m.focusFactor} min={0.1} max={1} step={0.05} decimalScale={2} value={draft.focus_factor} onChange={(v) => patch('focus_factor', num(v, 0.7))} />
          <NumberInput label={m.hoursPerPoint} min={0.5} step={0.5} value={draft.hours_per_point} onChange={(v) => patch('hours_per_point', num(v, 4))} />
          <NumberInput label={m.unestimatedHours} min={1} value={draft.unestimated_item_hours} onChange={(v) => patch('unestimated_item_hours', num(v, 8))} />
          <NumberInput label={m.maxItems} min={1} value={draft.max_items_per_person} onChange={(v) => patch('max_items_per_person', num(v, 8))} />
          <Text size="xs" c="dimmed" style={{ gridColumn: '1 / -1' }}>
            {m.epicPlanNote}
          </Text>
          <NumberInput
            label={m.overload}
            description={m.thresholdHint}
            suffix={m.capacitySuffix}
            min={0}
            step={5}
            value={percentOf(draft.overload_threshold)}
            onChange={(v) => patch('overload_threshold', fractionOf(v, 0.1))}
          />
          <NumberInput
            label={m.idle}
            description={m.thresholdHint}
            suffix={m.capacitySuffix}
            min={0}
            step={5}
            value={percentOf(draft.idle_threshold)}
            onChange={(v) => patch('idle_threshold', fractionOf(v, -0.2))}
          />
          <MultiSelect
            label={m.members}
            description={m.membersHint}
            data={peopleOptions}
            value={draft.members}
            onChange={(value) => patch('members', value)}
            searchable
          />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="md">
          {m.personBefore}{' '}
          <Anchor component={Link} to="/pessoas" size="xs">
            {m.peopleLink}
          </Anchor>
          {m.personAfter}
        </Text>
        <Text size="sm" fw={500} mt="xs">
          {m.affinityTitle}
        </Text>
        <TextInput
          size="xs"
          mt={4}
          placeholder={m.affinitySearch}
          aria-label={m.affinitySearchAria}
          leftSection={<IconSearch size={12} />}
          value={affinityQuery}
          onChange={(e) => setAffinityQuery(e.currentTarget.value)}
          w={260}
        />
        <Stack gap={4} mt={4}>
          {affinityPeople.slice(0, 30).map(({ account, label }) => (
            <TagsInput
              key={account}
              label={label}
              value={draft.affinity[account] ?? []}
              onChange={(value) => patch('affinity', { ...draft.affinity, [account]: value })}
              size="xs"
            />
          ))}
        </Stack>
        {affinityPeople.length > 30 && (
          <Text size="xs" c="dimmed" mt={4}>
            {m.showing(30, affinityPeople.length)}
          </Text>
        )}
      </Paper>
      {/* A bar that stays at the foot of the form, so the save is in reach wherever the edit was made. */}
      <Paper withBorder p="sm" style={{ position: 'sticky', bottom: 8, zIndex: 2 }}>
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Text size="sm" c={pending ? undefined : 'dimmed'}>
            {pending ? m.unsaved(pending) : m.nothingToSave}
          </Text>
          <Group gap="sm">
            {save.error && <ErrorState error={save.error} title={m.notSaved} />}
            <Button
              disabled={!pending}
              loading={save.isPending}
              onClick={() => save.mutate(changed(), { onSuccess: () => notifications.show({ title: m.savedTitle, message: m.savedMessage }) })}
            >
              {m.save}
            </Button>
          </Group>
        </Group>
      </Paper>
      {confirmDialog}
    </Stack>
  );
}

export function SettingsPage() {
  const { get, set } = useFilters();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [profileDirty, setProfileDirty] = useState(false);
  const m = useT().tracking.settings;
  const tab = get('tab') ?? 'conexao';
  // Absences are the team's, so they live on Pessoas now; an old link lands there.
  if (tab === 'ausencias') return <Navigate to="/pessoas?ausencias=1" replace />;
  // Leaving a profile with unsaved edits asks first.
  const goTo = async (value: string | null) => {
    if (!value || value === tab) return;
    if (tab === 'perfil' && profileDirty && !(await confirm(discardDialog(m)))) return;
    set({ tab: value });
  };
  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} />
      <Tabs value={tab} onChange={goTo} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="conexao">{m.tabConnection}</Tabs.Tab>
          <Tabs.Tab value="boards">{m.tabBoards}</Tabs.Tab>
          <Tabs.Tab value="campos">{m.tabFields}</Tabs.Tab>
          <Tabs.Tab value="perfil">{m.tabProfile}</Tabs.Tab>
          <Tabs.Tab value="plano-epico">{m.tabEpicPlan}</Tabs.Tab>
          <Tabs.Tab value="notificacoes">{m.tabNotifications}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="notificacoes">
          <NotificationsSettings />
        </Tabs.Panel>
        <Tabs.Panel value="conexao">
          <ConnectionTab />
        </Tabs.Panel>
        <Tabs.Panel value="boards">
          <BoardsTab />
        </Tabs.Panel>
        <Tabs.Panel value="campos">
          <FieldsTab />
        </Tabs.Panel>
        <Tabs.Panel value="perfil">
          <ProfileTab onDirtyChange={setProfileDirty} />
        </Tabs.Panel>
        <Tabs.Panel value="plano-epico">
          <PlanParametersSettings />
        </Tabs.Panel>
      </Tabs>
      {confirmDialog}
    </>
  );
}
