import { describe, expect, it } from 'vitest';

import type { FocusLogDocument } from '../api/types';
import { paraApi, paraDocumento } from './focusLogStore';

const api: FocusLogDocument = {
  revision: 4,
  pessoas: [{ id: 'p1', nome: 'Ana', cargo: 'Engenheira', cor: '#0B7A75' }],
  temas: [{ nome: 'CI/CD', cor: '#2563EB', palavras: 'ci/cd' }],
  sinais: [{ nome: 'Urgente', cor: '#E11D48', palavras: 'urgente', gatilho: 'o texto cita urgência' }],
  registros: [
    { uid: 'r1', tipo: 'tarefa', nome: 'Ana', data: '2026-10-01', registro: 'Pipeline.', de_tema: null, para_tema: null, icone: null, cor_destaque: null, estilo_linha: null },
    {
      uid: 'r2',
      tipo: 'troca',
      nome: 'Ana',
      data: '2026-10-02',
      registro: 'Prioridade.',
      de_tema: 'CI/CD',
      para_tema: 'CI/CD',
      icone: '🎯',
      cor_destaque: '#6366F1',
      estilo_linha: 'borda-dupla',
    },
  ],
};

describe('paraDocumento', () => {
  it('reads dates as the page writes them and renames the change-of-focus fields', () => {
    const doc = paraDocumento(api);
    expect(doc.registros[0].data).toBe('1/10/2026');
    expect(doc.registros[1]).toMatchObject({ deTema: 'CI/CD', paraTema: 'CI/CD', icone: '🎯', corDestaque: '#6366F1', estiloLinha: 'borda-dupla' });
    expect(doc.registros[0]).not.toHaveProperty('deTema');
  });
});

describe('paraApi', () => {
  it('sends ISO dates and the API field names, and keeps the revision it was read at', () => {
    const body = paraApi(paraDocumento(api), api.revision);
    expect(body.base_revision).toBe(4);
    expect(body.registros[0]).toMatchObject({ data: '2026-10-01', de_tema: null, cor_destaque: null });
    expect(body.registros[1]).toMatchObject({ data: '2026-10-02', de_tema: 'CI/CD', para_tema: 'CI/CD', estilo_linha: 'borda-dupla' });
  });

  it('round-trips what the API stored', () => {
    const { base_revision: _revision, ...rest } = paraApi(paraDocumento(api), api.revision);
    expect(rest).toEqual({ pessoas: api.pessoas, temas: api.temas, sinais: api.sinais, registros: api.registros });
  });
});
