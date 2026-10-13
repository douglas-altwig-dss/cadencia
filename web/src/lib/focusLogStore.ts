import { notifications } from '@mantine/notifications';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '../api/client';
import { saveFocusLog, useFocusLogDocument } from '../api/focusLogHooks';
import type { FocusLogDocument } from '../api/types';
import { brDeIso, type Documento, type Registro, isoDeBr } from './focusLog';

/** How long the log waits after the last change before it saves, so typing is not a request per key. */
export const SAVE_DELAY_MS = 400;
const LIMITE_HISTORICO = 50;

/** The API's document as the page works on it: dates as people write them, fields in the page's names. */
export function paraDocumento(api: FocusLogDocument): Documento {
  return {
    pessoas: api.pessoas.map((p) => ({ ...p })),
    temas: api.temas.map((t) => ({ ...t })),
    sinais: api.sinais.map((s) => ({ ...s })),
    registros: api.registros.map((r): Registro => {
      const registro: Registro = {
        uid: r.uid,
        tipo: r.tipo,
        nome: r.nome,
        data: brDeIso(r.data),
        registro: r.registro,
      };
      if (r.de_tema) registro.deTema = r.de_tema;
      if (r.para_tema) registro.paraTema = r.para_tema;
      if (r.icone) registro.icone = r.icone;
      if (r.cor_destaque) registro.corDestaque = r.cor_destaque;
      if (r.estilo_linha) registro.estiloLinha = r.estilo_linha;
      return registro;
    }),
  };
}

/** The page's document as the API stores it, against the revision the page started from. */
export function paraApi(doc: Documento, baseRevision: number) {
  return {
    base_revision: baseRevision,
    pessoas: doc.pessoas.map((p) => ({ id: p.id, nome: p.nome, cargo: p.cargo, cor: p.cor })),
    temas: doc.temas.map((t) => ({ nome: t.nome, cor: t.cor, palavras: t.palavras })),
    sinais: doc.sinais.map((s) => ({ nome: s.nome, cor: s.cor, palavras: s.palavras, gatilho: s.gatilho })),
    registros: doc.registros.map((r) => ({
      uid: r.uid,
      tipo: r.tipo,
      nome: r.nome,
      data: isoDeBr(r.data),
      registro: r.registro,
      de_tema: r.deTema ?? null,
      para_tema: r.paraTema ?? null,
      icone: r.icone ?? null,
      cor_destaque: r.corDestaque ?? null,
      estilo_linha: r.estiloLinha ?? null,
    })),
  };
}

interface Estado {
  doc: Documento | null;
  revision: number;
  past: Documento[];
  future: Documento[];
  /** Changed since the last save that reached the server. */
  dirty: boolean;
  /** Another save got there first: stop saving over it until the page is reloaded. */
  conflito: boolean;
}

/**
 * The focus log, loaded from and saved to the API. Edits apply at once; the server gets the whole document
 * a moment after the last one, against the revision it was read at. Undo and redo walk the page's own
 * history of documents, and each one saves like any other change.
 */
export function useFocusLog() {
  const query = useFocusLogDocument();
  const [estado, setEstado] = useState<Estado>({ doc: null, revision: 0, past: [], future: [], dirty: false, conflito: false });
  const salvando = useRef(false);

  // The first load becomes the document; a refetch after that never replaces the edits in progress.
  useEffect(() => {
    if (query.data && estado.doc === null) {
      setEstado((s) => ({ ...s, doc: paraDocumento(query.data), revision: query.data.revision }));
    }
  }, [query.data, estado.doc]);

  const { doc, revision, dirty, conflito } = estado;
  useEffect(() => {
    if (!dirty || !doc || conflito) return;
    const timer = window.setTimeout(async () => {
      if (salvando.current) return;
      salvando.current = true;
      try {
        const saved = await saveFocusLog(paraApi(doc, revision));
        // Edits made while the request was on its way keep the log dirty and go out with the next save.
        setEstado((s) => ({ ...s, revision: saved.revision, dirty: s.doc !== doc }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setEstado((s) => ({ ...s, conflito: true }));
          notifications.show({
            color: 'orange',
            title: 'A timeline mudou em outro lugar',
            message: 'Recarregue a página para pegar a versão atual. Suas últimas mudanças ainda não foram salvas.',
          });
        } else {
          notifications.show({
            color: 'red',
            title: 'Não foi possível salvar',
            message: error instanceof ApiError ? error.reason : 'Tente de novo em instantes.',
          });
        }
      } finally {
        salvando.current = false;
      }
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, revision, dirty, conflito]);

  const commit = useCallback((change: (doc: Documento) => Documento) => {
    setEstado((s) => {
      if (!s.doc) return s;
      const next = change(s.doc);
      if (next === s.doc) return s;
      return { ...s, doc: next, past: [...s.past, s.doc].slice(-LIMITE_HISTORICO), future: [], dirty: true };
    });
  }, []);

  const undo = useCallback(() => {
    setEstado((s) => {
      const previous = s.past[s.past.length - 1];
      if (!s.doc || !previous) return s;
      return { ...s, doc: previous, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: true };
    });
  }, []);

  const redo = useCallback(() => {
    setEstado((s) => {
      const [next, ...future] = s.future;
      if (!s.doc || !next) return s;
      return { ...s, doc: next, past: [...s.past, s.doc], future, dirty: true };
    });
  }, []);

  return {
    doc: estado.doc,
    loading: query.isLoading,
    error: query.error,
    saving: estado.dirty && !estado.conflito,
    conflito: estado.conflito,
    commit,
    undo,
    redo,
    canUndo: estado.past.length > 0,
    canRedo: estado.future.length > 0,
  };
}

export type FocusLog = ReturnType<typeof useFocusLog>;
