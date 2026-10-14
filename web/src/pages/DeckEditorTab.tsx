import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Menu,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage, useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconLock,
  IconChevronDown,
  IconChevronUp,
  IconDeviceFloppy,
  IconLayoutGrid,
  IconNotes,
  IconPlayerPlay,
  IconRefresh,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';


import { useComments } from '../api/featureHooks';
import { useDeckEdits, useSaveDeckEdits, useRunScene, useTemplateScene, useTemplateReadiness, useUploadAsset } from '../api/hooks';
import { announce } from '../components/Announcer';
import { CommentsPanel } from '../components/editor/CommentsPanel';
import { FindReplacePanel } from '../components/editor/FindReplacePanel';
import { TablePanel } from '../components/editor/TablePanel';
import { LibraryDrawer } from '../components/editor/LibraryDrawer';
import { SlideHistoryModal } from '../components/editor/SlideHistoryModal';
import { presenceBeat, presenceLeave, recordBlockUse } from '../api/deckHooks';
import { useRegisterCommands } from '../lib/commands';
import { useFilters } from '../lib/filters';
import { styledPatch, styleOf, type CopiedStyle } from '../lib/formatPainter';
import { displayShapes, type VariableDisplay } from '../lib/variableDisplay';
import { BindingsPanel } from '../components/editor/BindingsPanel';
import { SlideScope } from '../components/editor/SlideScope';
import type {
  DeckBlock,
  DeckBoard,
  PresenceEntry,
  SlideMapping,
  Binding,
  CatalogField,
  DeckEdits,
  DeckMapping,
  ParagraphEdit,
  RunStyle,
  SceneParagraph,
  ShapeEdit,
} from '../api/types';
import { slideTitle } from '../api/types';
import { ErrorState, Loading } from '../components/common';
import { ReadinessAlert, readinessLines } from '../components/deck/Readiness';
import { CanvasMenuItems } from '../components/editor/CanvasMenu';
import { ContentSection } from '../components/editor/ContentSection';
import { Ribbon, type RibbonGroup, type RibbonTab } from '../components/editor/Ribbon';
import {
  BackgroundControl,
  DisplayToggle,
  FontControls,
  FormatPainterControl,
  GuidesControls,
  ImageUploadButton,
  LockControl,
  ParagraphControls,
  PresenceAvatars,
  PreviewModeControl,
  RotateFlipControls,
  ShapeStyleControls,
  SymbolPickerControl,
  TransitionControl,
  ZoomControl,
  type PreviewMode,
} from '../components/editor/RibbonControls';
import { SlideSorter } from '../components/editor/SlideSorter';
import { LayoutOptions } from '../components/editor/LayoutOptions';
import { PropertiesHeader } from '../components/editor/PropertiesHeader';
import { PropertiesPanel } from '../components/editor/PropertiesPanel';
import { PanelResizer, usePanelWidth } from '../components/editor/PanelResizer';
import { RailHeader } from '../components/editor/RailHeader';
import { SlideRail } from '../components/editor/SlideRail';
import { RULER, SlideStage, type Frame } from '../components/editor/SlideStage';
import { TextOverlay } from '../components/editor/TextOverlay';
import { patchedParagraphs } from '../components/editor/textFormat';
import {
  EMPTY_EDITS,
  type AlignMode,
  type EffectiveShape,
  alignedFrames,
  countEdits,
  distributedFrames,
  effectiveShapes,
  effectiveSlides,
  withDelete,
  withInsert,
  withNotes,
  withReset,
  withShapeEdit,
  withSlideDeleted,
  withSlideDuplicated,
  withSlideOrder,
  withGroup,
  withUngroup,
  templateSlideKey,
  slideEdits,
  withoutGroup,
  groupOf,
  expandSelection,
  withHidden,
  withLocked,
  withTableEdit,
  withBackground,
} from '../lib/deckEdits';
import { cmToEmu } from '../lib/emu';
import { loadDeckFonts, type FontPlan } from '../lib/fonts';
import { useT } from '../i18n';

const HISTORY_LIMIT = 100;
/** Default, smallest and largest widths of the two side panels, in pixels. */
const RAIL = { start: 186, min: 132, max: 380 };
/** RF-109: just the icon and the vertical label's own width, now that neither runs horizontally. */
const RAIL_COLLAPSED = 44;
const PANEL = { start: 330, min: 260, max: 560 };
/** RF-109: same width as the rail's own collapsed strip, for the same reason. */
const PANEL_COLLAPSED = 44;
/** The canvas never gets squeezed below this, whatever the panels are dragged to. */
const MIN_CANVAS = 360;
/** The two splitters plus the flex gaps between the five columns: real pixels, so budget for them. */
const CHROME = 2 * 6 + 4 * 4;
/** Long enough that a burst of typing is one save, short enough to feel automatic. */
const AUTOSAVE_MS = 1200;

/** A paragraph for a box that had none, so the live thumbnail never draws a half-built one. */
const BLANK_PARAGRAPH = (text: string): SceneParagraph => ({
  text,
  level: 0,
  align: 'center',
  line_spacing: null,
  space_before_pt: null,
  space_after_pt: null,
  bullet: { kind: 'none' },
  style: { size_pt: 18 },
  runs: [{ text, size_pt: 18 }],
});

