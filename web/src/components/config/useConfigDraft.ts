import { useCallback, useMemo, useState } from 'react';

import type { ConfigField, ConfigValue } from '../../api/types';
import {
  REMOVE_SECRET,
  changedValues,
  displayValue,
  fieldErrorOf,
  localErrors,
  secretState,
  type Edits,
  type LocalError,
  type SecretState,
} from '../../lib/config';

/**
 * The edits of one set of runtime fields before they are saved. Only touched keys are kept, laid
 * over the server's view, so a refetch never throws an edit away and an untouched field always
 * shows what is really stored. Settings' cards and the configuration wizard's steps both use it.
 */
export function useConfigDraft(fields: ConfigField[]) {
  const [edits, setEdits] = useState<Edits>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const changed = useMemo(() => changedValues(fields, edits), [fields, edits]);
  const local = useMemo(() => localErrors(fields, edits), [fields, edits]);

  const clearError = (key: string) =>
    setServerErrors((previous) => {
      if (!(key in previous)) return previous;
      const { [key]: _gone, ...rest } = previous;
      return rest;
    });

  const set = useCallback((key: string, value: ConfigValue) => {
    setEdits((previous) => ({ ...previous, [key]: value }));
    clearError(key);
  }, []);

  /** Drops one key's edit, so it shows the server's value again. */
  const forget = useCallback((key: string) => {
    setEdits((previous) => {
      if (!(key in previous)) return previous;
      const { [key]: _gone, ...rest } = previous;
      return rest;
    });
    clearError(key);
  }, []);

  const discard = useCallback(() => {
    setEdits({});
    setServerErrors({});
  }, []);

  /** Puts a 400 that names one of these fields under that field; false when it names none of them. */
  const takeError = useCallback(
    (error: unknown): boolean => {
      const found = fieldErrorOf(error);
      if (!found || !fields.some((field) => field.key === found.field)) return false;
      setServerErrors({ [found.field]: found.message });
      return true;
    },
    [fields],
  );

  const dirtyCount = Object.keys(changed).length;
  return {
    fields,
    edits,
    /** The body of `PUT /config`: only what really changed. */
    changed,
    dirtyCount,
    isDirty: dirtyCount > 0,
    /** No problem the browser can see on its own; the server checks the rest. */
    valid: Object.keys(local).length === 0,
    localErrors: local as Record<string, LocalError>,
    serverErrors,
    value: (field: ConfigField) => displayValue(field, edits),
    secretState: (field: ConfigField): SecretState => secretState(field, edits),
    set,
    /** Marks a saved secret for removal; the save sends `""`. */
    removeSecret: (key: string) => set(key, REMOVE_SECRET),
    forget,
    discard,
    takeError,
  };
}

export type ConfigDraft = ReturnType<typeof useConfigDraft>;
