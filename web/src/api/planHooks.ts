import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type { EpicPlanView, PlanAlgorithm, PlanMember, PlanMembersView, PlanParameters, PlanResult, PlanRole } from './types';

// Every write below can change any section of the plan page, so each one refreshes the whole
// read model rather than patching pieces of it.
const PLAN = ['epic-plan'] as const;

export const useEpicPlan = (key?: string) =>
  useQuery({
    queryKey: [...PLAN, key],
    queryFn: () => api.get<EpicPlanView>(`/epics/${encodeURIComponent(key ?? '')}/plan`),
    enabled: !!key,
  });

export const useAlgorithms = () =>
  useQuery({
    queryKey: ['plan-algorithms'],
    queryFn: () => api.get<{ items: PlanAlgorithm[] }>('/planning/algorithms'),
    staleTime: Infinity,
  });

export const useRoles = () => useQuery({ queryKey: ['plan-roles'], queryFn: () => api.get<{ items: PlanRole[] }>('/roles') });

export const useMembers = () => useQuery({ queryKey: ['plan-members'], queryFn: () => api.get<PlanMembersView>('/members') });

function useRefreshing<TInput, TOutput>(mutationFn: (input: TInput) => Promise<TOutput>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: PLAN }),
        client.invalidateQueries({ queryKey: ['plan-roles'] }),
        client.invalidateQueries({ queryKey: ['plan-members'] }),
        client.invalidateQueries({ queryKey: ['plan-parameters'] }),
      ]),
  });
}

export type RoleInput = Pick<PlanRole, 'nome' | 'descricao' | 'cor' | 'ordem' | 'rotulos'> & { id?: number };

export const useSaveRole = () =>
  useRefreshing((role: RoleInput) =>
    role.id ? api.put<PlanRole>(`/roles/${role.id}`, role) : api.post<PlanRole>('/roles', role),
  );

export const useDeleteRole = () => useRefreshing((id: number) => api.del<void>(`/roles/${id}`));

export interface MemberInput {
  id: string;
  ativo: boolean;
  papeis: { papel_id: number; senioridade: string }[];
}

export const useSaveMember = () =>
  useRefreshing((member: MemberInput) =>
    api.put<PlanMember>(`/members/${encodeURIComponent(member.id)}`, { ativo: member.ativo, papeis: member.papeis }),
  );

export const useDeleteMember = () => useRefreshing((id: string) => api.del<void>(`/members/${encodeURIComponent(id)}`));

/** Global to the whole plan: shared by every epic, so it lives in Configuração and not inside any one of them. */
export const usePlanParameters = () =>
  useQuery({ queryKey: ['plan-parameters'], queryFn: () => api.get<PlanParameters>('/planning/parameters') });

export const useSavePlanParameters = () =>
  useRefreshing((values: Partial<PlanParameters>) => api.put<PlanParameters>('/planning/parameters', values));

/** The one member selection, shared by the capacity and the planning sections. */
export function useSetSelection(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.put<{ selecao: string[] }>(`/epics/${encodeURIComponent(key)}/plan/selection`, { membros_ids: ids }),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey: [...PLAN, key] });
      const previous = client.getQueryData<EpicPlanView>([...PLAN, key]);
      if (previous) client.setQueryData<EpicPlanView>([...PLAN, key], { ...previous, selecao: ids });
      return { previous };
    },
    onError: (_error, _ids, context) => {
      if (context?.previous) client.setQueryData([...PLAN, key], context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: [...PLAN, key] }),
  });
}

export interface PlanRequest {
  epico: string;
  algoritmo: string;
  membros_ids: string[];
  limite_tempo_s?: number;
}

export function useGeneratePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: PlanRequest) => api.post<PlanResult>('/planning', request),
    onSuccess: (_result, request) => client.invalidateQueries({ queryKey: [...PLAN, request.epico] }),
  });
}

/** Choose a subtask's role(s) by hand; ``[]`` returns it to the automatic answer. */
export const useSetSubtaskRoles = () =>
  useRefreshing(({ key, roles }: { key: string; roles: number[] }) =>
    api.put<{ subtarefa: string; papeis: number[] }>(`/subtasks/${encodeURIComponent(key)}/roles`, { papeis: roles }),
  );