/** A whole-document undo stack: the edit document is small, and snapshots reverse everything. */
function useHistory(initial: DeckEdits) {
  const [past, setPast] = useState<DeckEdits[]>([]);
  const [present, setPresent] = useState(initial);
  const [future, setFuture] = useState<DeckEdits[]>([]);

  const commit = useCallback((next: DeckEdits) => {
    setPast((stack) => [...stack, presentRef.current].slice(-HISTORY_LIMIT));
    setFuture([]);
    setPresent(next);
  }, []);
  const presentRef = useRef(present);
  presentRef.current = present;

  const undo = useCallback(() => {
    setPast((stack) => {
      if (!stack.length) return stack;
      setFuture((f) => [presentRef.current, ...f]);
      setPresent(stack[stack.length - 1]);
      return stack.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((stack) => {
      if (!stack.length) return stack;
      setPast((p) => [...p, presentRef.current]);
      setPresent(stack[0]);
      return stack.slice(1);
    });
  }, []);
  const reset = useCallback((value: DeckEdits) => {
    setPast([]);
    setFuture([]);
    setPresent(value);
  }, []);

  return { edits: present, commit, undo, redo, reset, canUndo: past.length > 0, canRedo: future.length > 0 };
}

/**
 * RF-46/RF-47/RF-53: the generated deck, open for editing.
 *
 * The scene comes from the .pptx that was just produced; every change becomes an absolute override
 * in the edit document, which the next generation replays. So the data can be refreshed as often as
 * you like and the layout work stays where it was put.
 *
 * The surface is deliberately the one people already know from Google Slides and PowerPoint Online:
 * a filmstrip of real thumbnails, a slide that fills the window, one toolbar that answers to the
 * selection, typing straight onto the slide, right-click where the pointer is, and saving that
 * happens by itself. None of that changes what is stored — it only removes the steps between
 * wanting a change and making it.
 */
/** What an unconfigured slide means: kept, deck-scoped, and included everywhere (RF-55). */
const BLANK_SLIDE: SlideMapping = { action: 'keep', scope: 'deck', bindings: [], only_spaces: [], only_boards: [] };

/** RF-106: `DeckPage` builds the command-only tabs; this splices in the rich groups (font, colour,
 * zoom…) that only this component has the state for, by tab id. A tab absent from `rich` is
 * untouched. */
function withRichGroups(tabs: RibbonTab[], rich: Partial<Record<string, { prepend?: RibbonGroup[]; append?: RibbonGroup[] }>>): RibbonTab[] {
  return tabs.map((tab) => {
    const extra = rich[tab.id];
    if (!extra) return tab;
    return { ...tab, groups: [...(extra.prepend ?? []), ...tab.groups, ...(extra.append ?? [])] };
  });
}

export function DeckEditorTab({
  templateId,
  runId,
  mapping,
  onMapping,
  catalog,
  variables,
  boards,
  onReload,
  menuVisible,
  onToggleMenu,
  onGenerate,
  documentTabs,
  mappingDirty = false,
  mappingSaving = false,
  onSaveMapping,
}: {
  templateId: number;
  runId?: string;
  mapping: DeckMapping;
  onMapping: (next: DeckMapping) => void;
  /** M11: the mapping autosaves; these say whether it has changes not yet on the server. */
  mappingDirty?: boolean;
  mappingSaving?: boolean;
  onSaveMapping?: () => void;
  catalog: CatalogField[];
  variables: { name: string; label: string }[];
  /** RF-55: the spaces and boards a slide can be scoped to. */
  boards: DeckBoard[];
  /** #20: the edits changed on the server (a slide restored); the page remounts the editor. */
  onReload?: () => void;
  /** RF-103: the title bar above the ribbon, collapsible from the ribbon's own chevron. */
  menuVisible?: boolean;
  onToggleMenu?: () => void;
  /** RF-105: opens the generation drawer; rendered as the ribbon's own "Gerar" button. */
  onGenerate?: () => void;
  /** RF-106: the ribbon's document-level tabs (Arquivo, Página Inicial, Exibir…), built in
   * `DeckPage` from the same command registry Ctrl+K reads — this component only adds the rich
   * groups (font, colour, zoom…) a plain command can't represent. */
  documentTabs: RibbonTab[];
}) {
  /**
   * RF-61: the editor opens a generated run when there is one, and the **template** when there is
   * not. It used to refuse to open at all before a generation, which made "template editor" and
   * "slide editor" two different screens over the same file. They are one screen; what differs is
   * only whether the data has been filled in yet.
   */
  const t = useT();
  const runScene = useRunScene(runId);
  const templateScene = useTemplateScene(templateId, !runId);
  const scene = runId ? runScene : templateScene;
  const editingTemplate = !runId;
  const readiness = useTemplateReadiness(templateId);
  /**
   * RF-66: origin slide id -> the sentences the rail shows on hover. Phrased here rather than in
   * the rail so the badge and the panel below cannot describe the same problem differently.
   */
  const readinessBySlide = useMemo(() => {
    const out: Record<number, string[]> = {};
    for (const slide of readiness.data?.slides ?? []) {
      const lines = readinessLines(slide);
      if (lines.length) out[slide.slide_id] = lines;
    }
    return out;
  }, [readiness.data]);
  const stored = useDeckEdits(templateId);
  const save = useSaveDeckEdits(templateId);
  const upload = useUploadAsset();
  const [library, setLibrary] = useState(false);
  const { ref: viewportRef, width: viewWidth, height: viewHeight } = useElementSize();
  const { ref: shellRef, width: shellWidth } = useElementSize();
  const railPane = usePanelWidth('cadencia-editor-rail', RAIL.start);
  const panelPane = usePanelWidth('cadencia-editor-panel', PANEL.start);

  const { edits, commit, undo, redo, reset, canUndo, canRedo } = useHistory(EMPTY_EDITS);
  const [slideKey, setSlideKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [display, setDisplay] = useState<VariableDisplay>('valor');
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [showGrid, setShowGrid] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [snap, setSnap] = useState(true);
  const [lockAspect, setLockAspect] = useState(false);
  /** RF-107: Exibir's Cor/Escala de Cinza/Preto e Branco — a screen filter, never the file. */
  const [previewMode, setPreviewMode] = useState<PreviewMode>('cor');
  /** RF-107: Exibir's Modo de Classificação de Slides, in place of the usual canvas+panels. */
  const [slideSorter, setSlideSorter] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [openNotes, setOpenNotes] = useState(false);
  // The clipboard itself is a ref, but whether it has anything has to be state: the context menu's
  // items are built during render, so a ref alone would leave "Colar" disabled after a copy.
  const [hasClipboard, setHasClipboard] = useState(false);
  /** Which job the right-hand panel is doing: properties, comments (RF-93) or find & replace (RF-88). */
  const [panelMode, setPanelMode] = useState<'props' | 'comentarios' | 'localizar'>('props');
  /** RF-90: the format painter's clipboard, kept across slides until something else is copied. */
  const [copiedStyle, setCopiedStyle] = useState<CopiedStyle | null>(null);
  /** RF-107: the format painter stays "loaded" across selections until turned off. */
  const [stickyPainter, setStickyPainter] = useState(false);
  /** RF-106: which ribbon tab is open, remembered per browser like the filmstrip's own width. */
  const [activeRibbonTab, setActiveRibbonTab] = useLocalStorage({ key: 'cadencia-apresentacao-ribbon-aba', defaultValue: 'pagina-inicial' });
  const comments = useComments(templateId);
  /** Open threads per template slide, for the thumbnails and the panel's tab (RF-93). */
  const openComments = useMemo(() => {
    const out: Record<number, number> = {};
    for (const c of comments.data?.items ?? []) if (c.parent_id === null && !c.resolved_at) out[c.origin_slide_id] = (out[c.origin_slide_id] ?? 0) + 1;
    return out;
  }, [comments.data]);
  const phone = useMediaQuery('(max-width: 48em)') ?? false;
  /** RF-83: a fix-it link (from validation or readiness) opens a slide, and a shape on it. */
  const { get: getParam, set: setParams } = useFilters();
  const focusSlide = getParam('slide');
  const focusShape = getParam('shape');

  // Seed from the server exactly once per template, so a refetch cannot discard live edits.
  const seeded = useRef<number | null>(null);
  const clipboard = useRef<ShapeEdit[] | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    if (stored.data && seeded.current !== templateId) {
      seeded.current = templateId;
      revision.current = stored.data.revision ?? 0;
      reset(stored.data.edits ?? EMPTY_EDITS);
      setDirty(false);
    }
  }, [stored.data, templateId, reset]);

  // Metric-compatible faces have to be in before the canvas measures anything.
  useEffect(() => {
    let alive = true;
    fetch(`/api/reports/fonts?template_id=${templateId}`)
      .then((response) => (response.ok ? (response.json() as Promise<FontPlan>) : null))
      .then((plan) => plan && loadDeckFonts(plan))
      .then(
        (missing) =>
          alive &&
          missing?.length &&
          notifications.show({
            color: 'yellow',
            title: t.editor.page.fontsTitle,
            message: t.editor.page.fontsMessage(missing.join(', ')),
          }),
      )
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [templateId]);

  const slides = useMemo(() => (scene.data ? effectiveSlides(scene.data, edits) : []), [scene.data, edits]);
  const current = slides.find((s) => s.key === slideKey) ?? slides[0];
  const shapes = useMemo(() => (current ? effectiveShapes(current, edits) : []), [current, edits]);
  /**
   * RF-57: what the canvas draws. `shapes` stays the editable truth — every edit, every drag and
   * every save reads it — and this is only the reading of it on screen, rebuilt each render. The
   * two must not be confused: committing from `drawn` would write a token into the template.
   */
  const drawn = useMemo(
    () => displayShapes(shapes, mapping, current?.origin_slide_id ?? null, display),
    [shapes, mapping, current?.origin_slide_id, display],
  );
  const selectedShapes = shapes.filter((s) => selected.includes(s.key));
  /** Present keys, so a group that outlived one of its shapes cannot select a ghost. */
  const present = useMemo(() => new Set(shapes.map((s) => s.key)), [shapes]);
  /** Picking one member picks the whole group, the way every slide editor behaves. */
  const select = useCallback(
    (keys: string[]) => setSelected(current ? expandSelection(edits, current.key, keys, present) : keys),
    [edits, current, present],
  );
  const selectionGroup = current && selected.length ? groupOf(edits, current.key, selected[0]) : null;
  /** A template group is dissolved; a selection group is simply dropped. */
  const templateGroup = selectedShapes.length === 1 && selectedShapes[0].container ? selectedShapes[0] : null;
  const canGroup = selected.length > 1 && !selectionGroup;
  const canUngroup = Boolean(selectionGroup || templateGroup);

  const groupSelection = () => {
    if (!current || !canGroup) return;
    const [next, id] = withGroup(edits, editKey, selected);
    change(next);
    setSelected(next.slides[editKey]?.groups?.[id] ?? selected);
  };

  const ungroupSelection = () => {
    if (!current) return;
    if (selectionGroup) {
      change(withoutGroup(edits, editKey, selectionGroup[0]));
      return; // the members stay selected: nothing moved, only the grouping went away
    }
    if (templateGroup) {
      change(withUngroup(edits, editKey, templateGroup.key));
      setSelected([]);
    }
  };
  const order = slides.map((s) => s.key);

  const change = useCallback(
    (next: DeckEdits) => {
      commit(next);
      setDirty(true);
    },
    [commit],
  );

  const duplicateCurrentSlide = () => {
    if (!current) return;
    const [next, created] = withSlideDuplicated(edits, current.key, order);
    change(next);
    setSlideKey(created);
  };
  const deleteCurrentSlide = () => {
    if (!current) return;
    change(withSlideDeleted(edits, current.key, order));
    setSlideKey(null);
  };

  // ---- saving happens by itself, the way it does in both products
  const [settled] = useDebouncedValue(edits, AUTOSAVE_MS);
  const saveNow = useCallback(
    (document: DeckEdits) =>
      save.mutate(
        { edits: document, base_revision: revision.current, replace: true },
        {
          onSuccess: (result) => {
            revision.current = result.revision;
            setDirty(false);
            announce(t.editor.page.saved);
          },
        },
      ),
    [save],
  );
  // A rejected save (a 409, say) must not be retried in a loop: each document is attempted once,
  // and the next edit — a new object — is what makes it try again.
  const attempted = useRef<DeckEdits | null>(null);
  useEffect(() => {
    if (!dirty || save.isPending || settled !== edits || attempted.current === settled) return;
    attempted.current = settled;
    saveNow(settled);
    // saveNow changes identity with the mutation; depending on it would re-fire the save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, dirty, edits, save.isPending]);

  /**
   * RF-64: which slide an edit is written to. On a generated run it is that produced copy; on the
   * template it is the wildcard key, so the change is the slide's *design* and reaches every
   * board's copy of it. A copy's own edit still wins, because `slideEdits` merges the design
   * underneath it.
   */
  const editKey = current ? (editingTemplate ? templateSlideKey(current.origin_slide_id) : current.key) : '';

  // #19: who else has this template open, and on which slide. A heartbeat every 20 s; the server
  // forgets a silent editor after 45 s, so a closed tab disappears by itself.
  const [others, setOthers] = useState<PresenceEntry[]>([]);
  const presenceSlide = current?.key ?? '';
  useEffect(() => {
    let alive = true;
    const beat = () =>
      presenceBeat(templateId, presenceSlide)
        .then((r) => alive && setOthers(r.others))
        .catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, 20_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [templateId, presenceSlide]);
  useEffect(() => () => void presenceLeave(templateId).catch(() => undefined), [templateId]);
  const presence = useMemo(() => {
    const bySlide: Record<string, string[]> = {};
    for (const entry of others) (bySlide[entry.slide_key] ??= []).push(entry.author);
    return bySlide;
  }, [others]);
  const [historyOf, setHistoryOf] = useState<string | null>(null);

  // #21: the editor's panels and tools, reachable from Ctrl+K without hunting the toolbar.
  useRegisterCommands('editor', [
    { id: 'biblioteca', label: t.editor.commands.library, run: () => setLibrary(true) },
    { id: 'localizar', label: t.editor.commands.find, shortcut: 'Ctrl+H', run: () => setPanelMode('localizar') },
    { id: 'comentarios', label: t.editor.commands.comments, run: () => setPanelMode('comentarios') },
    { id: 'propriedades', label: t.editor.commands.properties, run: () => setPanelMode('props') },
    { id: 'historico', label: t.editor.commands.history, disabled: !current, run: () => current && setHistoryOf(current.key) },
    { id: 'grade', label: showGrid ? t.editor.commands.hideGrid : t.editor.commands.showGrid, run: () => setShowGrid((v) => !v) },
    { id: 'ajustar', label: t.editor.commands.fit, run: () => setZoom('fit') },
  ]);
  /** This slide's mapping, and the one way to change it: both panels below write through here. */
  const slideSpec = (current && mapping.slides[String(current.origin_slide_id)]) || BLANK_SLIDE;
  /** RF-102: the edit's own background if there is one, else whatever the file already shows. */
  const effectiveBackground = current ? (slideEdits(edits, current.key)?.background ?? current.background ?? null) : null;
  // `SlideStage` (via `ShapeNode`'s `hex`) wants a bare 6-digit hex, the same shape a scene's own
  // colours already come in — no leading `#`, unlike `textFormat.ts`'s `hex`, which adds one.
  const effectiveBackgroundColor = effectiveBackground?.type === 'solid' ? (effectiveBackground.color ?? null) : null;
  /** The binding of the one selected shape, if it has one: what LayoutOptions shapes. */
  const selectedBinding =
    selectedShapes.length === 1
      ? slideSpec.bindings.find((b) => b.target.endsWith(`/sh${selectedShapes[0].shape_id}`))
      : undefined;
  const patchSlide = (next: SlideMapping) =>
    current &&
    onMapping({ ...mapping, slides: { ...mapping.slides, [String(current.origin_slide_id)]: next } });

  const patchShape = (key: string, patch: Partial<ShapeEdit>) => {
    if (!current) return;
    change(withShapeEdit(edits, editKey, key, patch));
  };

  /** The same patch on every selected shape, as one undo step. */
  const patchEach = (patch: Partial<ShapeEdit>) => {
    if (!current || !selectedShapes.length) return;
    let next = edits;
    for (const shape of selectedShapes) next = withShapeEdit(next, editKey, shape.key, patch);
    change(next);
  };

  /** Organizar's "Girar 90°" — relative, so each selected shape turns from wherever it already was. */
  const rotateSelection = (deltaDeg: number) => {
    if (!current || !selectedShapes.length) return;
    let next = edits;
    for (const shape of selectedShapes) {
      const rotation = ((shape.frame.rotation ?? 0) + deltaDeg + 360) % 360;
      next = withShapeEdit(next, editKey, shape.key, { frame: { rotation } });
    }
    change(next);
  };
  const flipSelection = (axis: 'h' | 'v') => {
    if (!current || !selectedShapes.length) return;
    let next = edits;
    for (const shape of selectedShapes) {
      const flip = shape.flip ?? { h: false, v: false };
      next = withShapeEdit(next, editKey, shape.key, axis === 'h' ? { frame: { flip_h: !flip.h } } : { frame: { flip_v: !flip.v } });
    }
    change(next);
  };

  const patchParagraphs = (build: (shape: EffectiveShape) => ParagraphEdit[]) => {
    if (!current) return;
    let next = edits;
    for (const shape of selectedShapes) {
      if (!shape.text) continue;
      next = withShapeEdit(next, editKey, shape.key, { text: { paragraphs: build(shape) } });
    }
    change(next);
  };

  /** A binding belongs to the template slide this copy came from, not to the copy. */
  const setBinding = (shapeId: number, binding: Binding | null) => {
    if (!current) return;
    const key = String(current.origin_slide_id);
    const slide = mapping.slides[key] ?? { action: 'keep' as const, scope: 'deck' as const, bindings: [] };
    const others = slide.bindings.filter((b) => !b.target.endsWith(`/sh${shapeId}`));
    onMapping({
      ...mapping,
      slides: { ...mapping.slides, [key]: { ...slide, bindings: binding ? [...others, binding] : others } },
    });
  };

  /** Typing over a shape stores a text override; null puts the generated content back. */
  const setText = (shapeKey: string, text: string | null, source = edits) => {
    if (!current) return source;
    if (text === null) return withShapeEdit(source, editKey, shapeKey, { text: { paragraphs: null } });
    const shape = shapes.find((s) => s.key === shapeKey);
    const template = shape?.text?.paragraphs ?? [];
    return withShapeEdit(source, editKey, shapeKey, {
      text: {
        paragraphs: text.split('\n').map((line, index) => {
          const from = template[index] ?? template[0];
          // Nothing to copy from means the shape had no text frame: seed it with what the caret
          // was showing, so what is typed looks like what was on screen while typing it.
          if (!from) return { text: line, align: 'center' as const, level: 0, style: { size_pt: 18 } };
          return {
            text: line,
            align: from.align ?? null,
            level: from.level ?? 0,
            line_spacing: from.line_spacing ?? null,
            bullet: from.bullet?.kind === 'inherit' ? null : (from.bullet?.kind ?? null),
            bullet_char: from.bullet?.char ?? '•',
            style: from.style ?? {},
          };
        }),
      },
    });
  };

  const textOf = (shape: EffectiveShape) => (shape.text?.paragraphs ?? []).map((p) => p.text).join('\n');

  /** Anything that can hold words: a text box, or an autoshape that has none yet. */
  const canHoldText = (shape: EffectiveShape) =>
    Boolean(!shape.container && shape.renderable && (shape.text || shape.kind === 'shape' || shape.kind === 'textbox'));

  const openText = (key: string) => {
    const shape = shapes.find((s) => s.key === key);
    if (!shape || !canHoldText(shape)) return;
    // In text mode a bound box shows its token, not its words. Typing there would save the token
    // as a manual override, so the overlay simply does not open — the toggle is a lens, not a
    // second way to edit.
    if (display === 'texto' && shape.bound) return;
    setSelected([key]);
    setDraft(textOf(shape));
    closing.current = key;
    setEditing(key);
  };

  /** Inserir's "Símbolo": appended to whatever box is already being typed into — the overlay is a
   * plain textarea with no caret position reaching this component, so it lands at the end rather
   * than exactly where the cursor sits, the one place this falls short of PowerPoint's own. Opens
   * the single selected text box first when nothing is being edited yet. */
  const insertSymbol = (char: string) => {
    if (editing) {
      setDraft((d) => d + char);
      return;
    }
    if (selectedShapes.length === 1 && canHoldText(selectedShapes[0])) {
      openText(selectedShapes[0].key);
      setDraft(textOf(selectedShapes[0]) + char);
    }
  };

  /**
   * Leaving the box commits once, even though two things ask it to: the overlay's own click-away
   * listener fires before Konva's, and both call this. The ref is what makes the second call a
   * no-op — `editing` in state has not flushed yet at that point.
   */
  const closing = useRef<string | null>(null);
  const closeText = useCallback(() => {
    const key = closing.current;
    if (!key) return;
    closing.current = null;
    const shape = shapes.find((s) => s.key === key);
    if (shape && draft !== textOf(shape) && (draft.trim() || shape.text)) change(setText(key, draft));
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, shapes, edits, current, change]);

  const reorderZ = (direction: 'front' | 'back' | 'forward' | 'backward') => {
    if (!current || !selected.length) return;
    let next = edits;
    const last = shapes.length - 1;
    for (const key of selected) {
      const shape = shapes.find((s) => s.key === key);
      if (!shape) continue;
      const z =
        direction === 'front'
          ? last
          : direction === 'back'
            ? 0
            : direction === 'forward'
              ? Math.min(shape.z + 1, last)
              : Math.max(shape.z - 1, 0);
      next = withShapeEdit(next, editKey, key, { z });
    }
    change(next);
  };

  const align = (mode: AlignMode) => {
    if (!current || !selectedShapes.length || !scene.data) return;
    const frames = alignedFrames(selectedShapes, mode, scene.data.slide_width, scene.data.slide_height);
    let next = edits;
    for (const [key, frame] of Object.entries(frames)) next = withShapeEdit(next, editKey, key, { frame });
    change(next);
  };

  const distribute = (axis: 'h' | 'v') => {
    if (!current || selectedShapes.length < 3) return;
    const frames = distributedFrames(selectedShapes, axis);
    let next = edits;
    for (const [key, frame] of Object.entries(frames)) next = withShapeEdit(next, editKey, key, { frame });
    change(next);
  };

  const moveMany = (frames: Record<string, Frame>) => {
    if (!current) return;
    let next = edits;
    for (const [key, frame] of Object.entries(frames)) next = withShapeEdit(next, editKey, key, { frame });
    change(next);
  };

  /** Copy/paste keeps whole shapes, so a box styled on one slide can be reused on another. */
  const copySelection = () => {
    if (!selectedShapes.length) return;
    setHasClipboard(true);
    clipboard.current = selectedShapes.map(asInsertable);
  };

  /** A shape as an insert: its look and text, never its data binding. Copy/paste and blocks (#16). */
  const asInsertable = (shape: EffectiveShape): ShapeEdit => ({
      kind: shape.kind === 'image' ? 'image' : shape.kind === 'textbox' ? 'textbox' : 'shape',
      preset: shape.geometry,
      frame: { ...shape.frame },
      fill: shape.fill,
      line: shape.line,
      image: shape.image?.asset_id ? { asset_id: shape.image.asset_id } : undefined,
      text: shape.text
        ? {
            paragraphs: shape.text.paragraphs.map((p) => ({
              text: p.text,
              align: p.align,
              level: p.level,
              line_spacing: p.line_spacing,
              bullet: p.bullet.kind === 'inherit' ? null : p.bullet.kind,
              bullet_char: p.bullet.char ?? '•',
              style: p.style,
              runs: p.runs?.map((r) => ({ text: r.text, style: r })),
            })),
            anchor: shape.text.anchor,
            word_wrap: shape.text.word_wrap,
            autofit: shape.text.autofit,
            columns: shape.text.columns,
            insets_pt: shape.text.insets_pt,
          }
        : undefined,
    }) as ShapeEdit;

  /** #16: a saved block lands at 2 cm from the corner, with fresh keys so it can be dropped twice. */
  const insertBlock = (block: DeckBlock) => {
    if (!current) return;
    let next = edits;
    const keys: string[] = [];
    const stamp = Date.now().toString(36);
    Object.values(block.shapes).forEach((edit, index) => {
      const key = `new:bloco-${stamp}-${index}`;
      keys.push(key);
      next = withInsert(next, editKey, key, {
        ...edit,
        op: 'insert',
        frame: { ...edit.frame, x: (edit.frame?.x ?? 0) + cmToEmu(2), y: (edit.frame?.y ?? 0) + cmToEmu(2) },
      });
    });
    change(next);
    setSelected(keys);
    setLibrary(false);
    announce(t.editor.page.blockInserted(block.name));
    recordBlockUse(block.id).catch(() => undefined);
  };

  const paste = () => {
    if (!current || !clipboard.current?.length) return;
    let next = edits;
    const keys: string[] = [];
    clipboard.current.forEach((edit, index) => {
      const key = `new:colado-${Date.now().toString(36)}-${index}`;
      keys.push(key);
      next = withInsert(next, editKey, key, {
        ...edit,
        // Offset the copy so it does not hide exactly behind the original.
        frame: { ...edit.frame, x: (edit.frame?.x ?? 0) + cmToEmu(0.5), y: (edit.frame?.y ?? 0) + cmToEmu(0.5) },
      });
    });
    change(next);
    setSelected(keys);
  };

  const insert = (kind: 'textbox' | 'shape' | 'image', preset?: string, assetId?: string, aspect?: number) => {
    if (!current) return;
    const key = `new:${kind}-${Date.now().toString(36)}`;
    const width = cmToEmu(8);
    const edit: ShapeEdit = {
      op: 'insert',
      kind,
      preset: preset ?? null,
      // A library picture keeps its own proportions (#17); anything else gets the usual box.
      frame: { x: cmToEmu(2), y: cmToEmu(2), cx: width, cy: aspect ? Math.round(width / aspect) : cmToEmu(kind === 'textbox' ? 1.5 : 4) },
      ...(kind === 'textbox' ? { text: { paragraphs: [{ text: 'Novo texto', style: { size_pt: 18 } }] } } : {}),
      ...(kind === 'shape' ? { fill: { type: 'solid', color: '4472C4', alpha: 1 } } : {}),
      ...(assetId ? { image: { asset_id: assetId } } : {}),
    };
    change(withInsert(edits, editKey, key, edit));
    setSelected([key]);
  };

  const removeSelection = () => {
    if (!current || !selected.length) return;
    let next = edits;
    // RF-89: a locked shape survives a Delete aimed at a selection it happens to be in.
    for (const key of selected) if (!shapes.find((s) => s.key === key)?.locked) next = withDelete(next, editKey, key);
    change(next);
    setSelected([]);
  };

  const selectionLocked = selectedShapes.length > 0 && selectedShapes.every((s) => s.locked);
  const toggleLock = () => {
    if (!current || !selected.length) return;
    change(withLocked(edits, editKey, selected, !selectionLocked));
    announce(selectionLocked ? t.editor.page.unlocked : t.editor.page.locked);
  };
  const hideSelection = () => {
    if (!current || !selected.length) return;
    change(withHidden(edits, editKey, selected, true));
    setSelected([]);
  };
  const hiddenKeys = shapes.filter((s) => s.hidden).map((s) => s.key);
  const showHidden = () => current && change(withHidden(edits, editKey, hiddenKeys, false));

  const copyStyle = () => {
    if (selectedShapes.length !== 1) return;
    setCopiedStyle(styleOf(selectedShapes[0]));
    notifications.show({ title: t.editor.page.styleCopiedTitle, message: t.editor.page.styleCopiedMessage });
  };
  const pasteStyle = () => {
    if (!current || !copiedStyle || !selectedShapes.length) return;
    let next = edits;
    for (const shape of selectedShapes) next = withShapeEdit(next, editKey, shape.key, styledPatch(shape, copiedStyle));
    change(next);
  };
  // RF-107: a double-click on the format painter keeps it "loaded" — every selection made while
  // it is on gets painted, the way PowerPoint's own sticky painter behaves, until Escape or another
  // click turns it off (below, and in the Escape handler).
  useEffect(() => {
    if (stickyPainter && copiedStyle && selectedShapes.length) pasteStyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  /** The first selected shape with text, the way the toolbar reads "what the selection looks
   * like" for a toggle command that has no visible pressed state in a dropdown menu. */
  const leadText = selectedShapes.find((s) => s.text)?.text;
  const leadRun = leadText?.paragraphs[0]?.runs?.[0] ?? leadText?.paragraphs[0]?.style;
  const toggleTextStyle = (style: Partial<RunStyle>) => patchParagraphs((shape) => patchedParagraphs(shape, { style }));

  /**
   * RF-106: the ribbon needs a Página Inicial/Exibir/Inserir/Formatar/Slide/Organizar tab too, not
   * only Arquivo and Apresentar — and every one of those acts on the canvas, so it is registered
   * from here (where `align`, `insert`, `groupSelection`… already live) rather than threaded back
   * up to `DeckPage` as another dozen callback props. `DeckPage` reads the registry and sorts these
   * into the ribbon's tabs by `group`; the same entries are also what Ctrl+K already searches, so
   * nothing here is a new surface, only a new way to reach it.
   */
  useRegisterCommands('editor-menu', [
    { id: 'desfazer', label: t.editor.commands.undo, shortcut: 'Ctrl+Z', group: 'editar', disabled: !canUndo, run: undo },
    { id: 'refazer', label: t.editor.commands.redo, shortcut: 'Ctrl+Shift+Z', group: 'editar', disabled: !canRedo, run: redo },
    { id: 'copiar', label: t.editor.commands.copy, shortcut: 'Ctrl+C', group: 'editar', divider: true, disabled: !selectedShapes.length, run: copySelection },
    { id: 'colar', label: t.editor.commands.paste, shortcut: 'Ctrl+V', group: 'editar', disabled: !hasClipboard, run: paste },
    {
      id: 'duplicar-forma',
      label: t.editor.commands.duplicateShape,
      shortcut: 'Ctrl+D',
      group: 'editar',
      disabled: !selectedShapes.length,
      run: () => {
        copySelection();
        paste();
      },
    },
    { id: 'excluir-forma', label: t.editor.commands.deleteShape, shortcut: 'Delete', group: 'editar', disabled: !selectedShapes.length || selectionLocked, run: removeSelection },
    {
      id: 'selecionar-tudo',
      label: t.editor.commands.selectAll,
      shortcut: 'Ctrl+A',
      group: 'editar',
      divider: true,
      run: () => setSelected(shapes.filter((s) => !s.container).map((s) => s.key)),
    },
    { id: 'localizar-menu', label: t.editor.commands.findMenu, shortcut: 'Ctrl+H', group: 'editar', run: () => setPanelMode('localizar') },

    { id: 'zoom-ajustar', label: t.editor.commands.fitWindow, group: 'ver', run: () => setZoom('fit') },
    { id: 'grade', label: showGrid ? t.editor.commands.menuHideGrid : t.editor.commands.menuShowGrid, group: 'ver', run: () => setShowGrid((v) => !v) },
    { id: 'reguas', label: showRulers ? t.editor.commands.hideRulers : t.editor.commands.showRulers, group: 'ver', run: () => setShowRulers((v) => !v) },
    { id: 'ima', label: snap ? t.editor.commands.snapOff : t.editor.commands.snapOn, group: 'ver', run: () => setSnap((v) => !v) },
    { id: 'propriedades-menu', label: t.editor.commands.properties, group: 'ver', divider: true, run: () => setPanelMode('props') },
    { id: 'comentarios-menu', label: t.editor.commands.comments, group: 'ver', run: () => setPanelMode('comentarios') },
    { id: 'biblioteca-menu', label: t.editor.commands.libraryMenu, group: 'ver', run: () => setLibrary(true) },

    { id: 'inserir-texto', label: t.editor.commands.textBox, group: 'inserir', disabled: !current, run: () => insert('textbox') },
    { id: 'inserir-imagem', label: t.editor.commands.image, group: 'inserir', disabled: !current, run: () => setLibrary(true) },
    ...(
      [
        'rect',
        'roundRect',
        'ellipse',
        'triangle',
        'diamond',
        'line',
        'arrow',
        'star',
      ] as const
    ).map((preset) => ({
      id: `inserir-forma-${preset}`,
      label: t.editor.commands.shape(t.editor.commands.shapes[preset]),
      group: 'inserir',
      disabled: !current,
      run: () => insert('shape', preset),
    })),
    { id: 'inserir-comentario', label: t.editor.commands.slideComment, group: 'inserir', divider: true, run: () => setPanelMode('comentarios') },

    { id: 'negrito', label: t.editor.commands.bold, shortcut: 'Ctrl+B', group: 'formatar', disabled: !leadText, run: () => toggleTextStyle({ bold: !leadRun?.bold }) },
    { id: 'italico', label: t.editor.commands.italic, shortcut: 'Ctrl+I', group: 'formatar', disabled: !leadText, run: () => toggleTextStyle({ italic: !leadRun?.italic }) },
    { id: 'sublinhado', label: t.editor.commands.underline, shortcut: 'Ctrl+U', group: 'formatar', disabled: !leadText, run: () => toggleTextStyle({ underline: !leadRun?.underline }) },
    { id: 'alinhar-esquerda', label: t.editor.commands.alignTextLeft, group: 'formatar', divider: true, disabled: !leadText, run: () => patchParagraphs((shape) => patchedParagraphs(shape, { align: 'left' })) },
    { id: 'alinhar-centro', label: t.editor.commands.alignTextCenter, group: 'formatar', disabled: !leadText, run: () => patchParagraphs((shape) => patchedParagraphs(shape, { align: 'center' })) },
    { id: 'alinhar-direita', label: t.editor.commands.alignTextRight, group: 'formatar', disabled: !leadText, run: () => patchParagraphs((shape) => patchedParagraphs(shape, { align: 'right' })) },
    { id: 'marcadores', label: t.editor.commands.bullets, group: 'formatar', divider: true, disabled: !leadText, run: () => patchParagraphs((shape) => patchedParagraphs(shape, { bullet: 'char' })) },
    { id: 'numeracao', label: t.editor.commands.numbered, group: 'formatar', disabled: !leadText, run: () => patchParagraphs((shape) => patchedParagraphs(shape, { bullet: 'number' })) },
    { id: 'copiar-formato', label: t.editor.commands.copyFormat, shortcut: 'Ctrl+Shift+C', group: 'formatar', divider: true, disabled: selectedShapes.length !== 1, run: copyStyle },
    { id: 'colar-formato', label: t.editor.commands.pasteFormat, shortcut: 'Ctrl+Shift+V', group: 'formatar', disabled: !copiedStyle || !selectedShapes.length, run: pasteStyle },
    { id: 'bloquear', label: selectionLocked ? t.editor.commands.unlockShape : t.editor.commands.lockShape, shortcut: 'Ctrl+L', group: 'formatar', divider: true, disabled: !selectedShapes.length, run: toggleLock },
    { id: 'ocultar-forma', label: t.editor.commands.hideShape, group: 'formatar', disabled: !selectedShapes.length, run: hideSelection },
    ...(hiddenKeys.length ? [{ id: 'mostrar-ocultas', label: t.editor.commands.showHidden(hiddenKeys.length), group: 'formatar', run: showHidden }] : []),

    { id: 'duplicar-slide', label: t.editor.commands.duplicateSlide, group: 'slide', disabled: !current, run: duplicateCurrentSlide },
    { id: 'excluir-slide', label: t.editor.commands.deleteSlide, group: 'slide', disabled: !current, run: deleteCurrentSlide },
    {
      id: 'renomear-slide',
      label: t.editor.commands.renameSlide,
      group: 'slide',
      disabled: !current,
      run: () => {
        if (!current) return;
        const existing = slideTitle(mapping.slides[String(current.origin_slide_id)], current.layout ?? '', current.index);
        const name = window.prompt(t.editor.commands.slideNamePrompt, existing);
        if (name != null) onMapping({ ...mapping, slides: { ...mapping.slides, [String(current.origin_slide_id)]: { ...(mapping.slides[String(current.origin_slide_id)] ?? BLANK_SLIDE), name } } });
      },
    },
    {
      id: 'escopo-slide',
      label: t.editor.commands.slideScope,
      group: 'slide',
      divider: true,
      disabled: !current,
      run: () => {
        setSelected([]);
        setPanelMode('props');
      },
    },
    { id: 'historico-slide', label: t.editor.commands.history, group: 'slide', disabled: !current, run: () => current && setHistoryOf(current.key) },
    // M13: the template's slides as a sorter, which replaces the drawer that drew them as PNGs.
    {
      id: 'slides-modelo',
      label: slideSorter ? t.editor.commands.backToSlides : t.editor.commands.templateSlides,
      group: 'slide',
      divider: true,
      run: () => setSlideSorter((v) => !v),
    },

    { id: 'trazer-frente', label: t.editor.commands.bringToFront, group: 'organizar', disabled: !selectedShapes.length, run: () => reorderZ('front') },
    { id: 'avancar', label: t.editor.commands.forward, group: 'organizar', disabled: !selectedShapes.length, run: () => reorderZ('forward') },
    { id: 'recuar', label: t.editor.commands.backward, group: 'organizar', disabled: !selectedShapes.length, run: () => reorderZ('backward') },
    { id: 'enviar-atras', label: t.editor.commands.sendToBack, group: 'organizar', divider: true, disabled: !selectedShapes.length, run: () => reorderZ('back') },
    { id: 'alinhar-esquerda-forma', label: t.editor.commands.alignLeft, group: 'organizar', divider: true, disabled: selectedShapes.length < 2, run: () => align('left') },
    { id: 'alinhar-centro-forma', label: t.editor.commands.centerH, group: 'organizar', disabled: selectedShapes.length < 2, run: () => align('hcenter') },
    { id: 'alinhar-direita-forma', label: t.editor.commands.alignRight, group: 'organizar', disabled: selectedShapes.length < 2, run: () => align('right') },
    { id: 'alinhar-topo-forma', label: t.editor.commands.alignTop, group: 'organizar', disabled: selectedShapes.length < 2, run: () => align('top') },
    { id: 'alinhar-meio-forma', label: t.editor.commands.centerV, group: 'organizar', disabled: selectedShapes.length < 2, run: () => align('vcenter') },
    { id: 'alinhar-base-forma', label: t.editor.commands.alignBottom, group: 'organizar', disabled: selectedShapes.length < 2, run: () => align('bottom') },
    { id: 'distribuir-h', label: t.editor.commands.distributeH, group: 'organizar', divider: true, disabled: selectedShapes.length < 3, run: () => distribute('h') },
    { id: 'distribuir-v', label: t.editor.commands.distributeV, group: 'organizar', disabled: selectedShapes.length < 3, run: () => distribute('v') },
    { id: 'agrupar', label: t.editor.commands.group, shortcut: 'Ctrl+G', group: 'organizar', divider: true, disabled: !canGroup, run: groupSelection },
    { id: 'desagrupar', label: t.editor.commands.ungroup, shortcut: 'Ctrl+Shift+G', group: 'organizar', disabled: !canUngroup, run: ungroupSelection },
  ]);

  /** Open a slide (by key or template slide id) and select one of its shapes (by key or shape id). */
  const goTo = useCallback(
    (slide: string, shape?: string | null) => {
      const target = slides.find((s) => s.key === slide) ?? slides.find((s) => String(s.origin_slide_id) === slide);
      if (!target) return;
      setSlideKey(target.key);
      if (!shape) {
        setSelected([]);
        return;
      }
      const found = target.shapes.find((s) => s.key === shape || String(s.shape_id) === shape);
      setSelected(found ? [found.key] : []);
    },
    [slides],
  );

  useEffect(() => {
    if (!focusSlide || !slides.length) return;
    goTo(focusSlide, focusShape);
    setParams({ slide: null, shape: null });
  }, [focusSlide, focusShape, slides.length, goTo, setParams]);

  // Keyboard: the shortcuts a slide editor is expected to have.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      const mod = event.metaKey || event.ctrlKey;
      // RF-90, RF-89, RF-88 first: Ctrl+Shift+C must not fall through to a plain copy.
      if (mod && event.shiftKey && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copyStyle();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteStyle();
        return;
      }
      if (mod && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        toggleLock();
        return;
      }
      if (mod && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setPanelMode('localizar');
        return;
      }
      // Ctrl+Enter is "Gerar apresentação" (the workspace's), so it must not open the selected text.
      if (mod && event.key === 'Enter') return;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(shapes.filter((s) => !s.container).map((s) => s.key));
        return;
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty) saveNow(edits);
        if (mappingDirty) onSaveMapping?.();
        return;
      }
      if (mod && event.key.toLowerCase() === 'c') {
        copySelection();
        return;
      }
      if (mod && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        paste();
        return;
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        copySelection();
        paste();
        return;
      }
      if (mod && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        if (event.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }
      if (event.key === 'Escape') {
        setSelected([]);
        setStickyPainter(false);
        return;
      }
      // Tab walks the slide, the way it does in PowerPoint — but only when the focus is the page
      // itself, so tabbing between the toolbar's own controls still works.
      if (event.key === 'Tab' && shapes.length && target === document.body) {
        event.preventDefault();
        const pool = shapes.filter((s) => !s.container);
        const at = pool.findIndex((s) => s.key === selected[0]);
        const next = pool[(at + (event.shiftKey ? -1 : 1) + pool.length) % pool.length];
        if (next) select([next.key]);
        return;
      }
      if (!current || !selected.length) return;
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        openText(selected[0]);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        removeSelection();
        return;
      }
      const nudge = event.shiftKey ? cmToEmu(0.5) : cmToEmu(0.1);
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-nudge, 0],
        ArrowRight: [nudge, 0],
        ArrowUp: [0, -nudge],
        ArrowDown: [0, nudge],
      };
      const delta = moves[event.key];
      if (delta) {
        event.preventDefault();
        let next = edits;
        for (const key of selected) {
          const shape = shapes.find((s) => s.key === key);
          if (!shape || shape.locked) continue;
          next = withShapeEdit(next, editKey, key, {
            frame: { x: shape.frame.x + delta[0], y: shape.frame.y + delta[1] },
          });
        }
        change(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, current, selected, shapes, change, undo, redo, dirty, copiedStyle, mappingDirty, onSaveMapping]);

  if (scene.isLoading || stored.isLoading) return <Loading rows={6} />;
  if (scene.error) return <ErrorState error={scene.error} title={t.editor.page.openError} />;
  if (!scene.data || !current) return <Alert variant="light">{t.editor.page.noSlides}</Alert>;
  // RF-86: on a phone the deck can be generated, downloaded and presented, but not laid out.
  if (phone) {
    return (
      <Alert variant="light" color="petrol" title={t.editor.page.phoneTitle}>
        {t.editor.page.phoneBody}
      </Alert>
    );
  }

  const pending = countEdits(edits);
  // The stored widths are wishes; what the panels actually get also depends on the room there is,
  // so a window that shrinks gives the canvas its floor back instead of clipping it. The two are
  // resolved in order — the rail against the panel's wish, the panel against the resolved rail —
  // because each one's ceiling depends on the other's actual width, not on its smallest allowed.
  const room = shellWidth > 0 ? shellWidth : RAIL.start + PANEL.start + MIN_CANVAS;
  const fits = (max: number, min: number, taken: number) =>
    Math.max(min, Math.min(max, room - taken - MIN_CANVAS - CHROME));
  const rail = railPane.collapsed
    ? RAIL_COLLAPSED
    : Math.min(railPane.width, fits(RAIL.max, RAIL.min, panelPane.collapsed ? PANEL_COLLAPSED : Math.min(panelPane.width, PANEL.max)));
  const panel = panelPane.collapsed ? PANEL_COLLAPSED : Math.min(panelPane.width, fits(PANEL.max, PANEL.min, rail));
  const railMax = fits(RAIL.max, RAIL.min, panel);
  const panelMax = fits(PANEL.max, PANEL.min, rail);
  const gutter = showRulers ? RULER : 0;
  // Zoom 1 means "as wide as the canvas area"; fitting shrinks that until the slide is fully visible.
  const baseWidth = Math.max(viewWidth - gutter - 32, 320);
  const aspect = scene.data.slide_height / scene.data.slide_width;
  const available = Math.max(viewHeight - gutter - 32, 200);
  const fitZoom = Math.min(1, available / (baseWidth * aspect));
  const effectiveZoom = zoom === 'fit' ? fitZoom : zoom;
  const setZoomValue = (value: number) => setZoom(Math.min(3, Math.max(0.25, Math.round(value * 100) / 100)));
  const editingShape = shapes.find((s) => s.key === editing) ?? null;
  // The thumbnail of the slide being edited follows the caret: the draft only becomes an override
  // when the box is left, so without this the rail would show the old wording while you type.
  const liveShapes = editingShape
    ? shapes.map((shape) =>
        shape.key === editing && shape.text
          ? {
              ...shape,
              text: {
                ...shape.text,
                paragraphs: draft.split('\n').map((line, index) => {
                  const proto = shape.text!.paragraphs[index] ?? shape.text!.paragraphs[0];
                  if (!proto) return BLANK_PARAGRAPH(line);
                  return { ...proto, text: line, runs: [{ text: line, ...proto.style }] };
                }),
              },
            }
          : shape,
      )
    : undefined;
  const liveDrawn = liveShapes
    ? displayShapes(liveShapes, mapping, current?.origin_slide_id ?? null, display)
    : undefined;

  const authors = [...new Set(others.map((o) => o.author))];
  const ribbonTabs = withRichGroups(documentTabs, {
    'pagina-inicial': {
      prepend: [
        {
          caption: t.editor.groups.painter,
          content: (
            <FormatPainterControl
              copiedStyle={copiedStyle}
              selectedShapes={selectedShapes}
              sticky={stickyPainter}
              onCopy={copyStyle}
              onPaste={pasteStyle}
              onToggleSticky={() => setStickyPainter((v) => !v)}
            />
          ),
        },
      ],
    },
    formatar: {
      prepend: [
        { caption: t.editor.groups.font, content: <FontControls selection={selectedShapes} onParagraphs={patchParagraphs} /> },
        { caption: t.editor.groups.paragraph, content: <ParagraphControls selection={selectedShapes} onParagraphs={patchParagraphs} /> },
        { caption: t.editor.groups.fillAndLine, content: <ShapeStyleControls selection={selectedShapes} onPatchEach={patchEach} /> },
      ],
    },
    slide: {
      prepend: [
        {
          caption: t.editor.groups.background,
          content: (
            <Group gap={4} wrap="nowrap">
              <BackgroundControl fill={current ? effectiveBackground : null} disabled={!current} onChange={(fill) => change(withBackground(edits, editKey, fill))} />
              <TransitionControl value={current ? (slideSpec.transition ?? 'nenhuma') : 'nenhuma'} disabled={!current} onChange={(next) => patchSlide({ ...slideSpec, transition: next })} />
            </Group>
          ),
        },
      ],
    },
    organizar: {
      prepend: [{ caption: t.editor.groups.rotate, content: <RotateFlipControls disabled={!selectedShapes.length} onRotate={rotateSelection} onFlip={flipSelection} /> }],
      append: [{ caption: t.editor.groups.lock, content: <LockControl locked={selectionLocked} disabled={!selectedShapes.length} onToggle={toggleLock} /> }],
    },
    exibir: {
      prepend: [
        {
          caption: t.editor.groups.viewMode,
          content: (
            <Button
              size="compact-sm"
              variant={slideSorter ? 'filled' : 'default'}
              leftSection={<IconLayoutGrid size={14} />}
              onClick={() => setSlideSorter((v) => !v)}
            >
              {slideSorter ? t.editor.groups.normal : t.editor.groups.sorter}
            </Button>
          ),
        },
      ],
      append: [
        { caption: t.editor.groups.color, content: <PreviewModeControl mode={previewMode} onChange={setPreviewMode} /> },
        {
          caption: t.editor.groups.guides,
          content: (
            <GuidesControls
              showGrid={showGrid}
              showRulers={showRulers}
              snap={snap}
              lockAspect={lockAspect}
              onToggle={(what) => {
                if (what === 'grid') setShowGrid((v) => !v);
                else if (what === 'rulers') setShowRulers((v) => !v);
                else if (what === 'snap') setSnap((v) => !v);
                else setLockAspect((v) => !v);
              }}
            />
          ),
        },
        { caption: t.editor.groups.zoom, content: <ZoomControl zoom={effectiveZoom} fitting={zoom === 'fit'} onZoom={setZoomValue} onFit={() => setZoom('fit')} /> },
        { caption: t.editor.groups.dataDisplay, content: <DisplayToggle display={display} onDisplay={setDisplay} /> },
        ...(authors.length ? [{ caption: t.editor.groups.collaboration, content: <PresenceAvatars authors={authors} /> }] : []),
      ],
    },
    inserir: {
      prepend: [
        {
          caption: t.editor.groups.upload,
          content: (
            <ImageUploadButton
              uploading={upload.isPending}
              onImage={(file) =>
                upload.mutate(file, {
                  onSuccess: (asset) => insert('image', undefined, asset.id),
                  onError: (error) => notifications.show({ color: 'red', title: t.editor.page.imageRefused, message: error.message }),
                })
              }
            />
          ),
        },
      ],
      append: [
        {
          caption: t.editor.groups.symbols,
          content: <SymbolPickerControl disabled={!editing && !(selectedShapes.length === 1 && canHoldText(selectedShapes[0]))} onInsert={insertSymbol} />,
        },
      ],
    },
  });

  return (
    <Stack gap="xs">
      {/* RF-66: the whole deck's gaps in one line, so nothing has to be discovered slide by slide. */}
      <ReadinessAlert readiness={readiness.data} onGo={(slideId) => goTo(String(slideId))} />
      {editingTemplate && (
        <Alert variant="light" color="petrol" py={6}>
          <Text size="xs">
            {t.editor.page.templateBefore} <b>{t.editor.page.templateWord}</b>
            {t.editor.page.templateMiddle} <b>{t.editor.page.templateAll}</b>
            {t.editor.page.templateAfter}
          </Text>
        </Alert>
      )}
      <Paper withBorder>
        <Ribbon
          tabs={ribbonTabs}
          active={activeRibbonTab}
          onActive={setActiveRibbonTab}
          panelVisible={menuVisible}
          trailing={
            <Group gap={6} wrap="nowrap">
              <Button size="compact-sm" leftSection={<IconPlayerPlay size={15} />} onClick={onGenerate}>
                {t.editor.page.generate}
              </Button>
              {onToggleMenu && (
                <Tooltip label={menuVisible ? t.editor.page.hideRibbon : t.editor.page.showRibbon}>
                  <ActionIcon
                    variant="subtle"
                    onClick={onToggleMenu}
                    aria-label={menuVisible ? t.editor.page.hideRibbon : t.editor.page.showRibbon}
                  >
                    {menuVisible ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          }
        />
      </Paper>

      <SlideHistoryModal
        templateId={templateId}
        slideKey={(() => {
          if (!historyOf) return null;
          const slide = slides.find((s) => s.key === historyOf);
          // The history is of the edits document, so it is keyed like a write (RF-64).
          return slide && editingTemplate ? templateSlideKey(slide.origin_slide_id) : historyOf;
        })()}
        title={(() => {
          const slide = slides.find((s) => s.key === historyOf);
          return slide ? slideTitle(mapping.slides[String(slide.origin_slide_id)], slide.layout ?? '', slide.index) : '';
        })()}
        onClose={() => setHistoryOf(null)}
        onRestored={() => onReload?.()}
      />
      <LibraryDrawer
        opened={library}
        onClose={() => setLibrary(false)}
        selection={Object.fromEntries(selectedShapes.map((shape) => [shape.key, { ...asInsertable(shape), op: 'insert' as const }]))}
        onInsertImage={(asset) => {
          insert('image', undefined, asset.id, asset.width && asset.height ? asset.width / asset.height : undefined);
          setLibrary(false);
        }}
        onInsertBlock={insertBlock}
      />
      {save.error && <ErrorState error={save.error} title={t.editor.page.notSaved} />}

      {slideSorter ? (
        <Paper withBorder h="calc(100vh - 250px)" mih={520}>
          <SlideSorter
            scene={scene.data}
            slides={slides}
            edits={edits}
            currentKey={current.key}
            mapping={mapping}
            display={display}
            onSelect={(key) => {
              closeText();
              setSlideKey(key);
              setSelected([]);
              setSlideSorter(false);
            }}
            onReorder={(next) => change(withSlideOrder(edits, next))}
          />
        </Paper>
      ) : (
      <Group ref={shellRef} align="stretch" gap={4} wrap="nowrap" h="calc(100vh - 250px)" mih={520}>
        <Paper withBorder style={{ width: rail, flex: '0 0 auto', overflow: 'hidden' }}>
          <RailHeader collapsed={railPane.collapsed} onToggle={railPane.toggle} />
          {!railPane.collapsed && <Divider />}
          {!railPane.collapsed && (
          <SlideRail
            scene={scene.data}
            slides={slides}
            edits={edits}
            currentKey={current.key}
            live={liveDrawn}
            mapping={mapping}
            display={display}
            boards={boards}
            readiness={readinessBySlide}
            comments={openComments}
            presence={presence}
            onHistory={setHistoryOf}
            onRename={(originSlideId, name) =>
              onMapping({
                ...mapping,
                slides: {
                  ...mapping.slides,
                  [String(originSlideId)]: { ...(mapping.slides[String(originSlideId)] ?? BLANK_SLIDE), name },
                },
              })
            }
            onSelect={(key) => {
              closeText();
              setSlideKey(key);
              setSelected([]);
            }}
            onReorder={(next) => change(withSlideOrder(edits, next))}
            onDuplicate={(key) => {
              const [next, created] = withSlideDuplicated(edits, key, order);
              change(next);
              setSlideKey(created);
            }}
            onDelete={(key) => {
              change(withSlideDeleted(edits, key, order));
              setSlideKey(null);
            }}
          />
          )}
        </Paper>

        {/* Collapsed, there is nothing to resize: the splitter would be a handle on a fixed strip. */}
        {!railPane.collapsed && (
          <PanelResizer
            side="left"
            width={rail}
            min={RAIL.min}
            max={railMax}
            fallback={RAIL.start}
            label={t.editor.page.railWidth}
            onResize={railPane.onResize}
            onCommit={railPane.onCommit}
          />
        )}

        {/* Canvas */}
        <Paper
          withBorder
          style={{ flex: 1, minWidth: 0, background: 'var(--mantine-color-default-hover)', overflow: 'hidden' }}
        >
          <Menu shadow="md" width={240} withinPortal>
            <Menu.ContextMenu>
              <Box
                ref={viewportRef}
                style={{ height: '100%', width: '100%', overflow: 'auto', display: 'grid', placeItems: 'center' }}
                onWheel={(event) => {
                  if (!event.ctrlKey && !event.metaKey) return;
                  event.preventDefault();
                  setZoomValue(effectiveZoom + (event.deltaY < 0 ? 0.1 : -0.1));
                }}
              >
                {viewWidth > 0 && (
                  <Box
                    p="md"
                    style={{
                      position: 'relative',
                      filter: previewMode === 'cinza' ? 'grayscale(1)' : previewMode === 'pb' ? 'grayscale(1) contrast(3) brightness(1.1)' : undefined,
                    }}
                  >
                    <SlideStage
                      scene={scene.data}
                      shapes={drawn}
                      width={baseWidth}
                      mode="edit"
                      selected={selected}
                      zoom={effectiveZoom}
                      showGrid={showGrid}
                      showRulers={showRulers}
                      snap={snap}
                      lockAspect={lockAspect}
                      background={effectiveBackgroundColor}
                      editingKey={editing}
                      onSelect={(keys) => {
                        closeText();
                        select(keys);
                      }}
                      onChange={(key, frame) => patchShape(key, { frame })}
                      onChangeMany={moveMany}
                      onEditText={openText}
                      onContextMenu={(key) => {
                        if (key && !selected.includes(key)) select([key]);
                        if (!key) setSelected([]);
                      }}
                    />
                    {editingShape && (
                      <TextOverlay
                        shape={editingShape}
                        scale={(baseWidth * effectiveZoom) / scene.data.slide_width}
                        offsetX={16 + gutter}
                        offsetY={16 + gutter}
                        value={draft}
                        onChange={setDraft}
                        onDone={closeText}
                      />
                    )}
                  </Box>
                )}
              </Box>
            </Menu.ContextMenu>
            <Menu.Dropdown>
              <CanvasMenuItems
                hasSelection={selectedShapes.length > 0}
                canPaste={hasClipboard}
                canGroup={canGroup}
                canUngroup={canUngroup}
                canReset={selectedShapes.length === 1 && selectedShapes[0].dirty}
                onCopy={copySelection}
                onPaste={paste}
                onDuplicate={() => {
                  copySelection();
                  paste();
                }}
                onDelete={removeSelection}
                onOrder={reorderZ}
                onGroup={groupSelection}
                onUngroup={ungroupSelection}
                onReset={() => change(withReset(edits, editKey, selectedShapes[0].key))}
                onSelectAll={() => setSelected(shapes.filter((s) => !s.container).map((s) => s.key))}
                locked={selectionLocked}
                onLock={toggleLock}
                onHide={hideSelection}
                hiddenCount={hiddenKeys.length}
                onShowHidden={showHidden}
                onCopyStyle={selectedShapes.length === 1 ? copyStyle : undefined}
                onPasteStyle={pasteStyle}
                canPasteStyle={Boolean(copiedStyle)}
                onComment={() => setPanelMode('comentarios')}
              />
            </Menu.Dropdown>
          </Menu>
        </Paper>

        {/* Collapsed, there is nothing to resize: the splitter would be a handle on a fixed strip. */}
        {!panelPane.collapsed && (
          <PanelResizer
            side="right"
            width={panel}
            min={PANEL.min}
            max={panelMax}
            fallback={PANEL.start}
            label={t.editor.page.panelWidth}
            onResize={panelPane.onResize}
            onCommit={panelPane.onCommit}
          />
        )}

        {/* Properties */}
        <Paper withBorder style={{ width: panel, flex: '0 0 auto', overflow: 'hidden' }}>
          <PropertiesHeader collapsed={panelPane.collapsed} onToggle={panelPane.toggle} />
          {!panelPane.collapsed && <Divider />}
          {!panelPane.collapsed && (
          <>
          <SegmentedControl
            fullWidth
            size="xs"
            radius={0}
            value={panelMode}
            onChange={(value) => setPanelMode(value as typeof panelMode)}
            data={[
              { value: 'props', label: t.editor.page.tabProps },
              { value: 'comentarios', label: t.editor.page.tabComments(openComments[current.origin_slide_id] ?? 0) },
              { value: 'localizar', label: t.editor.page.tabFind },
            ]}
          />
          <ScrollArea h="calc(100% - 60px)" type="auto">
            {panelMode === 'comentarios' && (
              <CommentsPanel
                templateId={templateId}
                originSlideId={current.origin_slide_id}
                slideLabel={t.editor.page.commentSlideLabel(current.index)}
                shapeKey={selectedShapes.length === 1 ? selectedShapes[0].key : null}
                shapeName={selectedShapes.length === 1 ? selectedShapes[0].name : null}
                labelFor={(origin) => t.editor.page.commentSlideBadge(slides.find((s) => s.origin_slide_id === origin)?.index ?? origin)}
                onGo={(origin, shape) => goTo(String(origin), shape)}
              />
            )}
            {panelMode === 'localizar' && (
              <FindReplacePanel
                templateId={templateId}
                slides={slides}
                edits={edits}
                currentKey={current.key}
                keyFor={(slide) => (editingTemplate ? templateSlideKey(slide.origin_slide_id) : slide.key)}
                onChange={change}
                onGo={(slide, shape) => goTo(slide, shape)}
              />
            )}
            {panelMode === 'props' && (
            <>
            {/* RF-55: with nothing selected the panel answers for the *slide*, which is where its
                scope belongs — the same place you would look for its notes. */}
            {selectedShapes.length === 0 && (
              <>
                <Stack gap="xs" p="sm">
                  <Text size="xs" fw={600}>
                    {t.editor.page.slideScope}
                  </Text>
                  <SlideScope
                    mapping={slideSpec}
                    boards={boards}
                    audiences={mapping.audiences ?? []}
                    onChange={patchSlide}
                  />
                </Stack>
                <Divider />
                {/* RF-69: what survived the advanced mapping screen — every binding on this slide
                    at once, which is the one thing clicking shapes cannot give you. */}
                <Text size="xs" fw={600} px="sm" pt="sm">
                  {t.editor.page.allBindings}
                </Text>
                <BindingsPanel
                  slide={slideSpec}
                  catalog={catalog}
                  shapeKeyOf={(binding) => {
                    const id = binding.target.match(/\/sh(\d+)/)?.[1];
                    return shapes.find((s) => String(s.shape_id) === id)?.key ?? null;
                  }}
                  selectedShape={selected[0] ?? null}
                  onSelect={(key) => select([key])}
                  onRemove={(index) =>
                    patchSlide({
                      ...slideSpec,
                      bindings: slideSpec.bindings.filter((_, i) => i !== index),
                    })
                  }
                />
                <Divider />
              </>
            )}
            {selectedShapes.length === 1 && selectedShapes[0].text && (
              <>
                <ContentSection
                  shape={selectedShapes[0]}
                  originSlideId={current.origin_slide_id}
                  mapping={mapping}
                  catalog={catalog}
                  variables={variables}
                  overrideText={
                    selectedShapes[0].edit?.text?.paragraphs
                      ? selectedShapes[0].edit!.text!.paragraphs!.map((p) => p.text).join('\n')
                      : null
                  }
                  onBind={(binding) => setBinding(selectedShapes[0].shape_id, binding)}
                  onText={(value) => change(setText(selectedShapes[0].key, value))}
                />
                {/* RF-69: the shaping pipeline's own controls, moved here when the advanced
                    mapping screen was deleted. The options live in the saved mapping and go on
                    applying at generation, so removing only the UI would have left settings
                    nobody could see. */}
                {selectedBinding && (
                  <div style={{ padding: '0 8px 8px' }}>
                    <LayoutOptions
                      binding={selectedBinding}
                      onChange={(next) => setBinding(selectedShapes[0].shape_id, next)}
                    />
                  </div>
                )}
                <Divider />
              </>
            )}
            <PropertiesPanel
              shape={selectedShapes.length === 1 ? selectedShapes[0] : null}
              count={selectedShapes.length}
              onPatch={(patch) => selectedShapes[0] && patchShape(selectedShapes[0].key, patch)}
              onDelete={removeSelection}
              onReset={() => selectedShapes[0] && change(withReset(edits, editKey, selectedShapes[0].key))}
              onUngroup={canUngroup ? ungroupSelection : undefined}
              onGroup={canGroup ? groupSelection : undefined}
              grouped={Boolean(selectionGroup)}
              onOrder={reorderZ}
              styles={Object.values(edits.styles ?? {})}
              onStyles={(styles) => change({ ...edits, styles: Object.fromEntries(styles.map((s) => [s.name, s])) })}
            />
            {selectedShapes.length === 1 && selectedShapes[0].locked && (
              <Alert variant="light" color="gray" mx="sm" mb="sm" icon={<IconLock size={14} />} p="xs">
                <Text size="xs">{t.editor.page.lockedHint}</Text>
              </Alert>
            )}
            {selectedShapes.length === 1 && selectedShapes[0].table && (
              <>
                <Divider />
                <TablePanel
                  shape={selectedShapes[0]}
                  edit={slideEdits(edits, editKey)?.tables?.[selectedShapes[0].key]}
                  onChange={(patch) => change(withTableEdit(edits, editKey, selectedShapes[0].key, patch))}
                />
              </>
            )}
            </>
            )}
          </ScrollArea>
          </>
          )}
        </Paper>
      </Group>
      )}

      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap={6}>
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={openNotes ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
            onClick={() => setOpenNotes((v) => !v)}
          >
            <Group gap={4}>
              <IconNotes size={13} />
              <span>{t.editor.page.speakerNotes}</span>
            </Group>
          </Button>
          <Text size="xs" c="dimmed">
            {t.editor.page.hints}
          </Text>
        </Group>
        <Group gap={6}>
          <SaveState dirty={dirty || mappingDirty} saving={save.isPending || mappingSaving} pending={pending} />
          <Tooltip label={t.editor.page.saveNowTip}>
            <ActionIcon
              variant="default"
              aria-label={t.editor.page.saveAria}
              loading={save.isPending || mappingSaving}
              disabled={!dirty && !mappingDirty}
              onClick={() => {
                saveNow(edits);
                onSaveMapping?.();
              }}
            >
              <IconDeviceFloppy size={16} />
            </ActionIcon>
          </Tooltip>
          <Button
            size="compact-xs"
            variant="subtle"
            color="red"
            leftSection={<IconRefresh size={13} />}
            disabled={pending === 0}
            onClick={() => change(EMPTY_EDITS)}
          >
            {t.editor.page.discardAll}
          </Button>
        </Group>
      </Group>

      <Collapse expanded={openNotes}>
        <Textarea
          label={t.editor.page.speakerNotes}
          description={t.editor.page.notesHint}
          size="xs"
          autosize
          minRows={2}
          maxRows={6}
          value={slideEdits(edits, current.key)?.notes ?? current.notes ?? ''}
          onChange={(event) => change(withNotes(edits, editKey, event.currentTarget.value))}
        />
      </Collapse>
    </Stack>
  );
}

/** The quiet status line both products have instead of a save button people must remember. */
function SaveState({ dirty, saving, pending }: { dirty: boolean; saving: boolean; pending: number }) {
  const t = useT();
  if (saving) {
    return (
      <Badge variant="light" color="gray">
        {t.editor.page.saving}
      </Badge>
    );
  }
  if (dirty) {
    return (
      <Badge variant="light" color="orange">
        {t.editor.page.unsaved}
      </Badge>
    );
  }
  return (
    <Badge variant="light" color="teal">
      {pending > 0 ? t.editor.page.savedEdits(pending) : t.editor.page.allSaved}
    </Badge>
  );
}
