import { Anchor, Button, Group, MultiSelect, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, TagsInput, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useBoardDetail, useBoards, usePeople, useSaveBoardSettings } from '../../api/hooks';
import type { BoardSettings } from '../../api/types';
import { currentLocale, useT, type Messages } from '../../i18n';
import { useFilters } from '../../lib/filters';
import { TIMEZONES, weekdays } from '../../lib/format';
import { ErrorState, Loading, useConfirm } from '../common';

/** The confirmation asked before unsaved profile edits are thrown away; read at use time. */
export const discardDialog = (m: Messages['tracking']['settings']) => ({
  title: m.discardTitle,
  body: m.discardBody,
  confirmLabel: m.discardLabel,
});

/**
 * The board's own profile. It reads and writes its own ``perfil`` parameter (not the shared ``board`` filter,
 * which the flow page uses), and it keeps the edits: a board or tab change asks first, and the save
 * bar says how many changes are waiting.
 */
export function ProfileTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
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
