import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconBraces,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconEdit,
  IconPalette,
  IconPlugConnected,
  IconPlus,
  IconTrash,
  IconWorld,
} from '@tabler/icons-react';
import { useDebouncedValue } from '@mantine/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useAccessiblePalette,
  useClearVariableValue,
  useCreateVariable,
  useDeleteVariable,
  usePatchVariable,
  useSetVariableValue,
  useDeckPalette,
  useSaveDeckPalette,
  useVariables,
} from '../api/hooks';
import type {
  CatalogField,
  DeckBoard,
  DeckPalette,
  ManifestSlide,
  Variable,
  VariableScope,
  VariableValue,
} from '../api/types';
import { StatusLegend, StatusPalette } from '../components/StatusPalette';
import { FieldCatalog, FieldPicker } from './FieldCatalog';
import { collator, t as messages, useT } from '../i18n';
import { ErrorState, Loading, Note, useConfirm } from '../components/common';

/** Level names live in `deck.variables.scope`; `scopeShort` is the badge's shorter one. */
const bold = (text: string) => <b key={text}>{text}</b>;
/** Narrowest first: the order the value is looked for, and the order the table shows. */
const ORDER: VariableScope[] = ['slide', 'board', 'space', 'global'];

export const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

/** A space owns its boards, so a chosen space is a filter on them; no space means all of them. */
const boardsOfSpace = (boards: DeckBoard[], spaceKey: string | null) =>
  spaceKey ? boards.filter((board) => board.space_key === spaceKey) : boards;

/**
 * The same walk `repo.resolve_variables` does, narrowest first, so the UI can name *which* level
 * answered instead of only showing the text. `resolved` from the API carries the value alone.
 */
function winningValue(
  variable: Variable,
  target: { space: string | null; board: string | null; slide: string | null },
): VariableValue | null {
  const keys: Record<VariableScope, string | null> = {
    slide: target.slide,
    board: target.board,
    space: target.space,
    global: '',
  };
  for (const scope of ORDER) {
    const key = keys[scope];
    if (key === null) continue;
    const hit = variable.values.find((value) => value.scope === scope && value.scope_key === key);
    if (hit) return hit;
  }
  // The registration's own default is the last step of the same walk, and the last one there is.
  if (variable.default !== null) return { scope: 'global', scope_key: '', value: variable.default, updated_at: null };
  return null;
}

function Placeholder({ text }: { text: string }) {
  return (
    <CopyButton value={text}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? messages().deck.variables.copied : messages().deck.variables.copyMarker} withArrow>
          <Badge
            variant="light"
            className="mono"
            style={{ cursor: 'pointer', textTransform: 'none' }}
            rightSection={copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
            onClick={copy}
          >
            {text}
          </Badge>
        </Tooltip>
      )}
    </CopyButton>
  );
}

