import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, qs } from './client';
import type {
  Absence,
  Aging,
  AssetSummary,
  BoardDetail,
  BoardOverview,
  BoardPage,
  BoardSettings,
  BoardSprints,
  BoardTree,
  CatalogField,
  Cfd,
  ConfigValue,
  ConfigView,
  JiraDraftTest,
  ConnectionResult,
  CvdRow,
  Dashboard,
  DeckEdits,
  DeckMapping,
  DeckScene,
  Discovery,
  EditsView,
  EpicView,
  FieldMap,
  FieldsView,
  FlowView,
  Health,
  IssueDetail,
  PeopleOverview,
  PeopleView,
  PersonAvailability,
  PersonDetail,
  PersonView,
  PlanView,
  ReportRun,
  RiskList,
  Scatter,
  SprintOverview,
  SprintTimelineView,
  SprintTree,
  StatusView,
  TemplateDeleted,
  TemplateDetail,
  TemplatePreviews,
  TemplateSummary,
  DeckPalette,
  TemplateReadiness,
  Variable,
  VariableScope,
  VariablesView,
  CapacityRow,
} from './types';

export interface FlowFilters {
  board?: string;
  person?: string;
  type?: string;
  start?: string;
  end?: string;
}

// ---- reads

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: () => api.get<Health>('/health'), staleTime: 60_000 });

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/dashboard') });

export const useBoardSprints = (boardId?: number) =>
  useQuery({
    queryKey: ['board', boardId, 'sprints'],
    queryFn: () => api.get<BoardSprints>(`/boards/${boardId}/sprints`),
    enabled: boardId !== undefined,
  });

export const useSprint = (sprintId?: number) =>
  useQuery({
    queryKey: ['sprint', sprintId],
    queryFn: () => api.get<SprintOverview>(`/sprints/${sprintId}`),
    enabled: sprintId !== undefined,
  });

export const useSprintTimeline = (sprintId?: number) =>
  useQuery({
    queryKey: ['sprint', sprintId, 'timeline'],
    queryFn: () => api.get<SprintTimelineView>(`/sprints/${sprintId}/timeline`),
    enabled: sprintId !== undefined,
  });

export const useSprintTree = (sprintId?: number) =>
  useQuery({
    queryKey: ['sprint', sprintId, 'tree'],
    queryFn: () => api.get<SprintTree>(`/sprints/${sprintId}/tree`),
    enabled: sprintId !== undefined,
  });

/** RF-113: a kanban board's own "Visão geral" — `useSprint`'s shape, keyed by board instead. */
export const useBoardOverview = (boardId?: number) =>
  useQuery({
    queryKey: ['board', boardId, 'overview'],
    queryFn: () => api.get<BoardOverview>(`/boards/${boardId}/overview`),
    enabled: boardId !== undefined,
  });

export const useBoardTree = (boardId?: number) =>
  useQuery({
    queryKey: ['board', boardId, 'tree'],
    queryFn: () => api.get<BoardTree>(`/boards/${boardId}/tree`),
    enabled: boardId !== undefined,
  });

export const useRisks = (scope: { sprintId?: number; boardId?: number }, filters: { situation?: string; person?: string; type?: string }) =>
  useQuery({
    queryKey: ['risks', scope, filters],
    queryFn: () =>
      api.get<RiskList>(
        scope.sprintId !== undefined
          ? `/sprints/${scope.sprintId}/risks${qs(filters)}`
          : `/boards/${scope.boardId}/risks${qs(filters)}`,
      ),
    enabled: scope.sprintId !== undefined || scope.boardId !== undefined,
  });

export const useIssue = (key?: string) =>
  useQuery({ queryKey: ['issue', key], queryFn: () => api.get<IssueDetail>(`/issues/${key}`), enabled: !!key });

export const useEpic = (key?: string, boardId?: number) =>
  useQuery({
    queryKey: ['epic', key, boardId],
    queryFn: () => api.get<EpicView>(`/epics/${key}${qs({ board_id: boardId })}`),
    enabled: !!key,
  });

export const useFlow = (filters: FlowFilters) =>
  useQuery({
    queryKey: ['flow', filters],
    queryFn: () =>
      api.get<FlowView>(`/flow${qs({ board_id: filters.board, person: filters.person, type: filters.type, start: filters.start, end: filters.end })}`),
  });

