import { useQuery } from '@tanstack/react-query';

import { api } from './client';
import type { FocusLogDocument } from './types';

/** The Timeline de foco's whole document. It is saved as a whole, against the revision it was read at. */
export const focusLogKey = ['focus-log'] as const;

export const useFocusLogDocument = () =>
  useQuery({
    queryKey: focusLogKey,
    queryFn: () => api.get<FocusLogDocument>('/focus-log'),
    // The editor is the only writer while it is open; refetching under it would replace unsaved edits.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const saveFocusLog = (body: Omit<FocusLogDocument, 'revision'> & { base_revision: number }) =>
  api.put<FocusLogDocument & { saved: true }>('/focus-log', body);
