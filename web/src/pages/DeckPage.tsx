import {
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  List,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TagsInput,
  Text,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedValue, useFullscreenElement, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import {
  IconAccessible,
  IconArrowLeft,
  IconChartBar,
  IconSparkles,
  IconStethoscope,
  IconArrowsDiff,
  IconEye,
  IconFileTypePdf,
  IconShare,
  IconAdjustments,
  IconBraces,
  IconDeviceFloppy,
  IconMaximize,
  IconDownload,
  IconHistory,
  IconKeyboard,
  IconMessage2,
  IconPlayerPlay,
  IconPresentation,
  IconRefresh,
  IconUpload,
  IconWand,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  useBoards,
  useCatalog,
  useDeckPalette,
  useGenerate,
  useReassociateRun,
  useRefreshTemplate,
  useRunScene,
  useRuns,
  useTemplateReadiness,
  useSaveMapping,
  useTemplate,
  useTemplates,
  useUploadTemplate,
  useVariables,
} from '../api/hooks';
import type {
  DeckMapping,
  ReportRun,
  TemplateDetail,
  ValidationItem,
} from '../api/types';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { recordPresentation, runFileUrl, usePartialRun } from '../api/deckHooks';
import {
  CompareModal,
  needsForce,
  PartialModal,
  PreviewModal,
  ReviewBadge,
  ReviewControls,
  RunA11y,
  RunDownloads,
  ShareModal,
} from '../components/deck/RunPanels';
import { NarrativePanel, TemplateA11yPanel, TemplateDiagnosticsPanel, TemplateUsagePanel } from '../components/deck/TemplatePanels';
import { TemplateGallery, UploadCard } from '../components/deck/TemplateGallery';
import { DeckViewer } from '../components/deck/DeckViewer';
import { ReadinessAlert } from '../components/deck/Readiness';
import { usePresentSlides } from '../components/deck/usePresentSlides';
import { QuestionsPanel } from '../components/deck/QuestionsPanel';
import { TemplateWizard } from '../components/deck/TemplateWizard';
import { VersionsDrawer } from './VersionsDrawer';
import { Empty, ErrorState, Loading, PageHeader } from '../components/common';
import { PresentMode } from '../components/PresentMode';
import { DeckEditorTab } from './DeckEditorTab';
import { TemplatesDrawer } from './TemplatesDrawer';
import { StatusPalette } from '../components/StatusPalette';
import { DeckTitleBar } from '../components/editor/DeckTitleBar';
import { type RibbonEntry, type RibbonGroup, type RibbonTab } from '../components/editor/Ribbon';
import { VariablesDrawer } from './VariablesDrawer';
import { useCommands, useRegisterCommands } from '../lib/commands';
import { useFilters } from '../lib/filters';
import { fmtDate, fmtDateTime, plural } from '../lib/format';
import { openShortcuts, typing } from '../lib/shortcuts';

type Drawer = 'gerar' | 'textos' | 'regras' | 'modelo' | 'versoes' | 'diagnostico' | 'acessibilidade' | 'uso' | 'narrativa';

/** M11: how long a pause in the mapping counts as "done", the same as the editor's own autosave. */
const MAPPING_AUTOSAVE_MS = 1200;

/** The suggestion is a mapping plus its explanation; the draft is the mapping without it. */
function fromSuggestion(suggestion: TemplateDetail['suggestion']): DeckMapping {
  const { notes: _notes, ...mapping } = suggestion;
  return mapping;
}

/**
 * RF-83: a validation problem as a link to its cause — the slide (and shape) it points at, or the
 * variable manager when a variable is what is missing. `produced` maps the output slide number back
 * to the template slide and board it came from, which is how the editor names slides.
 */
function fixLink(run: ReportRun, item: ValidationItem, onFix?: (fix: Fix) => void) {
  if (!onFix) return null;
  const produced = run.validation.produced?.find((p) => p.index === item.slide);
  const shape = item.target?.match(/\/sh(\d+)/)?.[1];
  const variable = item.field?.startsWith('texto.') ? item.field.slice(6) : null;
  return (
    <Group gap={6} display="inline-flex" ml={6}>
      {produced && (
        <Anchor size="xs" component="button" onClick={() => onFix({ slide: `${produced.origin_slide_id}:${produced.board_id ?? 0}:${produced.page}`, shape, run: run.id })}>
          abrir no editor
        </Anchor>
      )}
      {variable && (
        <Anchor size="xs" component="button" onClick={() => onFix({ variable })}>
          abrir Variáveis
        </Anchor>
      )}
    </Group>
  );
}

export interface Fix {
  slide?: string;
  shape?: string;
  run?: string;
  variable?: string;
}

interface RunContext {
  data: TemplateDetail;
  draft: DeckMapping;
  runs: ReportRun[];
}

function RunResult({
  run,
  onFix,
  context,
  onRun,
}: {
  run: ReportRun;
  onFix?: (fix: Fix) => void;
  context: RunContext;
  onRun?: (run: ReportRun) => void;
}) {
  const [presenting, setPresenting] = useState<number | null>(null);
  const [modal, setModal] = useState<null | 'share' | 'partial' | 'perguntas'>(null);
  // #27: "Atualizar números" swaps the deck on screen for a fresh one without leaving the room.
  const [refreshed, setRefreshed] = useState<ReportRun | null>(null);
  const refresh = usePartialRun();
  const shownRun = refreshed ?? run;
  const v = run.validation;
  // Also read for `template_deleted` (#12), so an orphaned run offers reassociation on sight
  // rather than only once someone opens the present-mode modal.
  const scene = useRunScene(shownRun.id);
  const reassociate = useReassociateRun(shownRun.id);
  const [reassociateWith, setReassociateWith] = useState<string | null>(null);
  const templates = useTemplates();
  // M15: the same slides the editor's "Apresentar a última geração" presents.
  const slides = usePresentSlides(shownRun, context.data, context.draft);
  const rasterUrls = (v.preview.images ?? []).map((path) => `/api/reports/runs/${shownRun.id}/files/${path.split('/').pop()}`);
  return (
    <Stack gap="xs">
      <Group gap="sm">
        <Badge color={run.status === 'ok' ? 'teal' : 'red'} variant="light">
          {run.status === 'ok' ? 'validação ok' : `validação com ${plural(v.errors.length, 'erro', 'erros')}`}
        </Badge>
        <Text size="sm">
          {v.slides} slides · referência {fmtDate(run.reference_at, true)}
          {run.audience ? ` · público ${run.audience}` : ''}
          {run.seconds != null ? ` · ${run.seconds.toFixed(1)} s` : ''}
        </Text>
      </Group>
      {scene.data?.template_deleted && (
        <Alert color="yellow" variant="light" title="O modelo original foi apagado">
          <Stack gap="xs">
            <Text size="sm">
              O arquivo desta geração continua íntegro, mas perdeu o tema e as marcações de campo
              vinculado, que vivem no modelo. Escolha um modelo reenviado para tentar recuperá-los
              — só ajuda quando os slides do modelo baterem com os desta geração.
            </Text>
            <Group gap="xs">
              <Select
                size="xs"
                placeholder="Escolher modelo"
                data={(templates.data?.items ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
                value={reassociateWith}
                onChange={setReassociateWith}
                w={240}
              />
              <Button
                size="compact-xs"
                disabled={!reassociateWith}
                loading={reassociate.isPending}
                onClick={() => reassociateWith && reassociate.mutate(Number(reassociateWith))}
              >
                Reassociar
              </Button>
            </Group>
            {reassociate.error && <ErrorState error={reassociate.error} title="Não reassociado" />}
          </Stack>
        </Alert>
      )}
      <Group gap="xs">
        <RunDownloads run={run} requireApproval={!!context.draft.require_approval} />
        <Button size="xs" variant="default" leftSection={<IconShare size={14} />} onClick={() => setModal('share')}>
          Compartilhar
        </Button>
        <Button size="xs" variant="default" leftSection={<IconMessage2 size={14} />} onClick={() => setModal('perguntas')}>
          Perguntas
        </Button>
        <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} onClick={() => setModal('partial')}>
          Regenerar parte
        </Button>
      </Group>
      <ReviewControls run={run} />
      {run.kind === 'parcial' && run.parent_run_id && (
        <Text size="xs" c="dimmed">
          Regeneração parcial de <span className="mono">{run.parent_run_id}</span>.
        </Text>
      )}
      <ShareModal run={run} opened={modal === 'share'} onClose={() => setModal(null)} />
      <Modal opened={modal === 'perguntas'} onClose={() => setModal(null)} title="Perguntas" size="md">
        <Box h={420}>
          <QuestionsPanel runId={run.id} />
        </Box>
      </Modal>
      <PartialModal
        run={run}
        slides={context.data.manifest.slides}
        boards={context.data.boards}
        opened={modal === 'partial'}
        onClose={() => setModal(null)}
        onDone={onRun}
      />
      {v.errors.length > 0 && (
        <Alert color="red" variant="light" title="Erros">
          <List size="sm">
            {v.errors.map((e, i) => (
              <List.Item key={i}>
                {e.message}
                {fixLink(run, e, onFix)}
              </List.Item>
            ))}
          </List>
        </Alert>
      )}
      {v.warnings.length > 0 && (
        <Alert color="yellow" variant="light" title="Avisos">
          <List size="sm">
            {v.warnings.map((w, i) => (
              <List.Item key={i}>
                {w.message}
                {fixLink(run, w, onFix)}
              </List.Item>
            ))}
          </List>
        </Alert>
      )}
      <Accordion variant="contained" chevronPosition="left">
        <Accordion.Item value="a11y">
          <Accordion.Control icon={<IconAccessible size={16} />}>
            <Text size="sm">Acessibilidade</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <RunA11y
              run={run}
              onOpen={(slide, shape) => {
                const produced = v.produced?.find((p) => p.index === slide);
                if (produced && onFix) onFix({ slide: `${produced.origin_slide_id}:${produced.board_id ?? 0}:${produced.page}`, shape: shape ?? undefined, run: run.id });
              }}
            />
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {run.delivery && run.delivery.length > 0 && (
        <Text size="xs" c="dimmed">
          Enviada para: {run.delivery.map((d) => `${d.name || d.kind} (${d.ok ? 'ok' : `falhou: ${d.error}`})`).join(' · ')}
        </Text>
      )}
      {v.info.map((line) => (
        <Text key={line} size="xs" c="dimmed">
          {line}
        </Text>
      ))}
      {v.preview.images && v.preview.images.length > 0 && (
        <Stack gap="xs">
          <Group>
            <Button size="xs" variant="light" leftSection={<IconPresentation size={14} />} onClick={() => setPresenting(0)}>
              Apresentar daqui
            </Button>
            <Text size="xs" c="dimmed">
              {v.preview.images.length} slides renderizados desta geração.
            </Text>
          </Group>
          {/* M13: the run is drawn by SlideStage, like the editor and the shared link; the rendered
              PNGs only stand in for the shapes the model cannot draw (charts). */}
          {scene.data ? (
            <DeckViewer scene={scene.data} raster={(index) => rasterUrls[index - 1]} />
          ) : (
            <Loading rows={2} />
          )}
          <PresentMode
            slides={slides}
            runId={shownRun.id}
            opened={presenting !== null}
            initial={presenting ?? 0}
            onClose={() => setPresenting(null)}
            refreshing={refresh.isPending}
            onRefresh={() => refresh.mutate({ runId: run.id, now: true }, { onSuccess: setRefreshed })}
            onFinish={(seconds) => void recordPresentation(shownRun.id, seconds).catch(() => undefined)}
          />
        </Stack>
      )}
    </Stack>
  );
}

function GenerateTab({
  templateId,
  onGenerated,
  onFix,
  data,
  draft,
  focus,
}: {
  templateId: number;
  onGenerated?: (runId: string) => void;
  onFix?: (fix: Fix) => void;
  data: TemplateDetail;
  draft: DeckMapping;
  /** Where a menu entry meant to land: opens the preview, or scrolls to the run history. A new
   * object each time (even for the same `kind`) is what makes clicking the same entry twice work. */
  focus?: { kind: 'previa' | 'historico'; at: number } | null;
}) {
  const boards = useBoards('', 1, 200, true);
  const generate = useGenerate();
  const runs = useRuns(templateId);
  // RF-70: the same report the editor marks thumbnails with (RF-66). Generation would refuse the
  // deck for these anyway; saying so *before* the button is pressed is the difference between a
  // check and a rejection.
  const readiness = useTemplateReadiness(templateId);
  const [reference, setReference] = useState<string | null>(null);
  // M14: the rules' boards and anonymise choice are the starting point; this run may change them.
  const [boardIds, setBoardIds] = useState<string[]>(draft.board_ids.map(String));
  const [anonymize, setAnonymize] = useState(!!draft.anonymize);
  const spaceKeys = draft.space_keys ?? [];
  const scopedBoards = (boards.data?.items ?? []).filter((b) => !spaceKeys.length || (b.space_key && spaceKeys.includes(b.space_key)));
  const [send, setSend] = useState(false);
  const [audience, setAudience] = useState<string | null>(null);
  /** The run on show: the one just generated, or one opened from the history or a partial redo. */
  const [shown, setShown] = useState<ReportRun | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [comparing, setComparing] = useState(false);
  const audiences = draft.audiences ?? [];
  const history = runs.data?.items ?? [];
  const context: RunContext = { data, draft, runs: history };
  // A mutation's result goes stale the moment it is reviewed or shared; the list is refetched.
  const current = shown ? (history.find((r) => r.id === shown.id) ?? shown) : null;
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'previa') setPreviewing(true);
    else historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Only the arrival of a fresh `focus` matters, not the callbacks it happens to close over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group align="flex-end" wrap="wrap">
          <DateInput label="Data de referência" placeholder="último checkpoint" value={reference} onChange={setReference} clearable valueFormat="DD/MM/YYYY" w={200} />
          <MultiSelect
            label="Boards"
            placeholder="do mapeamento ou todos os acompanhados"
            data={scopedBoards.map((b) => ({ value: String(b.id), label: b.name }))}
            value={boardIds}
            onChange={setBoardIds}
            w={320}
            clearable
          />
          <Switch label="Anonimizar nesta geração" checked={anonymize} onChange={(e) => setAnonymize(e.currentTarget.checked)} />
          {audiences.length > 0 && (
            <Select label="Público" placeholder="todos os slides" data={audiences} value={audience} onChange={setAudience} clearable w={180} />
          )}
          <Switch label="Enviar aos canais" checked={send} onChange={(e) => setSend(e.currentTarget.checked)} />
          <Button
            onClick={() =>
              generate.mutate({
                template_id: templateId,
                reference: reference ? `${reference}T23:59:59` : undefined,
                board_ids: boardIds.length ? boardIds.map(Number) : undefined,
                anonymize,
                notify: send,
                audience: audience ?? undefined,
              }, {
                onSuccess: (run) => {
                  setShown(run);
                  onGenerated?.(run.id);
                },
              })
            }
            loading={generate.isPending}
          >
            Gerar apresentação
          </Button>
          <Button variant="default" leftSection={<IconEye size={16} />} onClick={() => setPreviewing(true)}>
            Prévia de um board
          </Button>
        </Group>
      </Paper>
      <PreviewModal
        templateId={templateId}
        boards={data.boards}
        audiences={audiences}
        opened={previewing}
        onClose={() => setPreviewing(false)}
      />
      <ReadinessAlert readiness={readiness.data} compact />
      {generate.error && <ErrorState error={generate.error} title="A geração falhou" />}
      {current && (
        <RunResult
          key={current.id}
          run={current}
          onFix={onFix}
          context={context}
          onRun={(run) => {
            setShown(run);
            onGenerated?.(run.id);
          }}
        />
      )}
      <Group justify="space-between" ref={historyRef}>
        <Title order={5}>Gerações (.pptx e PDF)</Title>
        <Button size="compact-xs" variant="subtle" leftSection={<IconArrowsDiff size={14} />} disabled={history.length < 2} onClick={() => setComparing(true)}>
          Comparar duas
        </Button>
      </Group>
      {comparing && <CompareModal runs={history} initial={current?.id} opened onClose={() => setComparing(false)} />}
      {history.length ? (
        <Table.ScrollContainer minWidth={640}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Gerada em</Table.Th>
                <Table.Th>Referência</Table.Th>
                <Table.Th>Validação</Table.Th>
                <Table.Th>Revisão</Table.Th>
                <Table.Th>Versão do modelo</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history.map((run) => (
                <Table.Tr key={run.id} bg={current?.id === run.id ? 'var(--mantine-primary-color-light)' : undefined}>
                  <Table.Td>
                    <Anchor component="button" size="sm" onClick={() => setShown(run)}>
                      {fmtDateTime(run.created_at)}
                    </Anchor>
                    {run.kind === 'parcial' && (
                      <Badge size="xs" variant="outline" ml={6}>
                        parcial
                      </Badge>
                    )}
                    {run.audience ? (
                      <Badge size="xs" variant="outline" ml={6}>
                        {run.audience}
                      </Badge>
                    ) : null}
                  </Table.Td>
                  <Table.Td>{fmtDate(run.reference_at, true)}</Table.Td>
                  <Table.Td>
                    <Badge color={run.status === 'ok' ? 'teal' : 'red'} variant="light">
                      {run.status === 'ok' ? 'ok' : plural(run.validation.errors.length, 'erro', 'erros')}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <ReviewBadge run={run} />
                  </Table.Td>
                  <Table.Td className="mono">{run.template_sha256.slice(0, 10)}</Table.Td>
                  <Table.Td>
                    <Group gap={8} wrap="nowrap">
                      <Anchor href={runFileUrl(run, 'pptx', needsForce(run, !!draft.require_approval))} size="sm">
                        .pptx
                      </Anchor>
                      <Anchor href={runFileUrl(run, 'pdf', needsForce(run, !!draft.require_approval))} size="sm">
                        PDF
                      </Anchor>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      ) : (
        <Text size="sm" c="dimmed">
          Nenhuma apresentação gerada com este modelo.
        </Text>
      )}
    </Stack>
  );
}

/**
 * RF-49: one surface instead of five tabs.
 *
 * Mapping and editing were the same act — select a shape, say what goes in it — performed on two
 * screens with two renderers that disagreed. They are now the same canvas and the same panel: the
 * content section binds a field or types a text, the format sections move and style the shape.
 * Everything that is a *setting* rather than a slide — the template file, the project's fixed
 * texts, the deck's rules, the generation history — lives in a drawer, reachable without leaving
 * the slide you are looking at.
 */
function TemplateWorkspace({ templateId, onBack }: { templateId: number; onBack: () => void }) {
  const detail = useTemplate(templateId);
  const catalog = useCatalog();
  const save = useSaveMapping(templateId);
  const refresh = useRefreshTemplate(templateId);
  const runs = useRuns(templateId);
  const variables = useVariables({ templateId });
  const { get, set } = useFilters();
  const [draft, setDraft] = useState<DeckMapping | null>(null);
  /** M11: the mapping as the server has it. "Unsaved" is measured against it, and a pause saves it. */
  const savedMapping = useRef<DeckMapping | null>(null);
  const [settledDraft] = useDebouncedValue(draft, MAPPING_AUTOSAVE_MS);
  const mappingDirty = draft !== null && draft !== savedMapping.current;
  /** M10: a phone has no ribbon, so the commands it can use sit under the title instead. */
  const phone = useMediaQuery('(max-width: 48em)') ?? false;
  const [presentingLast, setPresentingLast] = useState(false);
  const [drawer, setDrawer] = useState<null | Drawer>(null);
  /** RF-103: the title row and the menu bar, collapsible for more room — per browser, like the
   * filmstrip's own collapse (RF-68). */
  const [menuVisible, setMenuVisible] = useLocalStorage({ key: 'cadencia-apresentacao-menu-visivel', defaultValue: true });
  /** Every menu entry that ends up at "Gerar apresentação" goes through here, so each one can say
   * *where inside it* it means to land — a real destination instead of four buttons for one drawer. */
  const [genFocus, setGenFocus] = useState<{ kind: 'previa' | 'historico'; at: number } | null>(null);
  const openGenerate = (kind?: 'previa' | 'historico') => {
    setDrawer('gerar');
    setGenFocus(kind ? { kind, at: Date.now() } : null);
  };
  /** Bumped after a version of the edits is restored, so the editor re-reads them (RF-87). */
  const [editorKey, setEditorKey] = useState(0);
  // RF-67: two different jobs behind one word. `full` is distraction-free *editing* — the app
  // chrome goes away and the canvas fills the screen. Showing the deck to a room is PresentMode,
  // which needs a rendered run and therefore lives where the runs are, in the generation drawer.
  const full = useFullscreenElement<HTMLDivElement>();
  // F11 is what people already press. The browser's own fullscreen would hide the app chrome but
  // not give the canvas the room, so this takes the key and fullscreens the surface instead.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !typing(event.target)) {
        event.preventDefault();
        setDrawer('gerar');
        setGenFocus(null);
        return;
      }
      if (event.key !== 'F11') return;
      event.preventDefault();
      void full.toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);

  // #21: every drawer and download of this screen, from Ctrl+K.
  const commandRun = runs.data?.items?.find((run) => run.id === (get('run') ?? runs.data?.items?.[0]?.id));
  const commandForce = commandRun ? needsForce(commandRun, !!draft?.require_approval) : false;
  useRegisterCommands('apresentacao', [
    { id: 'gerar', label: 'Gerar apresentação', shortcut: 'Ctrl+Enter', run: () => openGenerate() },
    { id: 'previa', label: 'Prévia de um board', run: () => openGenerate('previa') },
    {
      id: 'pptx',
      label: 'Baixar .pptx da geração aberta',
      disabled: !commandRun,
      run: () => commandRun && window.open(runFileUrl(commandRun, 'pptx', commandForce), '_blank', 'noopener'),
    },
    {
      id: 'pdf',
      label: 'Baixar PDF da geração aberta',
      disabled: !commandRun,
      run: () => commandRun && window.open(runFileUrl(commandRun, 'pdf', commandForce), '_blank', 'noopener'),
    },
    { id: 'variaveis', label: 'Variáveis', run: () => setDrawer('textos') },
    { id: 'narrativa', label: 'Narrativa por board', run: () => setDrawer('narrativa') },
    { id: 'regras', label: 'Regras da apresentação', run: () => setDrawer('regras') },
    { id: 'versoes', label: 'Versões das edições', run: () => setDrawer('versoes') },
    { id: 'modelos', label: 'Gerenciar modelos', run: () => setDrawer('modelo') },
    { id: 'diagnostico', label: 'Diagnóstico do modelo', run: () => setDrawer('diagnostico') },
    { id: 'acessibilidade', label: 'Acessibilidade do modelo', run: () => setDrawer('acessibilidade') },
    { id: 'uso', label: 'Uso do modelo', run: () => setDrawer('uso') },
    { id: 'assistente', label: 'Assistente do modelo', run: () => set({ assistente: '1' }) },
    { id: 'tela-cheia', label: 'Tela cheia do editor', shortcut: 'F11', run: () => void full.toggle() },
    { id: 'menu', label: menuVisible ? 'Esconder o título e o menu' : 'Mostrar o título e o menu', run: () => setMenuVisible((v) => !v) },
  ]);

  /** A mapping the server already has (loaded, or restored): it is both the draft and the baseline. */
  const adoptMapping = (mapping: DeckMapping) => {
    savedMapping.current = mapping;
    setDraft(mapping);
  };
  useEffect(() => {
    if (detail.data) adoptMapping(detail.data.mapping ?? fromSuggestion(detail.data.suggestion));
    // Reset only when switching templates; refetches must not discard edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.id]);
  /** M11: a pause in the changes saves the mapping, the way the editor's own edits save. */
  useEffect(() => {
    if (!settledDraft || settledDraft === savedMapping.current) return;
    persistMapping(settledDraft);
    // mutate changes identity every render; depending on it would resend the same mapping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledDraft]);
  const persistMapping = (mapping: DeckMapping) =>
    save.mutate(mapping, {
      onSuccess: () => {
        savedMapping.current = mapping;
      },
    });
  /** Ctrl+S and the ribbon's button: the same save, without waiting for the pause. */
  const saveMappingNow = () => {
    if (draft && draft !== savedMapping.current) persistMapping(draft);
  };
  // RF-67: read before the loading guard below, like every other hook here — `DeckEditorTab`
  // registers Editar/Ver/Inserir/Formatar/Slide/Organizar on this same registry once it mounts.
  const commands = useCommands();
  // M15: the newest generation is what "Apresentar a última geração" presents.
  const lastRun = runs.data?.items?.[0];
  const lastSlides = usePresentSlides(lastRun, detail.data, draft);

  if (detail.isLoading || catalog.isLoading || !draft) return <Loading rows={6} />;
  if (detail.error) return <ErrorState error={detail.error} />;
  const data = detail.data!;
  // The editor opens a generated deck, so it needs a run; the newest one is the default.
  const editorRun = get('run') ?? runs.data?.items?.[0]?.id;
  const currentRun = runs.data?.items?.find((run) => run.id === editorRun);
  /** M10/M14: the same download the editor's ribbon makes, from wherever it is offered. */
  const downloadCurrent = (format: 'pptx' | 'pdf') =>
    currentRun && window.open(runFileUrl(currentRun, format, needsForce(currentRun, !!draft.require_approval)), '_blank', 'noopener');
  const titles: Record<Drawer, string> = {
    gerar: 'Gerar a apresentação',
    textos: 'Variáveis',
    regras: 'Regras da apresentação',
    modelo: 'Modelos',
    versoes: 'Versões das edições',
    diagnostico: 'Diagnóstico do modelo',
    acessibilidade: 'Acessibilidade do modelo',
    uso: 'Uso do modelo',
    narrativa: 'Narrativa por board',
  };

  /**
   * RF-106: the ribbon's document-level tabs — Arquivo, Página Inicial, Exibir, Inserir, Formatar,
   * Slide, Organizar, Ferramentas, Apresentar, Ajuda — the same shape PowerPoint's own ribbon uses.
   * Arquivo, Ferramentas, Apresentar and Ajuda are built here directly because they act on the
   * *file* or open a drawer, not the canvas. Página Inicial/Exibir/Inserir/Formatar/Slide/Organizar
   * pull their command entries from whatever `DeckEditorTab` has registered on `lib/commands` (the
   * same registry Ctrl+K reads) — that is where `align`, `insert`, `groupSelection`… already live,
   * so the ribbon is a second way to reach them rather than a duplicate implementation that could
   * drift. `DeckEditorTab` then splices in the handful of rich groups (font, colour, zoom…) that a
   * one-shot command can't represent — a value, not an action — before it renders `<Ribbon>`.
   */
  const fromCommands = (group: string, exclude: string[] = []): (RibbonEntry & { divider?: boolean })[] =>
    commands
      .filter((c) => c.group === group && !exclude.includes(c.id))
      .map((c) => ({ label: c.label, icon: c.icon, shortcut: c.shortcut, disabled: c.disabled, divider: c.divider, onClick: c.run }));
  /** Splits a flat entry list into ribbon groups at each `divider: true`, captioned in order. */
  const captioned = (entries: (RibbonEntry & { divider?: boolean })[], captions: string[]): RibbonGroup[] => {
    const segments: RibbonEntry[][] = [];
    for (const { divider, ...entry } of entries) {
      if (divider || segments.length === 0) segments.push([]);
      segments[segments.length - 1].push(entry);
    }
    return segments.map((entries, index) => ({ caption: captions[index] ?? '', entries }));
  };
  const documentTabs: RibbonTab[] = [
    {
      id: 'arquivo',
      label: 'Arquivo',
      groups: captioned(
        [
          { label: 'Voltar à galeria', icon: <IconArrowLeft size={15} />, onClick: onBack },
          { label: 'Gerar apresentação', icon: <IconPlayerPlay size={15} />, shortcut: 'Ctrl+Enter', divider: true, onClick: () => openGenerate() },
          {
            // RF-70: the editor is where the deck ends up, so this is where it is taken away from.
            label: currentRun ? 'Baixar .pptx' : 'Baixar .pptx (gere primeiro)',
            icon: <IconDownload size={15} />,
            disabled: !currentRun,
            onClick: () => downloadCurrent('pptx'),
          },
          {
            label: currentRun ? 'Baixar PDF' : 'Baixar PDF (gere primeiro)',
            icon: <IconFileTypePdf size={15} />,
            disabled: !currentRun,
            onClick: () => downloadCurrent('pdf'),
          },
          { label: 'Prévia de um board', icon: <IconEye size={15} />, onClick: () => openGenerate('previa') },
          { label: 'Gerações (.pptx e PDF)', icon: <IconPresentation size={15} />, onClick: () => openGenerate('historico') },
          { label: 'Versões das edições', icon: <IconHistory size={15} />, onClick: () => setDrawer('versoes') },
          { label: 'Gerenciar modelos', icon: <IconUpload size={15} />, divider: true, onClick: () => setDrawer('modelo') },
          { label: 'Reler o modelo do arquivo', icon: <IconRefresh size={15} />, onClick: () => refresh.mutate() },
          { label: 'Assistente do modelo', icon: <IconWand size={15} />, onClick: () => set({ assistente: '1' }) },
          { label: 'Diagnóstico do modelo', icon: <IconStethoscope size={15} />, onClick: () => setDrawer('diagnostico') },
          { label: 'Acessibilidade', icon: <IconAccessible size={15} />, onClick: () => setDrawer('acessibilidade') },
          { label: 'Uso do modelo', icon: <IconChartBar size={15} />, onClick: () => setDrawer('uso') },
        ],
        ['Navegação', 'Geração', 'Modelo'],
      ),
    },
    {
      id: 'pagina-inicial',
      label: 'Página Inicial',
      groups: captioned(
        [
          { label: 'Salvar mapeamento', icon: <IconDeviceFloppy size={15} />, shortcut: 'Ctrl+S', onClick: saveMappingNow },
          ...fromCommands('editar').map((entry, index) => (index === 0 ? { ...entry, divider: true } : entry)),
        ],
        ['Mapeamento', 'Desfazer', 'Área de Transferência', 'Edição'],
      ),
    },
    {
      id: 'exibir',
      label: 'Exibir',
      groups: captioned(
        [
          { label: full.fullscreen ? 'Sair da tela cheia' : 'Tela cheia', icon: <IconMaximize size={15} />, shortcut: 'F11', onClick: () => full.toggle() },
          // Grade/réguas/ímã/ajustar become the ribbon's own richer toggle controls (`GuidesControls`,
          // `ZoomControl`) with pressed-state feedback a plain command entry can't show.
          ...fromCommands('ver', ['zoom-ajustar', 'grade', 'reguas', 'ima']).map((entry, index) => (index === 0 ? { ...entry, divider: true } : entry)),
        ],
        ['Janela', 'Painéis'],
      ),
    },
    { id: 'inserir', label: 'Inserir', groups: captioned(fromCommands('inserir'), ['Conteúdo', 'Comentários']) },
    {
      id: 'formatar',
      label: 'Formatar',
      // Negrito/itálico/sublinhado/alinhamento/marcadores/pincel/bloquear already get rich controls
      // (`FontControls`, `ParagraphControls`, `FormatPainterControl`, `LockControl`); only what has
      // no rich equivalent — hiding a shape — stays a plain command here.
      groups: captioned(
        fromCommands('formatar', [
          'negrito',
          'italico',
          'sublinhado',
          'alinhar-esquerda',
          'alinhar-centro',
          'alinhar-direita',
          'marcadores',
          'numeracao',
          'copiar-formato',
          'colar-formato',
          'bloquear',
        ]),
        ['Forma'],
      ),
    },
    {
      id: 'slide',
      label: 'Slide',
      groups: captioned(
        fromCommands('slide'),
        ['Slide', 'Propriedades', 'Modelo'],
      ),
    },
    { id: 'organizar', label: 'Organizar', groups: captioned(fromCommands('organizar'), ['Ordem', 'Alinhar', 'Distribuir', 'Agrupar']) },
    {
      id: 'ferramentas',
      label: 'Ferramentas',
      groups: captioned(
        [
          { label: 'Variáveis', icon: <IconBraces size={15} />, onClick: () => setDrawer('textos') },
          { label: 'Narrativa por board', icon: <IconSparkles size={15} />, onClick: () => setDrawer('narrativa') },
          { label: 'Regras da apresentação', icon: <IconAdjustments size={15} />, onClick: () => setDrawer('regras') },
          { label: 'Recomeçar da sugestão', icon: <IconWand size={15} />, divider: true, danger: true, onClick: () => setDraft(fromSuggestion(data.suggestion)) },
        ],
        ['Personalização', 'Modelo'],
      ),
    },
    {
      id: 'apresentar',
      label: 'Apresentar',
      groups: [
        {
          caption: 'Apresentação',
          entries: [
            { label: 'Apresentar a última geração', icon: <IconPresentation size={15} />, disabled: !lastSlides.length, onClick: () => setPresentingLast(true) },
            { label: 'Escolher outra geração…', icon: <IconPresentation size={15} />, onClick: () => openGenerate('historico') },
          ],
        },
      ],
    },
    {
      id: 'ajuda',
      label: 'Ajuda',
      groups: [{ caption: 'Suporte', entries: [{ label: 'Atalhos do teclado', icon: <IconKeyboard size={15} />, shortcut: '?', onClick: openShortcuts }] }],
    },
  ];

  return (
    <Stack gap="sm" ref={full.ref} style={full.fullscreen ? { background: 'var(--mantine-color-body)', padding: 8 } : undefined}>
      {menuVisible && (
        <Paper withBorder>
          <DeckTitleBar
            title={data.name}
            leading={
              <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Voltar à galeria" onClick={onBack}>
                <IconArrowLeft size={15} />
              </ActionIcon>
            }
            badge={
              data.mapping_outdated ? (
                <Badge size="sm" color="yellow" variant="light">
                  modelo mudou
                </Badge>
              ) : null
            }
          />
        </Paper>
      )}
      {/* M10: on a phone the editor is replaced by a notice, so these are the only commands there. */}
      {phone && (
        <Group gap="xs" wrap="wrap">
          <Button size="compact-sm" leftSection={<IconPlayerPlay size={15} />} onClick={() => openGenerate()}>
            Gerar
          </Button>
          <Button size="compact-sm" variant="default" leftSection={<IconDownload size={15} />} disabled={!currentRun} onClick={() => downloadCurrent('pptx')}>
            Baixar .pptx
          </Button>
          <Button size="compact-sm" variant="default" leftSection={<IconFileTypePdf size={15} />} disabled={!currentRun} onClick={() => downloadCurrent('pdf')}>
            Baixar PDF
          </Button>
          <Button size="compact-sm" variant="default" leftSection={<IconPresentation size={15} />} disabled={!lastSlides.length} onClick={() => setPresentingLast(true)}>
            Apresentar
          </Button>
        </Group>
      )}

      {save.error && <ErrorState error={save.error} title="Mapeamento não salvo" />}

      <DeckEditorTab
        key={editorKey}
        templateId={templateId}
        runId={editorRun}
        mapping={draft}
        onMapping={setDraft}
        catalog={catalog.data?.fields ?? []}
        variables={variables.data?.items ?? []}
        boards={data.boards}
        onReload={() => setEditorKey((k) => k + 1)}
        menuVisible={menuVisible}
        onToggleMenu={() => setMenuVisible((v) => !v)}
        onGenerate={() => openGenerate()}
        documentTabs={documentTabs}
        mappingDirty={mappingDirty}
        mappingSaving={save.isPending}
        onSaveMapping={saveMappingNow}
      />
      <TemplateWizard
        templateId={templateId}
        opened={get('assistente') === '1'}
        onClose={() => set({ assistente: null })}
        onVariables={() => {
          set({ assistente: null });
          setDrawer('textos');
        }}
      />
      {lastRun && (
        <PresentMode
          slides={lastSlides}
          runId={lastRun.id}
          opened={presentingLast}
          onClose={() => setPresentingLast(false)}
          onFinish={(seconds) => void recordPresentation(lastRun.id, seconds).catch(() => undefined)}
        />
      )}

      <Drawer
        opened={drawer !== null}
        onClose={() => {
          setDrawer(null);
          setGenFocus(null);
        }}
        position="right"
        size="lg"
        title={drawer ? titles[drawer] : ''}
      >
        {drawer === 'gerar' && (
          <GenerateTab
            templateId={templateId}
            data={data}
            draft={draft}
            focus={genFocus}
            onGenerated={(id) => set({ run: id })}
            onFix={(fix) => {
              if (fix.variable) {
                setDrawer('textos');
                return;
              }
              set({ run: fix.run ?? null, slide: fix.slide ?? null, forma: fix.shape ?? null });
              setDrawer(null);
            }}
          />
        )}
        {drawer === 'diagnostico' && <TemplateDiagnosticsPanel templateId={templateId} />}
        {drawer === 'acessibilidade' && (
          <TemplateA11yPanel
            templateId={templateId}
            onOpen={(slide, shape) => {
              const origin = data.manifest.slides.find((s) => s.index === slide)?.slide_id;
              if (origin !== undefined) set({ run: null, slide: String(origin), forma: shape });
              setDrawer(null);
            }}
          />
        )}
        {drawer === 'uso' && <TemplateUsagePanel templateId={templateId} />}
        {drawer === 'narrativa' && <NarrativePanel templateId={templateId} boards={data.boards} />}
        {drawer === 'versoes' && (
          <VersionsDrawer
            templateId={templateId}
            onRestored={(kind) => {
              if (kind === 'edits') setEditorKey((k) => k + 1);
              else void detail.refetch().then((r) => r.data?.mapping && adoptMapping(r.data.mapping));
            }}
          />
        )}
        {drawer === 'textos' && (
          <VariablesDrawer
            templateId={templateId}
            templateName={data.name}
            boards={data.boards}
            slides={data.manifest.slides}
          />
        )}
        {drawer === 'regras' && <DeckRules draft={draft} setDraft={setDraft} boards={data.boards} />}
        {drawer === 'modelo' && (
          <TemplatesDrawer
            current={templateId}
            onSelect={(id) => {
              set({ modelo: id == null ? null : String(id), slide: null, run: null });
              setDrawer(null);
            }}
            onUploaded={(id) => {
              // #23: a new template opens on its wizard.
              set({ modelo: String(id), slide: null, run: null, assistente: '1' });
              setDrawer(null);
            }}
          />
        )}
      </Drawer>
    </Stack>
  );
}

/** Deck-wide rules: not about any one slide, so they live in a drawer rather than on the canvas. */
function DeckRules({
  draft,
  setDraft,
  boards,
}: {
  draft: DeckMapping;
  setDraft: (m: DeckMapping) => void;
  boards: TemplateDetail['boards'];
}) {
  const shared = useDeckPalette();
  const spaceKeys = draft.space_keys ?? [];
  // RF-55: a space narrows the run to its boards, so the board list follows the chosen spaces.
  const inScope = spaceKeys.length ? boards.filter((b) => b.space_key && spaceKeys.includes(b.space_key)) : boards;
  const options = inScope.map((b) => ({
    value: String(b.id),
    label: b.space_name ? `${b.name} · ${b.space_name}` : b.name,
  }));
  const spaceOptions = [
    ...new Map(
      boards.filter((b) => b.space_key).map((b) => [b.space_key!, b.space_name || b.space_key!]),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return (
    <Stack gap="md">
      <MultiSelect
        label="Espaços da apresentação"
        description="vazio = todos; escolher um espaço restringe também os boards abaixo"
        placeholder="todos os espaços"
        data={spaceOptions}
        value={spaceKeys}
        onChange={(value) =>
          setDraft({
            ...draft,
            space_keys: value,
            // A board that no longer belongs to a chosen space would silently do nothing.
            board_ids: draft.board_ids.filter((id) => {
              const board = boards.find((b) => b.id === id);
              return !value.length || (board?.space_key && value.includes(board.space_key));
            }),
          })
        }
        searchable
        clearable
      />
      <MultiSelect
        label="Boards dos slides repetidos"
        placeholder="todos os acompanhados"
        data={options}
        value={draft.board_ids.map(String)}
        onChange={(value) => setDraft({ ...draft, board_ids: value.map(Number) })}
        searchable
      />
      <Switch label="Anonimizar nomes" checked={draft.anonymize} onChange={(e) => setDraft({ ...draft, anonymize: e.currentTarget.checked })} />
      <Switch
        label="Gerar automaticamente no checkpoint"
        checked={draft.auto_generate}
        onChange={(e) => setDraft({ ...draft, auto_generate: e.currentTarget.checked })}
      />
      <Divider label="Públicos e aprovação" />
      <TagsInput
        label="Públicos"
        description="Ex.: diretoria, time. Cada slide pode ser restrito a públicos (painel do slide); ao gerar, escolhe-se um."
        placeholder="digite e Enter"
        value={draft.audiences ?? []}
        onChange={(audiences) => setDraft({ ...draft, audiences: audiences.map((a) => a.trim().toLowerCase()).filter(Boolean) })}
        clearable
      />
      <Switch
        label="Exigir aprovação antes de baixar"
        description="Uma geração só é baixada sem aviso depois de enviada para revisão e aprovada; comentários em aberto impedem a aprovação."
        checked={!!draft.require_approval}
        onChange={(e) => setDraft({ ...draft, require_approval: e.currentTarget.checked })}
      />
      <Divider label="Geração agendada" />
      <ScheduleEditor value={draft.schedule} audiences={draft.audiences ?? []} onChange={(schedule) => setDraft({ ...draft, schedule })} />
      <Divider label="Cores e rótulos dos status" />
      {/* RF-62: one configuration, in the manager. Overriding it *here* is a per-template choice
          and stays available, but the shared values are what most templates should use. */}
      <StatusPalette
        palette={draft.palette}
        labels={draft.status_labels}
        onChange={(next) =>
          setDraft({
            ...draft,
            ...(next.palette ? { palette: next.palette } : {}),
            ...(next.status_labels ? { status_labels: next.status_labels } : {}),
          })
        }
        inherited={shared.data ?? undefined}
      />
      <Text size="xs" c="dimmed">
        Vazio herda de <b>Variáveis → Cores do semáforo</b>. Preencha só o que este modelo faz
        diferente.
      </Text>
    </Stack>
  );
}

/**
 * RF-37 … RF-44 / RF-104: the user's PowerPoint template is the visual contract; the deck is
 * filled in place. Opening one starts from a gallery — the way both slide products do it — rather
 * than a `<Select>` that already assumed which template the person wanted; picking a card is the
 * same "open this template" the dropdown used to do.
 */
export function DeckPage() {
  const templates = useTemplates();
  const { get, set } = useFilters();
  const items = useMemo(() => templates.data?.items ?? [], [templates.data]);
  // RF-34: the model, the tab and the slide live in the URL, so a mapping in progress is a link.
  const chosen = get('modelo');
  const selected = items.some((t) => String(t.id) === chosen) ? chosen : null;
  const [managing, setManaging] = useState(false);
  const upload = useUploadTemplate();

  if (selected) {
    return (
      <TemplateWorkspace
        key={selected}
        templateId={Number(selected)}
        onBack={() => set({ modelo: null, slide: null, run: null })}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Apresentação de fim de sprint"
        subtitle="O modelo .pptx é o contrato visual: a Cadência preenche as áreas dele e nunca redesenha os slides."
      />
      {templates.isLoading && <Loading />}
      {templates.error && <ErrorState error={templates.error} />}
      {templates.data && !items.length && (
        <Stack gap="md" align="flex-start">
          <Empty title="Nenhum modelo ainda">Envie o .pptx usado na reunião de sexta: a Cadência extrai o manifesto e sugere o mapeamento.</Empty>
          <Box w={240}>
            <UploadCard
              uploading={upload.isPending}
              error={upload.error}
              onFile={(file) => upload.mutate({ file }, { onSuccess: (row) => set({ modelo: String(row.id), slide: null, assistente: '1' }) })}
            />
          </Box>
        </Stack>
      )}
      {items.length > 0 && (
        <TemplateGallery
          items={items}
          onSelect={(id) => set({ modelo: String(id), slide: null })}
          onManage={() => setManaging(true)}
          uploading={upload.isPending}
          uploadError={upload.error}
          onUploadFile={(file) =>
            upload.mutate({ file }, { onSuccess: (row) => set({ modelo: String(row.id), slide: null, assistente: '1' }) })
          }
        />
      )}
      <Drawer opened={managing} onClose={() => setManaging(false)} position="right" size="lg" title="Modelos">
        <TemplatesDrawer
          current={-1}
          onSelect={(id) => {
            if (id != null) set({ modelo: String(id), slide: null });
            setManaging(false);
          }}
          onUploaded={(id) => {
            set({ modelo: String(id), slide: null, assistente: '1' });
            setManaging(false);
          }}
        />
      </Drawer>
    </>
  );
}