export const useCfd = (boardId?: number, start?: string, end?: string) =>
  useQuery({
    queryKey: ['cfd', boardId, start, end],
    queryFn: () => api.get<Cfd>(`/boards/${boardId}/cfd${qs({ start, end })}`),
    enabled: boardId !== undefined,
  });

export const useScatter = (boardId?: number, start?: string, end?: string) =>
  useQuery({
    queryKey: ['scatter', boardId, start, end],
    queryFn: () => api.get<Scatter>(`/boards/${boardId}/cycle-scatter${qs({ start, end })}`),
    enabled: boardId !== undefined,
  });

export const useAging = (boardId?: number) =>
  useQuery({ queryKey: ['aging', boardId], queryFn: () => api.get<Aging>(`/boards/${boardId}/aging`), enabled: boardId !== undefined });

export const useCvd = (boardId?: number) =>
  useQuery({
    queryKey: ['cvd', boardId],
    queryFn: () => api.get<{ items: CvdRow[] }>(`/boards/${boardId}/committed-vs-delivered`),
    enabled: boardId !== undefined,
  });

export const usePeople = () => useQuery({ queryKey: ['people'], queryFn: () => api.get<PeopleView>('/people') });

/** Workload, deliveries, blocks and past deliveries for everyone: the cards and the Home tiles share it. */
export const usePeopleOverview = () =>
  useQuery({ queryKey: ['people-overview'], queryFn: () => api.get<PeopleOverview>('/people/overview'), staleTime: 60_000 });


export const usePerson = (accountId?: string, weeks = 12) =>
  useQuery({
    queryKey: ['person', accountId, weeks],
    queryFn: () => api.get<PersonView>(`/people/${encodeURIComponent(accountId ?? '')}${qs({ weeks })}`),
    enabled: !!accountId,
  });

export const useCapacity = (sprintId?: number) =>
  useQuery({
    queryKey: ['capacity', sprintId],
    queryFn: () => api.get<{ items: CapacityRow[]; total_hours: number; focus_factor: number; hours_per_day: number }>(`/sprints/${sprintId}/capacity`),
    enabled: sprintId !== undefined,
  });

export const useAllocation = (sprintId?: number) =>
  useQuery({
    queryKey: ['allocation', sprintId],
    queryFn: () => api.get<PlanView | { plan: null }>(`/sprints/${sprintId}/allocation`),
    enabled: sprintId !== undefined,
  });

export const useAbsences = (accountId?: string) =>
  useQuery({
    queryKey: ['absences', accountId ?? null],
    queryFn: () => api.get<{ items: Absence[] }>(`/absences${qs({ account_id: accountId })}`),
  });

/** Everything a person's page shows beyond the card: items, epics, blocks, timeline, capacity and the week. */
export const usePersonDetail = (accountId?: string) =>
  useQuery({
    queryKey: ['person-detail', accountId],
    queryFn: () => api.get<PersonDetail>(`/people/${encodeURIComponent(accountId ?? '')}/detail`),
    enabled: !!accountId,
  });

export const usePersonAvailability = (accountId?: string) =>
  useQuery({
    queryKey: ['person-availability', accountId],
    queryFn: () => api.get<PersonAvailability>(`/people/${encodeURIComponent(accountId ?? '')}/availability`),
    enabled: !!accountId,
  });

/** Availability and absences both change capacity, so every number built on it is read again. */
function refreshCapacity(client: ReturnType<typeof useQueryClient>) {
  return Promise.all(
    ['absences', 'person-availability', 'person-detail', 'people-overview', 'capacity', 'allocation'].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function useSaveAvailability(accountId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { hours_per_day: number | null; allocation: number }) =>
      api.put<PersonAvailability>(`/people/${encodeURIComponent(accountId)}/availability`, body),
    onSuccess: () => refreshCapacity(client),
  });
}

export const useBoards = (q: string, page: number, pageSize = 25, selected?: boolean) =>
  useQuery({
    queryKey: ['boards', q, page, pageSize, selected],
    queryFn: () => api.get<BoardPage>(`/boards${qs({ q, page, page_size: pageSize, selected })}`),
    placeholderData: (previous) => previous,
  });