function VariableForm({
  initial,
  templateId,
  templateName,
  catalog,
  onClose,
}: {
  initial: Variable | null;
  templateId: number;
  templateName: string;
  catalog: CatalogField[];
  onClose: () => void;
}) {
  const t = useT();
  const vt = t.deck.variables;
  const create = useCreateVariable();
  const patch = usePatchVariable();
  const [name, setName] = useState(initial?.name ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [bound, setBound] = useState(initial ? initial.template_id !== null : false);
  const [hasDefault, setHasDefault] = useState(initial ? initial.default !== null : false);
  const [fallback, setFallback] = useState(initial?.default ?? '');
  const [source, setSource] = useState<string | null>(initial?.source_field ?? null);
  const [picking, setPicking] = useState(false);
  // RF-58: only kinds that fit in one run of text. A table or a chart is a shape of data, not
  // words, and the API refuses it anyway — offering it here would just be a dead end.
  const sourceable = catalog.filter(
    (f) => f.origin !== 'variavel' && (f.kind === 'text' || f.kind === 'number' || f.kind === 'status'),
  );
  const sourceSpec = source ? catalog.find((f) => f.key === source) : undefined;
  const finalName = slugify(name);
  const busy = create.isPending || patch.isPending;
  const error = create.error ?? patch.error;

  return (
    <Modal opened onClose={onClose} title={initial ? vt.editTitle : vt.newTitle} size="lg">
      <Stack gap="sm">
        <Group grow align="flex-start">
          <TextInput
            label={vt.name}
            description={finalName ? vt.usedAs(`{{texto.${finalName}}}`) : vt.nameHint}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label={vt.label}
            description={vt.labelHint}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </Group>
        <Textarea
          label={vt.description}
          description={vt.descriptionHint}
          autosize
          minRows={2}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <Switch
          label={vt.onlyTemplate(templateName)}
          description={vt.onlyTemplateHint}
          checked={bound}
          onChange={(event) => setBound(event.currentTarget.checked)}
        />
        <Divider label={vt.sourceDivider} labelPosition="left" />
        <Switch
          label={vt.readFromJira}
          description={vt.readFromJiraHint}
          checked={source !== null}
          onChange={(event) => {
            if (event.currentTarget.checked) setPicking(true);
            else setSource(null);
          }}
        />
        {source && (
          <Paper withBorder p={6}>
            <Group gap={6} wrap="nowrap" justify="space-between">
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" fw={600} lineClamp={1}>
                    {sourceSpec?.label ?? source}
                  </Text>
                  {sourceSpec && (
                    <Badge size="xs" variant="outline">
                      {t.deck.fieldCatalog.kinds[sourceSpec.kind]}
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed" className="mono" lineClamp={1}>
                  {source}
                </Text>
              </Stack>
              <Button size="compact-xs" variant="subtle" onClick={() => setPicking(true)}>
                {vt.change}
              </Button>
            </Group>
          </Paper>
        )}
        <FieldPicker
          opened={picking}
          fields={sourceable}
          value={source}
          onPick={setSource}
          onClose={() => setPicking(false)}
        />
        <Switch
          label={vt.hasDefault}
          description={source ? vt.hasDefaultSourceHint : vt.hasDefaultHint}
          checked={hasDefault}
          onChange={(event) => setHasDefault(event.currentTarget.checked)}
        />
        {hasDefault && (
          <Textarea
            label={vt.registryDefault}
            description={vt.registryDefaultHint}
            autosize
            minRows={2}
            value={fallback}
            onChange={(event) => setFallback(event.currentTarget.value)}
          />
        )}
        {error && <ErrorState error={error} title={vt.notSaved} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {vt.cancel}
          </Button>
          <Button
            disabled={!finalName}
            loading={busy}
            onClick={() => {
              const body = { name: finalName, label, description };
              if (initial) {
                patch.mutate(
                  {
                    id: initial.id,
                    ...body,
                    ...(bound ? { template_id: templateId } : { detach: true }),
                    // `default: null` would read as "leave it alone", so removing one is its own flag.
                    ...(hasDefault ? { default: fallback } : { clear_default: true }),
                    ...(source ? { source_field: source } : { clear_source: true }),
                  },
                  { onSuccess: onClose },
                );
              } else {
                create.mutate(
                  {
                    ...body,
                    template_id: bound ? templateId : null,
                    default: hasDefault ? fallback : null,
                    source_field: source,
                  },
                  { onSuccess: onClose },
                );
              }
            }}
          >
            {vt.save}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Set, change or clear one value of one variable at one scope. */
function ValueEditor({
  variable,
  initialScope,
  spaces,
  boards,
  slides,
  onClose,
}: {
  variable: Variable;
  initialScope: VariableScope;
  spaces: { key: string; name: string }[];
  boards: DeckBoard[];
  slides: ManifestSlide[];
  onClose: () => void;
}) {
  const t = useT();
  const vt = t.deck.variables;
  const save = useSetVariableValue();
  const [scope, setScope] = useState<VariableScope>(initialScope);
  const [key, setKey] = useState(() => {
    if (initialScope === 'space') return spaces[0]?.key ?? '';
    if (initialScope === 'board') return boards[0] ? String(boards[0].id) : '';
    if (initialScope === 'slide') return slides[0] ? String(slides[0].slide_id) : '';
    return '';
  });
  const [value, setValue] = useState('');

  const flat: Record<VariableScope, { value: string; label: string }[]> = {
    global: [],
    space: spaces.map((s) => ({ value: s.key, label: s.name })),
    board: boards.map((b) => ({ value: String(b.id), label: b.name })),
    slide: slides.map((s) => ({
      value: String(s.slide_id),
      label: `${s.index}. ${s.headline || s.layout}`,
    })),
  };
  // No space is chosen here, so the hierarchy is shown rather than filtered: the boards are
  // grouped under the space that owns them.
  const boardGroups = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const board of boards) {
      const group = board.space_name || board.space_key || vt.noSpace;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push({ value: String(board.id), label: board.name });
    }
    const compare = collator().compare;
    return [...groups]
      .sort((a, b) => compare(a[0], b[0]))
      .map(([group, items]) => ({ group, items }));
  }, [boards, vt]);

  const needsKey = scope !== 'global';
  const existing = variable.values.find((v) => v.scope === scope && v.scope_key === (needsKey ? key : ''));

  return (
    <Modal opened onClose={onClose} title={vt.valueOf(variable.placeholder)} size="lg">
      <Stack gap="sm">
        <Group grow align="flex-start">
          <Select
            label={vt.level}
            description={vt.levelHint}
            data={ORDER.map((s) => ({ value: s, label: vt.scope[s] }))}
            value={scope}
            onChange={(next) => {
              if (!next) return;
              const chosen = next as VariableScope;
              setScope(chosen);
              setKey(flat[chosen][0]?.value ?? '');
              setValue('');
            }}
            allowDeselect={false}
          />
          {needsKey && (
            <Select
              label={vt.scope[scope]}
              data={scope === 'board' ? boardGroups : flat[scope]}
              value={key}
              onChange={(next) => {
                setKey(next ?? '');
                setValue('');
              }}
              searchable
              error={!key ? vt.chooseTarget : undefined}
            />
          )}
        </Group>
        {!needsKey && (
          <Text size="xs" c="dimmed">
            {vt.defaultAppliesTo}
          </Text>
        )}
        <Textarea
          label={vt.text}
          autosize
          minRows={4}
          maxRows={14}
          value={value || existing?.value || ''}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        {existing && (
          <Text size="xs" c="dimmed">
            {vt.alreadySet}
          </Text>
        )}
        {save.error && <ErrorState error={save.error} title={vt.valueNotSaved} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {vt.cancel}
          </Button>
          <Button
            disabled={needsKey && !key}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { id: variable.id, scope, scope_key: needsKey ? key : '', value: value || existing?.value || '' },
                { onSuccess: onClose },
              )
            }
          >
            {vt.save}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * RF-52: variables as things of their own, not an appendix of the space.
 *
 * A variable is a name; what it says depends on where the slide is being filled. The preview at
 * the top answers that question out loud — pick a space, a board and a slide, and every variable
 * shows the value that target will actually get, from the narrowest scope that has one. A space
 * owns its boards, so choosing one narrows the board picker to that space's boards. With nothing
 * chosen the answer is the **padrão** value, the global one every target falls back to.
 */

/**
 * RF-62 / M16: the shared status palette, edited in place. Changes go to a local draft at once and
 * are saved after a short pause, so typing a colour is one save rather than one per keystroke.
 * "Sugerir" only shows the suggestion, with its legend, until it is applied.
 */
function SharedPalette({ server }: { server: DeckPalette }) {
  const t = useT();
  const pt = t.deck.palette;
  const savePalette = useSaveDeckPalette();
  const accessiblePalette = useAccessiblePalette();
  const [local, setLocal] = useState(server);
  const [settled] = useDebouncedValue(local, 600);
  const [suggestion, setSuggestion] = useState<Record<string, string> | null>(null);
  const saved = useRef(server);
  useEffect(() => {
    if (settled === saved.current) return;
    saved.current = settled;
    savePalette.mutate({ palette: settled.palette, status_labels: settled.status_labels });
    // mutate changes identity every render; depending on it would resend the same palette.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled]);

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {pt.colorblindHint}
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          loading={accessiblePalette.isFetching}
          onClick={() => accessiblePalette.refetch().then((r) => r.data && setSuggestion(r.data.palette))}
        >
          {pt.suggest}
        </Button>
      </Group>
      {suggestion && (
        <Paper withBorder p="sm">
          <Stack gap="xs">
            <Text size="xs" fw={600}>
              {pt.suggestionTitle}
            </Text>
            <StatusLegend palette={suggestion} labels={local.status_labels} />
            <Group gap="xs">
              <Button
                size="compact-xs"
                onClick={() => {
                  setLocal((l) => ({ ...l, palette: suggestion }));
                  setSuggestion(null);
                }}
              >
                {pt.apply}
              </Button>
              <Button size="compact-xs" variant="subtle" onClick={() => setSuggestion(null)}>
                {pt.discard}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
      <StatusPalette
        palette={local.palette}
        labels={local.status_labels}
        onChange={(next) =>
          setLocal((l) => ({
            ...l,
            palette: next.palette ?? l.palette,
            status_labels: next.status_labels ?? l.status_labels,
          }))
        }
        columns={2}
      />
      <Divider my="xs" />
      <Text size="xs" fw={600}>
        {pt.howItLooks}
      </Text>
      <StatusLegend palette={local.palette} labels={local.status_labels} />
      {savePalette.error && <ErrorState error={savePalette.error} title={pt.notSaved} />}
    </Stack>
  );
}

export function VariablesDrawer({
  templateId,
  templateName,
  boards,
  slides,
}: {
  templateId: number;
  templateName: string;
  boards: DeckBoard[];
  slides: ManifestSlide[];
}) {
  const t = useT();
  const vt = t.deck.variables;
  const spaces = useMemo(() => {
    const seen = new Map<string, string>();
    for (const board of boards) if (board.space_key) seen.set(board.space_key, board.space_name || board.space_key);
    const compare = collator().compare;
    return [...seen].map(([key, name]) => ({ key, name })).sort((a, b) => compare(a.name, b.name));
  }, [boards]);

  const [space, setSpace] = useState<string | null>(spaces[0]?.key ?? null);
  const [board, setBoard] = useState<string | null>(null);
  const [slide, setSlide] = useState<string | null>(null);
  const spaceBoards = useMemo(() => boardsOfSpace(boards, space), [boards, space]);
  const variables = useVariables({
    templateId,
    spaceKey: space,
    boardId: board ? Number(board) : null,
    slideId: slide ? Number(slide) : null,
  });
  const palette = useDeckPalette();
  const remove = useDeleteVariable();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const clear = useClearVariableValue();
  const [editing, setEditing] = useState<Variable | null | undefined>(undefined);
  const [valuing, setValuing] = useState<{ variable: Variable; scope: VariableScope } | null>(null);

  /** A board belongs to one space, so a space that no longer owns it drops the selection. */
  const chooseSpace = (next: string | null) => {
    setSpace(next);
    if (board && !boardsOfSpace(boards, next).some((b) => String(b.id) === board)) setBoard(null);
  };

  if (variables.isLoading) return <Loading rows={4} />;
  if (variables.error) return <ErrorState error={variables.error} />;
  const data = variables.data!;
  const target = { space, board, slide };

  const targetLabel = (scope: VariableScope, key: string) => {
    if (scope === 'global') return vt.anyTarget;
    if (scope === 'space') return spaces.find((s) => s.key === key)?.name ?? key;
    if (scope === 'board') return boards.find((b) => String(b.id) === key)?.name ?? vt.boardRef(key);
    const found = slides.find((s) => String(s.slide_id) === key);
    return vt.slideRef(found ? String(found.index) : key);
  };

  const conflicts = data.conflicts ?? [];
  const fromSource = new Set(data.from_source ?? []);

  return (
    <Tabs defaultValue="variaveis" keepMounted={false}>
      {confirmDialog}
      <Tabs.List mb="sm">
        <Tabs.Tab value="variaveis" leftSection={<IconBraces size={14} />}>
          {vt.tabVariables}
        </Tabs.Tab>
        <Tabs.Tab
          value="campos"
          leftSection={<IconDatabase size={14} />}
          rightSection={
            <Badge size="xs" variant="light" circle>
              {data.catalog?.length ?? 0}
            </Badge>
          }
        >
          {vt.tabFields}
        </Tabs.Tab>
        <Tabs.Tab value="cores" leftSection={<IconPalette size={14} />}>
          {vt.tabColors}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="cores">
        <Stack gap="sm">
          <Note title={vt.colorsNoteTitle}>
            {vt.colorsNote}
          </Note>
          {palette.data && <SharedPalette server={palette.data} />}
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="campos">
        <Stack gap="sm">
          <Note title={vt.fieldsNoteTitle}>
            {vt.fieldsNote(bold)}
          </Note>
          <FieldCatalog fields={data.catalog ?? []} />
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="variaveis">
    <Stack gap="md">
      {conflicts.length > 0 && (
        <Alert variant="light" color="yellow" title={vt.conflictsTitle}>
          <Stack gap={2}>
            {conflicts.map((conflict) => (
              <Text key={`${conflict.kind}:${conflict.name}`} size="xs">
                {conflict.message}
              </Text>
            ))}
          </Stack>
        </Alert>
      )}
      <Note title={vt.howTitle}>
        {vt.how(<span key="m" className="mono">{'{{texto.nome}}'}</span>, bold)}
      </Note>

      <Paper withBorder p="sm">
        <Text size="xs" fw={600} mb="xs">
          {vt.previewIn}
        </Text>
        <Group grow align="flex-start">
          <Select
            label={vt.space}
            placeholder={vt.spaceNone}
            data={spaces.map((s) => ({ value: s.key, label: s.name }))}
            value={space}
            onChange={chooseSpace}
            clearable
            searchable
          />
          <Select
            label={vt.board}
            placeholder={space ? vt.anyBoardOfSpace : vt.any}
            description={space ? vt.inChosenSpace(spaceBoards.length) : undefined}
            data={spaceBoards.map((b) => ({ value: String(b.id), label: b.name }))}
            value={board}
            onChange={setBoard}
            clearable
            searchable
          />
          <Select
            label={vt.slide}
            placeholder={vt.any}
            data={slides.map((s) => ({ value: String(s.slide_id), label: `${s.index}. ${s.headline || s.layout}` }))}
            value={slide}
            onChange={setSlide}
            clearable
            searchable
          />
        </Group>
        {!space && !board && !slide && (
          <Text size="xs" c="dimmed" mt={6}>
            {vt.noTarget}
          </Text>
        )}
      </Paper>

      <Group justify="space-between">
        <Title order={5}>{vt.tabVariables}</Title>
        <Button size="compact-sm" leftSection={<IconPlus size={15} />} onClick={() => setEditing(null)}>
          {vt.newTitle}
        </Button>
      </Group>

      {data.items.length === 0 ? (
        <Alert variant="light" color="petrol" title={vt.emptyTitle}>
          {vt.emptyBody(<span key="e" className="mono">definicao</span>)}
        </Alert>
      ) : (
        <Stack gap="md">
          {data.items.map((variable) => {
            const winner = winningValue(variable, target);
            const globalValue = variable.values.find((v) => v.scope === 'global');
            const rest = [...variable.values]
              .filter((v) => v.scope !== 'global')
              .sort((a, b) => ORDER.indexOf(a.scope) - ORDER.indexOf(b.scope));
            return (
              <Paper key={variable.id} withBorder p="sm">
                <Group justify="space-between" wrap="wrap" mb={6}>
                  <Group gap="xs">
                    <Placeholder text={variable.placeholder} />
                    <Text size="sm">{variable.label}</Text>
                    {variable.template_id !== null && (
                      <Tooltip label={vt.onlyInTemplate(templateName)}>
                        <Badge size="xs" color="petrol" variant="filled">
                          {vt.thisTemplate}
                        </Badge>
                      </Tooltip>
                    )}
                    {/* RF-59: the kind is what decides which areas this variable can fill, so it
                        sits next to the name rather than inside the edit form. */}
                    <Badge size="xs" variant="outline" color={variable.kind === 'text' ? 'gray' : 'petrol'}>
                      {t.deck.fieldCatalog.kinds[variable.kind]}
                    </Badge>
                    {variable.source_field && (
                      <Tooltip
                        label={
                          variable.kind === 'text'
                            ? vt.readsFromText(variable.source_field)
                            : vt.readsFromTyped(variable.source_field)
                        }
                      >
                        <Badge size="xs" color="teal" variant="light" leftSection={<IconPlugConnected size={9} />}>
                          {variable.source_field}
                        </Badge>
                      </Tooltip>
                    )}
                    {variable.kind === 'text' && !globalValue && variable.default === null && !variable.source_field && (
                      <Tooltip label={vt.noDefaultTip}>
                        <Badge size="xs" color="red" variant="light">
                          {vt.noDefault}
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>
                  <Group gap={2}>
                    {variable.kind === 'text' && (
                      <>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          leftSection={<IconWorld size={12} />}
                          onClick={() => setValuing({ variable, scope: 'global' })}
                        >
                          {vt.defaultValue}
                        </Button>
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          leftSection={<IconPlus size={12} />}
                          onClick={() => setValuing({ variable, scope: 'space' })}
                        >
                          {vt.setValue}
                        </Button>
                      </>
                    )}
                    <ActionIcon variant="subtle" aria-label={vt.editNamed(variable.name)} onClick={() => setEditing(variable)}>
                      <IconEdit size={15} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={vt.deleteNamed(variable.name)}
                      loading={remove.isPending}
                      onClick={async () => {
                        // Without the variable a deck that uses it is refused until it is filled in again (RF-45).
                        if (
                          await confirm({
                            title: vt.deleteTitle(variable.name),
                            body: vt.deleteBody,
                            confirmLabel: vt.deleteConfirm,
                          })
                        )
                          remove.mutate(variable.id);
                      }}
                    >
                      <IconTrash size={15} />
                    </ActionIcon>
                  </Group>
                </Group>
                {variable.description && (
                  <Text size="xs" c="dimmed" mb={6}>
                    {variable.description}
                  </Text>
                )}
                <Paper withBorder p={6} mb={6} bg="var(--mantine-color-default-hover)">
                  <Group gap={6} mb={2}>
                    <Text size="xs" c="dimmed">
                      {vt.atTarget}
                    </Text>
                    {fromSource.has(variable.name) ? (
                      <Badge size="xs" color="teal" variant="outline">
                        {vt.fromJira(variable.source_field ?? '')}
                      </Badge>
                    ) : (
                      winner && (
                        <Badge size="xs" variant="outline">
                          {vt.fromLevel(vt.scopeShort[winner.scope])}
                        </Badge>
                      )
                    )}
                  </Group>
                  {data.resolved[variable.name] ? (
                    <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                      {data.resolved[variable.name]}
                    </Text>
                  ) : variable.source_field && !board ? (
                    <Badge size="sm" color="teal" variant="light">
                      {vt.chooseBoard(variable.source_field)}
                    </Badge>
                  ) : (
                    <Badge size="sm" color="yellow" variant="light">
                      {vt.noValueReaches}
                    </Badge>
                  )}
                </Paper>
                {variable.kind !== 'text' ? (
                  <Text size="xs" c="dimmed">
                    {vt.typedNote(<span key="s" className="mono">{variable.source_field}</span>)}
                  </Text>
                ) : (
                <Table verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={150}>{vt.level}</Table.Th>
                      <Table.Th w={180}>{vt.target}</Table.Th>
                      <Table.Th>{vt.text}</Table.Th>
                      <Table.Th w={40} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rest.map((entry) => (
                      <Table.Tr key={`${entry.scope}:${entry.scope_key}`}>
                        <Table.Td>
                          <Badge size="xs" variant="outline">
                            {vt.scope[entry.scope]}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs">{targetLabel(entry.scope, entry.scope_key)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" lineClamp={2} style={{ whiteSpace: 'pre-wrap' }}>
                            {entry.value}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            aria-label={vt.removeValue(vt.scope[entry.scope])}
                            onClick={() =>
                              clear.mutate({ id: variable.id, scope: entry.scope, scope_key: entry.scope_key })
                            }
                          >
                            <IconTrash size={13} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                    {/* The widest level is always shown, set or not: it is the one that saves every
                        target the builder never got around to filling in. */}
                    <Table.Tr>
                      <Table.Td>
                        <Badge size="xs" variant="light">
                          {vt.scope.global}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="xs">{vt.anyTarget}</Text>
                      </Table.Td>
                      <Table.Td>
                        {globalValue ? (
                          <Text size="xs" lineClamp={2} style={{ whiteSpace: 'pre-wrap' }}>
                            {globalValue.value}
                          </Text>
                        ) : variable.default !== null ? (
                          <Group gap={6} wrap="nowrap">
                            <Badge size="xs" variant="outline" color="gray">
                              {vt.fromRegistry}
                            </Badge>
                            <Text size="xs" lineClamp={2} style={{ whiteSpace: 'pre-wrap' }}>
                              {variable.default || vt.empty}
                            </Text>
                          </Group>
                        ) : (
                          <Button
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => setValuing({ variable, scope: 'global' })}
                          >
                            {vt.setDefault}
                          </Button>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {globalValue && (
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            aria-label={vt.removeValue(vt.scope.global)}
                            onClick={() => clear.mutate({ id: variable.id, scope: 'global', scope_key: '' })}
                          >
                            <IconTrash size={13} />
                          </ActionIcon>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
                )}
              </Paper>
            );
          })}
        </Stack>
      )}

      {editing !== undefined && (
        <VariableForm
          initial={editing}
          templateId={templateId}
          templateName={templateName}
          catalog={data.catalog ?? []}
          onClose={() => setEditing(undefined)}
        />
      )}
      {valuing && (
        <ValueEditor
          variable={valuing.variable}
          initialScope={valuing.scope}
          spaces={spaces}
          boards={boards}
          slides={slides}
          onClose={() => setValuing(null)}
        />
      )}
    </Stack>
      </Tabs.Panel>
    </Tabs>
  );
}
