import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, qs, withLang } from './client';
import type {
  A11yReport,
  DeckBlock,
  DeckEdits,
  DeckQuestion,
  DeckShare,
  LibraryAsset,
  NarrativeDraft,
  PresenceEntry,
  ReportRun,
  RunComparison,
  ShapeEdit,
  SharedDeck,
  SlideHistoryEntry,
  TemplateDiagnostics,
  TemplateUsage,
} from './types';

// Hooks for the Apresentação roadmap (#7–#30). Kept apart from hooks.ts, which already carries the
// module's core; the query keys reuse ['runs'] and ['template', id] so the existing screens refresh.

/** #8, RF-70: where a deck is taken away from, as .pptx or .pdf; `force` for a refused/unapproved one. */
export const runFileUrl = (run: Pick<ReportRun, 'id'>, format: 'pptx' | 'pdf', force = false) =>
  `/api/reports/runs/${run.id}/file${qs(withLang({ format, force: force || undefined }))}`;

export const usePreviewRuns = (templateId?: number) =>
  useQuery({
    queryKey: ['runs', templateId, 'previa'],
    queryFn: () => api.get<{ items: ReportRun[] }>(`/reports/runs${qs({ template_id: templateId, kind: 'previa' })}`),
    enabled: templateId !== undefined,
  });

/** #9: the whole deck for one board, never listed among the deliveries. */
export function usePreviewRun(templateId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { board_id?: number | null; audience?: string }) =>
      api.post<ReportRun>(`/reports/templates/${templateId}/preview-run`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs', templateId, 'previa'] }),
  });
}

/** #10: regenerate some slides and/or boards of an existing deck; #27 `now` redoes it all with today's numbers. */
export function usePartialRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, slideIds, boardIds, now }: { runId: string; slideIds?: number[]; boardIds?: number[]; now?: boolean }) =>
      api.post<ReportRun>(`/reports/runs/${runId}/partial`, { slide_ids: slideIds, board_ids: boardIds, agora: now ?? false }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs'] }),
  });
}

/** #11 */
export const useCompareRuns = (beforeId?: string, afterId?: string) =>
  useQuery({
    queryKey: ['runs', 'compare', beforeId, afterId],
    queryFn: () => api.get<RunComparison>(`/reports/runs/${beforeId}/compare/${afterId}`),
    enabled: !!beforeId && !!afterId,
  });

/** #12 */
export function useReviewRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, action, note }: { runId: string; action: 'enviar' | 'aprovar' | 'reprovar' | 'reabrir'; note?: string }) =>
      api.post<ReportRun>(`/reports/runs/${runId}/review`, { acao: action, nota: note ?? '' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs'] }),
  });
}

/** #14 */
export const useShares = (runId?: string) =>
  useQuery({
    queryKey: ['shares', runId],
    queryFn: () => api.get<{ items: DeckShare[] }>(`/reports/runs/${runId}/shares`),
    enabled: !!runId,
  });

export function useCreateShare(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (days: number) => api.post<DeckShare>(`/reports/runs/${runId}/shares`, { dias: days }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shares', runId] }),
  });
}