export const useBoardDetail = (boardId?: number) =>
  useQuery({ queryKey: ['board', boardId, 'detail'], queryFn: () => api.get<BoardDetail>(`/boards/${boardId}`), enabled: boardId !== undefined });

export const useFields = () => useQuery({ queryKey: ['fields'], queryFn: () => api.get<FieldsView>('/fields') });

/** Collection health: what ran, what is running, and where each board stands. */
export const useStatus = () =>
  useQuery({
    queryKey: ['status'],
    queryFn: () => api.get<StatusView>('/status'),
    // RF-82: every two seconds while something is collecting, so the progress bars move.
    refetchInterval: (query) => (query.state.data?.collecting ? 2_000 : 15_000),
  });


export const useTemplates = () =>
  useQuery({ queryKey: ['templates'], queryFn: () => api.get<{ items: TemplateSummary[] }>('/reports/templates') });

export const useTemplate = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId],
    queryFn: () => api.get<TemplateDetail>(`/reports/templates/${templateId}`),
    enabled: templateId !== undefined,
  });

/** The catalogue of bindable fields, including the registered variables (RF-56). */
export const useCatalog = (templateId?: number) =>
  useQuery({
    queryKey: ['catalog', templateId ?? null],
    queryFn: () => api.get<{ fields: CatalogField[] }>(`/reports/catalog${qs({ template_id: templateId })}`),
  });

/** Rendered images of the template's own slides, used by the "Slides deste modelo" drawer. */
export const useTemplatePreviews = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId, 'previews'],
    queryFn: () => api.get<TemplatePreviews>(`/reports/templates/${templateId}/previews`),
    enabled: templateId !== undefined,
  });

/**
 * The variables a template may use, what they resolve to for one target, the Jira field catalogue
 * browsed from the manager (RF-56) and any names with more than one answer.
 */
export const useVariables = (scope: {
  templateId?: number | null;
  spaceKey?: string | null;
  boardId?: number | null;
  slideId?: number | null;
} = {}) =>
  useQuery({
    queryKey: ['variables', scope.templateId ?? null, scope.spaceKey ?? null, scope.boardId ?? null, scope.slideId ?? null],
    queryFn: () =>
      api.get<VariablesView>(
        `/reports/variables${qs({
          template_id: scope.templateId,
          space_key: scope.spaceKey,
          board_id: scope.boardId,
          slide_id: scope.slideId,
        })}`,
      ),
  });

/**
 * RF-61: the template read as a scene, so the editor opens it before anything is generated.
 *
 * Same payload as a run's scene, same renderer. `run_id` is null, which is how `SlideStage` knows
 * to fetch embedded pictures from the template rather than from a deck.
 */
export const useTemplateScene = (templateId?: number, enabled = true) =>
  useQuery({
    queryKey: ['template', templateId, 'scene'],
    queryFn: () => api.get<DeckScene>(`/reports/templates/${templateId}/scene`),
    enabled: enabled && templateId !== undefined,
  });

/** RF-62: the status colours and words, one configuration for every template. */
export const useDeckPalette = () =>
  useQuery({ queryKey: ['reports', 'palette'], queryFn: () => api.get<DeckPalette>('/reports/palette') });

/** #5: Okabe-Ito, safe under every common colour blindness — a suggestion, never applied on its own. */
export const useAccessiblePalette = () =>
  useQuery({
    queryKey: ['reports', 'palette', 'acessivel'],
    queryFn: () => api.get<{ palette: Record<string, string> }>('/reports/palette/acessivel'),
    staleTime: Infinity,
    enabled: false,
  });

export function useSaveDeckPalette() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { palette?: Record<string, string>; status_labels?: Record<string, string> }) =>
      api.put<DeckPalette>('/reports/palette', body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['reports', 'palette'] });
      // Colours reach the preview and the scene, so both have to be refetched.
      client.invalidateQueries({ queryKey: ['reports', 'preview'] });
      client.invalidateQueries({ queryKey: ['template'] });
    },
  });
}

