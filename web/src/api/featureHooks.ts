import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, qs } from './client';
import type {
  ChangesView,
  DeckComment,
  DeckVersion,
  DeckVersionDetail,
  DigestSchedule,
  DigestView,
  ForecastView,
  HealthView,
  NotificationsView,
  NotifyChannel,
  ReplaceMatch,
  SavedView,
  SearchItem,
  WeekView,
} from './types';

// ---- RF-72 forecast

export const useSprintForecast = (sprintId?: number) =>
  useQuery({
    queryKey: ['forecast', 'sprint', sprintId],
    queryFn: () => api.get<ForecastView>(`/sprints/${sprintId}/forecast`),
    enabled: sprintId !== undefined,
  });

export const useEpicForecast = (key?: string, boardId?: number) =>
  useQuery({
    queryKey: ['forecast', 'epic', key, boardId],
    queryFn: () => api.get<ForecastView>(`/epics/${key}/forecast${qs({ board_id: boardId })}`),
    enabled: !!key,
  });

export const useBoardForecast = (boardId?: number) =>
  useQuery({
    queryKey: ['forecast', 'board', boardId],
    queryFn: () => api.get<ForecastView>(`/boards/${boardId}/forecast`),
    enabled: boardId !== undefined,
  });

// ---- RF-74 / RF-73 changes and digest

export const useChanges = (boardId?: number, since?: number | null, until?: number | null) =>
  useQuery({
    queryKey: ['changes', boardId, since ?? null, until ?? null],
    queryFn: () => api.get<ChangesView>(`/boards/${boardId}/changes${qs({ since, until })}`),
    enabled: boardId !== undefined,
  });

export const useDigest = () => useQuery({ queryKey: ['digest'], queryFn: () => api.get<DigestView>('/digest') });

// ---- RF-78 health, RF-80 search, RF-85 week

export const useHealthCheck = () => useQuery({ queryKey: ['health-check'], queryFn: () => api.get<HealthView>('/health-check') });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<{ items: SearchItem[] }>(`/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    placeholderData: (previous) => previous,
    staleTime: 10_000,
  });

export const useWeek = (accountId?: string) =>
  useQuery({
    queryKey: ['week', accountId],
    queryFn: () => api.get<WeekView>(`/people/${encodeURIComponent(accountId ?? '')}/week`),
    enabled: !!accountId,
  });

// ---- RF-75 saved views

export const useViews = () => useQuery({ queryKey: ['views'], queryFn: () => api.get<{ items: SavedView[] }>('/views') });

export function useSaveView() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (view: { id?: number; name: string; path: string; query: string; pinned: boolean }) =>
      view.id ? api.put<SavedView>(`/views/${view.id}`, view) : api.post<SavedView>('/views', view),
    onSuccess: () => client.invalidateQueries({ queryKey: ['views'] }),
  });
}

export function useDeleteView() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/views/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['views'] }),
  });
}

// ---- RF-82 cancel

export function useCancelCollection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ cancelling: string }>('/collect/cancel'),
    onSuccess: () => client.invalidateQueries({ queryKey: ['status'] }),
  });
}

// ---- RF-71 / RF-73 delivery

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api.get<NotificationsView>('/notifications') });

export function useSaveChannels() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (channels: NotifyChannel[]) => api.put<NotificationsView>('/notifications/channels', { channels }),
    onSuccess: (data) => client.setQueryData(['notifications'], data),
  });
}

export function useSaveDigestSchedule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (schedule: DigestSchedule) => api.put<NotificationsView>('/notifications/digest', schedule),
    onSuccess: (data) => client.setQueryData(['notifications'], data),
  });
}

export function useTestChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ result: { ok: boolean; error?: string } | null }>(`/notifications/channels/${id}/test`),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useSendDigest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ total_new_risks: number; sent: { space: { name: string }; new_risks: number }[] }>('/notifications/digest/send'),
    onSettled: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

// ---- RF-87 versions

export const useVersions = (templateId?: number, kind?: 'edits' | 'mapping') =>
  useQuery({
    queryKey: ['template', templateId, 'versions', kind ?? null],
    queryFn: () => api.get<{ items: DeckVersion[] }>(`/reports/templates/${templateId}/versions${qs({ kind })}`),
    enabled: templateId !== undefined,
  });

export const useVersion = (versionId?: number | null) =>
  useQuery({
    queryKey: ['version', versionId],
    queryFn: () => api.get<DeckVersionDetail>(`/reports/versions/${versionId}`),
    enabled: versionId != null,
  });

export function useNameVersion(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: 'edits' | 'mapping'; label: string; author?: string }) =>
      api.post<DeckVersion>(`/reports/templates/${templateId}/versions`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'versions'] }),
  });
}

export function useRestoreVersion(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: number; author?: string }) => api.post<{ kind: string }>(`/reports/versions/${body.id}/restore`, { author: body.author }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId] }),
  });
}

export function useDeleteVersion(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/reports/versions/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'versions'] }),
  });
}

// ---- RF-93 comments

export const useComments = (templateId?: number) =>
  useQuery({
    queryKey: ['template', templateId, 'comments'],
    queryFn: () => api.get<{ items: DeckComment[]; open: number }>(`/reports/templates/${templateId}/comments`),
    enabled: templateId !== undefined,
  });

export function useAddComment(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { origin_slide_id?: number; shape_key?: string | null; parent_id?: number; body: string; author?: string }) =>
      api.post<DeckComment>(`/reports/templates/${templateId}/comments`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'comments'] }),
  });
}

export function useResolveComment(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: number; resolved: boolean }) => api.patch<DeckComment>(`/reports/comments/${body.id}`, { resolved: body.resolved }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'comments'] }),
  });
}

export function useDeleteComment(templateId?: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/reports/comments/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['template', templateId, 'comments'] }),
  });
}

// ---- RF-88 find & replace in variables

export function useReplaceInVariables() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { find: string; replace: string; match_case: boolean; template_id?: number; apply: boolean }) =>
      api.post<{ matches: ReplaceMatch[]; count: number; applied: boolean }>('/reports/variables/replace', body),
    onSuccess: (data) => {
      if (data.applied) {
        client.invalidateQueries({ queryKey: ['variables'] });
        client.invalidateQueries({ queryKey: ['template'] });
      }
    },
  });
}