export function useRevokeShare(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.del<void>(`/reports/shares/${token}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['shares', runId] }),
  });
}

export const useSharedDeck = (token?: string) =>
  useQuery({
    queryKey: ['public-deck', token],
    queryFn: () => api.get<SharedDeck>(`/public/decks/${token}`),
    enabled: !!token,
    retry: false,
  });

/** #15 */
export const useRunA11y = (runId?: string) =>
  useQuery({
    queryKey: ['runs', runId, 'a11y'],
    queryFn: () => api.get<A11yReport>(`/reports/runs/${runId}/accessibility`),
    enabled: !!runId,
  });

export const useTemplateA11y = (templateId?: number, enabled = true) =>
  useQuery({
    queryKey: ['template', templateId, 'a11y'],
    queryFn: () => api.get<A11yReport>(`/reports/templates/${templateId}/accessibility`),
    enabled: templateId !== undefined && enabled,
  });

/** #16 */
export const useBlocks = () =>
  useQuery({ queryKey: ['blocks'], queryFn: () => api.get<{ items: DeckBlock[] }>('/reports/blocks') });

export function useSaveBlock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; shapes: Record<string, ShapeEdit> }) =>
      api.post<DeckBlock>('/reports/blocks', { nome: body.name, descricao: body.description ?? '', formas: body.shapes }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['blocks'] }),
  });
}

export function useDeleteBlock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/reports/blocks/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['blocks'] }),
  });
}

/** #29: records that a block was just dropped onto a slide, so the library can rank favourites.
 * Fire-and-forget like `presenceBeat` — a failed count must not block the insert that triggered it. */
export const recordBlockUse = (id: number) => api.post<DeckBlock>(`/reports/blocks/${id}/use`, {});

/** #17 */
export const useAssetLibrary = (query: string, tag: string) =>
  useQuery({
    queryKey: ['assets', query, tag],
    queryFn: () => api.get<{ items: LibraryAsset[]; tags: string[] }>(`/reports/assets${qs({ q: query, tag })}`),
  });

export function useUpdateAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, label, tags }: { id: string; label?: string; tags?: string[] }) =>
      api.patch<LibraryAsset>(`/reports/assets/${id}`, { rotulo: label, etiquetas: tags }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['assets'] }),
  });
}

/** #19: a heartbeat; the answer is who else is here. */
export const presenceBeat = (templateId: number, slide: string) =>
  api.post<{ others: PresenceEntry[] }>(`/reports/templates/${templateId}/presence`, { slide });

export const presenceLeave = (templateId: number) => api.del<void>(`/reports/templates/${templateId}/presence`);

/** #20 */
export const useSlideHistory = (templateId: number, slideKey?: string) =>
  useQuery({
    queryKey: ['template', templateId, 'slide-history', slideKey],
    queryFn: () => api.get<{ items: SlideHistoryEntry[] }>(`/reports/templates/${templateId}/slides/${encodeURIComponent(slideKey ?? '')}/history`),
    enabled: !!slideKey,
  });

export function useRestoreSlide(templateId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slideKey, versionId }: { slideKey: string; versionId: number }) =>
      api.post<{ edits: DeckEdits; revision: number }>(
        `/reports/templates/${templateId}/slides/${encodeURIComponent(slideKey)}/restore`,
        { version_id: versionId },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId] }),
  });
}

/** #24 */
export const useTemplateDiagnostics = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId, 'diagnostics'],
    queryFn: () => api.get<TemplateDiagnostics>(`/reports/templates/${templateId}/diagnostics`),
    enabled: templateId !== undefined,
  });

/** #30 */
export const useTemplateUsage = (templateId?: number, enabled = true) =>
  useQuery({
    queryKey: ['template', templateId, 'usage'],
    queryFn: () => api.get<TemplateUsage>(`/reports/templates/${templateId}/usage`),
    enabled: templateId !== undefined && enabled,
  });

export const recordPresentation = (runId: string, seconds: Record<string, number>) =>
  api.post<void>(`/reports/runs/${runId}/presented`, { segundos: seconds });

/** #7 */
export const useAiStatus = () =>
  useQuery({
    queryKey: ['reports', 'ai'],
    queryFn: () => api.get<{ enabled: boolean; model: string | null }>('/reports/ai'),
    staleTime: 5 * 60_000,
  });

export const useDraftNarrative = (templateId: number) =>
  useMutation({
    mutationFn: (boardId: number) => api.post<NarrativeDraft>(`/reports/templates/${templateId}/narrative`, { board_id: boardId }),
  });

// ---------------------------------------------------------------- audience Q&A, Slides parity

/** Polled while `PresentMode`'s questions panel is open, so incoming questions show up live. */
export const useQuestions = (runId?: string, live = false) =>
  useQuery({
    queryKey: ['runs', runId, 'questions'],
    queryFn: () => api.get<{ items: DeckQuestion[] }>(`/reports/runs/${runId}/questions`),
    enabled: runId !== undefined,
    refetchInterval: live ? 4000 : false,
  });

export function useAskQuestion(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<DeckQuestion>(`/reports/runs/${runId}/questions`, { texto: text }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs', runId, 'questions'] }),
  });
}

export function useAnswerQuestion(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, answered }: { id: number; answered: boolean }) =>
      api.patch<DeckQuestion>(`/reports/questions/${id}`, { respondida: answered }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs', runId, 'questions'] }),
  });
}

export function useDeleteQuestion(runId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<void>(`/reports/questions/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['runs', runId, 'questions'] }),
  });
}