/** RF-66: per-slide readiness, so the editor can mark what is not fillable yet. */
export const useTemplateReadiness = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId, 'readiness'],
    queryFn: () => api.get<TemplateReadiness>(`/reports/templates/${templateId}/readiness`),
    enabled: templateId !== undefined,
  });

export const useRunScene = (runId?: string) =>
  useQuery({
    queryKey: ['run', runId, 'scene'],
    queryFn: () => api.get<DeckScene>(`/reports/runs/${runId}/scene`),
    enabled: runId !== undefined,
    staleTime: Infinity,
  });

/** #12: relink an orphaned run (its template deleted) to a re-uploaded one. */
export function useReassociateRun(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) => api.post<DeckScene>(`/reports/runs/${runId}/reassociar`, { template_id: templateId }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['run', runId, 'scene'] }),
  });
}

export const useDeckEdits = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId, 'edits'],
    queryFn: () => api.get<EditsView>(`/reports/templates/${templateId}/edits`),
    enabled: templateId !== undefined,
  });

export const useRuns = (templateId?: number) =>
  useQuery({ queryKey: ['runs', templateId], queryFn: () => api.get<{ items: ReportRun[] }>(`/reports/runs${qs({ template_id: templateId })}`) });

// ---- writes

export function useCollect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { mode: 'incremental' | 'full'; board_ids?: number[] }) => api.post<{ accepted: boolean }>('/collect', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['status'] }),
  });
}

export const useConnectionTest = () => useMutation({ mutationFn: () => api.post<ConnectionResult>('/connection/test') });

// ---- runtime configuration (docs/config-store.md)

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.get<ConfigView>('/config') });

/**
 * Every config write answers the whole view, so it lands in the cache at once; health and status
 * read the effective settings (Jira configured, time zone), so they are read again too.
 */
function refreshConfig(client: ReturnType<typeof useQueryClient>, view: ConfigView) {
  client.setQueryData(['config'], view);
  return Promise.all(['config', 'health', 'status'].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** `PUT /config` with only the changed keys; a secret sent as `""` is cleared. */
export function useSaveConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, ConfigValue>) => api.put<ConfigView>('/config', { values }),
    onSuccess: (view) => refreshConfig(client, view),
  });
}

/** Forget a saved value: the field goes back to the environment or the default. */
export function useResetConfig() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.del<ConfigView>(`/config/${encodeURIComponent(key)}`),
    onSuccess: (view) => refreshConfig(client, view),
  });
}

/** Copy every value that still comes from `.env` into the database. */
export function useImportEnv() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConfigView>('/config/import-env'),
    onSuccess: (view) => refreshConfig(client, view),
  });
}

/** Test a Jira credential before it is saved; nothing is written. */
export const useTestJiraDraft = () =>
  useMutation({ mutationFn: (body: JiraDraftTest) => api.post<ConnectionResult>('/config/jira/test', body) });

export function useDiscovery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Discovery>('/discovery'),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['boards'] });
      client.invalidateQueries({ queryKey: ['fields'] });
    },
  });
}

export function useSaveSelection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (boardIds: number[]) => api.put<{ selected: number[] }>('/boards/selection', { board_ids: boardIds }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['boards'] });
      client.invalidateQueries({ queryKey: ['dashboard'] });
      client.invalidateQueries({ queryKey: ['status'] });
    },
  });
}

export function useSaveBoardSettings(boardId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<BoardSettings>) => api.put<{ settings: BoardSettings }>(`/boards/${boardId}/settings`, settings),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useSaveOverrides() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (overrides: Partial<FieldMap>) => api.put<FieldsView>('/fields/overrides', overrides),
    onSuccess: () => client.invalidateQueries({ queryKey: ['fields'] }),
  });
}

export function useAddAbsence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { account_id: string; start: string; end: string; note?: string }) => api.post<{ id: number }>('/absences', body),
    onSuccess: () => refreshCapacity(client),
  });
}

export function useDeleteAbsence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/absences/${id}`),
    onSuccess: () => refreshCapacity(client),
  });
}

export function useCreateAllocation(sprintId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PlanView>(`/sprints/${sprintId}/allocation`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['allocation', sprintId] }),
  });
}

export interface Simulation {
  focus_factor?: number;
  hours_per_day?: number;
  max_items_per_person?: number;
  capacity?: Record<string, number>;
  add_people?: { account_id: string; display_name: string; capacity_hours: number }[];
  remove_people?: string[];
}

export const useSimulate = (sprintId?: number) =>
  useMutation({ mutationFn: (body: Simulation) => api.post<PlanView>(`/sprints/${sprintId}/allocation/simulate`, body) });

export function useUploadTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name?: string }) => {
      const form = new FormData();
      form.append('file', file);
      if (name) form.append('name', name);
      return api.upload<{ id: number; name: string; sha256: string }>('/reports/templates', form);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['templates'] }),
  });
}

export function useSaveMapping(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mapping: DeckMapping) => api.put<{ saved: boolean }>(`/reports/templates/${templateId}/mapping`, mapping),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['template', templateId] });
      client.invalidateQueries({ queryKey: ['templates'] });
    },
  });
}

export interface CloneMappingPlan {
  matched: number;
  unmatched: { slide: string; old_target: string; field: string | null; shape_name: string | null }[];
  saved?: boolean;
}

/** #13: carry a mapping over to a redesigned template — a report first, applied only on request. */
export function useCloneMapping(templateId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ fromTemplateId, apply }: { fromTemplateId: number; apply?: boolean }) =>
      api.post<CloneMappingPlan>(`/reports/templates/${templateId}/clonar-mapeamento`, {
        from_template_id: fromTemplateId,
        aplicar: apply ?? false,
      }),
    onSuccess: (result) => {
      if (result.saved) {
        client.invalidateQueries({ queryKey: ['template', templateId] });
        client.invalidateQueries({ queryKey: ['templates'] });
      }
    },
  });
}

export function useCreateVariable() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      label?: string;
      description?: string;
      template_id?: number | null;
      default?: string | null;
      source_field?: string | null;
    }) => api.post<Variable>('/reports/variables', body),
    onSuccess: () => invalidateVariables(client),
  });
}

export function usePatchVariable() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      label?: string;
      description?: string;
      template_id?: number | null;
      detach?: boolean;
      default?: string | null;
      /** `default: null` only means "leave it alone"; this is how a default is removed. */
      clear_default?: boolean;
      source_field?: string | null;
      /** Same reason as `clear_default`: null cannot say "disconnect". */
      clear_source?: boolean;
    }) => api.patch<Variable>(`/reports/variables/${id}`, body),
    onSuccess: () => invalidateVariables(client),
  });
}

export function useDeleteVariable() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/reports/variables/${id}`),
    onSuccess: () => invalidateVariables(client),
  });
}

export function useSetVariableValue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; scope: VariableScope; scope_key?: string; value: string }) =>
      api.put<Variable>(`/reports/variables/${id}/values`, body),
    onSuccess: () => invalidateVariables(client),
  });
}

export function useClearVariableValue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, scope, scope_key }: { id: number; scope: VariableScope; scope_key?: string }) =>
      api.del<void>(`/reports/variables/${id}/values${qs({ scope, scope_key })}`),
    onSuccess: () => invalidateVariables(client),
  });
}

/** A variable reaches the field picker and every preview, so all three have to be refetched. */
function invalidateVariables(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ['variables'] });
  client.invalidateQueries({ queryKey: ['catalog'] });
  client.invalidateQueries({ queryKey: ['reports', 'preview'] });
  client.invalidateQueries({ queryKey: ['template'] });
}

export function useDeleteTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<TemplateDeleted>(`/reports/templates/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['templates'] });
      client.invalidateQueries({ queryKey: ['template'] });
    },
  });
}

export function useRefreshTemplate(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ version: number }>(`/reports/templates/${templateId}/refresh`, {}),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId] }),
  });
}

export function useSaveDeckEdits(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { edits: DeckEdits; base_revision?: number; replace?: boolean }) =>
      api.put<{ saved: boolean; revision: number }>(`/reports/templates/${templateId}/edits`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'edits'] }),
  });
}

export function useUploadAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<AssetSummary>('/reports/assets', form);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['assets'] }),
  });
}

export function useGenerate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { template_id: number; reference?: string; board_ids?: number[]; anonymize?: boolean; notify?: boolean; audience?: string }) =>
      api.post<ReportRun>('/reports/generate', body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs'] }),
  });
}
