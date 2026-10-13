import {
  ActionIcon,
  Button,
  ColorInput,
  Drawer,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useT } from '../../i18n';

import {
  brDeIso,
  contagemPorPessoa,
  type Documento,
  type EstiloLinha,
  estilosLinha,
  type Entrada,
  ICONES_TROCA,
  isoDeBr,
  isoOf,
  norm,
  PALETA_DESTAQUE,
  PALETA_PESSOAS,
  PAUSA,
  type Pessoa,
  type Sinal,
  type Registro,
  rotuloTema,
  type Tema,
} from '../../lib/focusLog';
import { useConfirm } from '../common';
import { TrocaCard } from './FocusCards';

export type Commit = (change: (doc: Documento) => Documento) => void;

const uid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const hojeIso = () => isoOf(new Date());

/* ---------------------------------------------------------------- Equipe */

export function EquipeDrawer({
  opened,
  onClose,
  documento,
  entradas,
  commit,
  onRenamed,
  onRemoved,
}: {
  opened: boolean;
  onClose: () => void;
  documento: Documento;
  entradas: Entrada[];
  commit: Commit;
  onRenamed: (antigo: string, novo: string) => void;
  onRemoved: (nome: string) => void;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Pessoa | 'nova' | null>(null);
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [cor, setCor] = useState(PALETA_PESSOAS[0]);

  const start = (pessoa: Pessoa | 'nova') => {
    setEditing(pessoa);
    setNome(pessoa === 'nova' ? '' : pessoa.nome);
    setCargo(pessoa === 'nova' ? '' : pessoa.cargo);
    setCor(pessoa === 'nova' ? PALETA_PESSOAS[0] : pessoa.cor);
  };

  const save = () => {
    const limpo = nome.trim();
    if (!limpo) return;
    const self = editing && editing !== 'nova' ? editing.id : null;
    const repetido = documento.pessoas.some((p) => norm(p.nome) === norm(limpo) && p.id !== self);
    if (repetido) {
      notifications.show({ message: t.people.focus.team.duplicate, color: 'red' });
      return;
    }
    if (editing === 'nova') {
      commit((d) => ({ ...d, pessoas: [...d.pessoas, { id: `p_${uid()}`, nome: limpo, cargo: cargo.trim(), cor }] }));
      notifications.show({ message: t.people.focus.team.added });
    } else if (editing) {
      const antigo = editing.nome;
      commit((d) => ({
        ...d,
        pessoas: d.pessoas.map((p) => (p.id === editing.id ? { ...p, nome: limpo, cargo: cargo.trim(), cor } : p)),
        registros: d.registros.map((r) => (r.nome === antigo ? { ...r, nome: limpo } : r)),
      }));
      if (antigo !== limpo) onRenamed(antigo, limpo);
      notifications.show({ message: t.people.focus.team.updated });
    }
    setEditing(null);
  };

  const remove = async (pessoa: Pessoa) => {
    const quantas = contagemPorPessoa(entradas, pessoa.nome);
    if (quantas > 0) {
      const ok = await confirm({
        title: t.people.focus.team.removeTitle(pessoa.nome),
        body: t.people.focus.team.removeBody(pessoa.nome, quantas),
        confirmLabel: t.people.focus.team.removeConfirm,
      });
      if (!ok) return;
    }
    commit((d) => ({ ...d, pessoas: d.pessoas.filter((p) => p.id !== pessoa.id) }));
    onRemoved(pessoa.nome);
    notifications.show({ message: t.people.focus.team.removed });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title={t.people.focus.page.team}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t.people.focus.team.intro}
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'nova' ? t.people.focus.team.add : t.people.common.edit(editing.nome)}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label={t.people.common.name} value={nome} onChange={(e) => setNome(e.currentTarget.value)} placeholder={t.people.focus.team.namePlaceholder} required />
              <TextInput label={t.people.focus.team.role} value={cargo} onChange={(e) => setCargo(e.currentTarget.value)} placeholder={t.people.focus.team.rolePlaceholder} />
            </SimpleGrid>
            <ColorInput label={t.people.focus.team.laneColor} value={cor} onChange={setCor} swatches={PALETA_PESSOAS} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                {editing === 'nova' ? t.people.focus.team.register : t.people.focus.team.saveChanges}
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                {t.people.common.cancel}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('nova')} style={{ alignSelf: 'flex-start' }}>
            {t.people.focus.team.add}
          </Button>
        )}

        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            {t.people.focus.team.members(documento.pessoas.length)}
          </Text>
          {documento.pessoas.map((p) => {
            const quantas = contagemPorPessoa(entradas, p.nome);
            return (
              <Group key={p.id} justify="space-between" wrap="nowrap" className="tf-person-row">
                <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                  <span className="tf-avatar" style={{ background: p.cor }} aria-hidden>
                    {p.nome.slice(0, 2).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {p.nome}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {p.cargo || t.people.focus.page.member} · {t.people.focus.page.activities(quantas)}
                    </Text>
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" color="gray" aria-label={t.people.common.edit(p.nome)} onClick={() => start(p)}>
                    <IconPencil size={15} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" aria-label={t.people.common.remove(p.nome)} onClick={() => remove(p)}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Group>
              </Group>
            );
          })}
        </Stack>
      </Stack>
      {dialog}
    </Drawer>
  );
}

/* ----------------------------------------------------------------- Temas */

export function TemasDrawer({
  opened,
  onClose,
  documento,
  commit,
  onRenamed,
  onRemoved,
}: {
  opened: boolean;
  onClose: () => void;
  documento: Documento;
  commit: Commit;
  onRenamed: (antigo: string, novo: string) => void;
  onRemoved: (nome: string) => void;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Tema | 'novo' | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(PALETA_DESTAQUE[0]);
  const [palavras, setPalavras] = useState('');

  const start = (tema: Tema | 'novo') => {
    setEditing(tema);
    setNome(tema === 'novo' ? '' : tema.nome);
    setCor(tema === 'novo' ? PALETA_DESTAQUE[0] : tema.cor);
    setPalavras(tema === 'novo' ? '' : tema.palavras);
  };

  const save = () => {
    const limpo = nome.trim();
    if (!limpo || !editing) return;
    const repetido = documento.temas.some((t) => norm(t.nome) === norm(limpo) && t !== editing);
    if (repetido) {
      notifications.show({ message: t.people.focus.themes.duplicate, color: 'red' });
      return;
    }
    const novo: Tema = { nome: limpo, cor, palavras: palavras.trim() };
    if (editing === 'novo') {
      commit((d) => ({ ...d, temas: [...d.temas, novo] }));
    } else {
      const antigo = editing.nome;
      commit((d) => ({
        ...d,
        temas: d.temas.map((t) => (t === editing ? novo : t)),
        registros: d.registros.map((r) => ({
          ...r,
          deTema: r.deTema === antigo ? limpo : r.deTema,
          paraTema: r.paraTema === antigo ? limpo : r.paraTema,
        })),
      }));
      if (antigo !== limpo) onRenamed(antigo, limpo);
    }
    notifications.show({ message: t.people.focus.themes.saved });
    setEditing(null);
  };

  const remove = async (tema: Tema) => {
    const ok = await confirm({
      title: t.people.focus.themes.removeTitle(tema.nome),
      body: t.people.focus.themes.removeBody,
      confirmLabel: t.people.focus.themes.removeConfirm,
    });
    if (!ok) return;
    commit((d) => ({ ...d, temas: d.temas.filter((t) => t !== tema) }));
    onRemoved(tema.nome);
    notifications.show({ message: t.people.focus.themes.removed });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title={t.people.focus.page.themes}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t.people.focus.themes.intro}
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'novo' ? t.people.focus.themes.new : t.people.common.edit(editing.nome)}
            </Text>
            <TextInput label={t.people.common.name} value={nome} onChange={(e) => setNome(e.currentTarget.value)} required />
            <TextInput
              label={t.people.focus.themes.words}
              description={t.people.focus.themes.commaSeparated}
              value={palavras}
              onChange={(e) => setPalavras(e.currentTarget.value)}
            />
            <ColorInput label={t.people.common.color} value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                {t.people.focus.themes.save}
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                {t.people.common.cancel}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('novo')} style={{ alignSelf: 'flex-start' }}>
            {t.people.focus.themes.new}
          </Button>
        )}

        <Stack gap="xs">
          {documento.temas.map((tema) => (
            <Group key={tema.nome} justify="space-between" wrap="nowrap" className="tf-person-row">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                <span className="tf-dot" style={{ background: tema.cor, width: 12, height: 12 }} aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {tema.nome}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {tema.palavras || t.people.focus.themes.noWords}
                  </Text>
                </div>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label={t.people.common.edit(tema.nome)} onClick={() => start(tema)}>
                  <IconPencil size={15} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label={t.people.common.remove(tema.nome)} onClick={() => remove(tema)}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
      {dialog}
    </Drawer>
  );
}

/* ---------------------------------------------------------------- Sinais */

export function SinaisDrawer({
  opened,
  onClose,
  documento,
  commit,
  onRenamed,
  onRemoved,
}: {
  opened: boolean;
  onClose: () => void;
  documento: Documento;
  commit: Commit;
  onRenamed: (antigo: string, novo: string) => void;
  onRemoved: (nome: string) => void;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [editing, setEditing] = useState<Sinal | 'novo' | null>(null);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(PALETA_DESTAQUE[0]);
  const [palavras, setPalavras] = useState('');
  const [gatilho, setGatilho] = useState('');

  const start = (sinal: Sinal | 'novo') => {
    setEditing(sinal);
    setNome(sinal === 'novo' ? '' : sinal.nome);
    setCor(sinal === 'novo' ? PALETA_DESTAQUE[0] : sinal.cor);
    setPalavras(sinal === 'novo' ? '' : sinal.palavras);
    setGatilho(sinal === 'novo' ? '' : sinal.gatilho);
  };

  const save = () => {
    const limpo = nome.trim();
    if (!limpo || !editing) return;
    const repetido = documento.sinais.some((s) => norm(s.nome) === norm(limpo) && s !== editing);
    if (repetido) {
      notifications.show({ message: t.people.focus.signals.duplicate, color: 'red' });
      return;
    }
    const novo: Sinal = { nome: limpo, cor, palavras: palavras.trim(), gatilho: gatilho.trim() };
    if (editing === 'novo') {
      commit((d) => ({ ...d, sinais: [...d.sinais, novo] }));
    } else {
      const antigo = editing.nome;
      commit((d) => ({ ...d, sinais: d.sinais.map((s) => (s === editing ? novo : s)) }));
      if (antigo !== limpo) onRenamed(antigo, limpo);
    }
    notifications.show({ message: t.people.focus.signals.saved });
    setEditing(null);
  };

  const remove = async (sinal: Sinal) => {
    const ok = await confirm({
      title: t.people.focus.signals.removeTitle(sinal.nome),
      body: t.people.focus.signals.removeBody,
      confirmLabel: t.people.focus.signals.removeConfirm,
    });
    if (!ok) return;
    commit((d) => ({ ...d, sinais: d.sinais.filter((s) => s !== sinal) }));
    onRemoved(sinal.nome);
    notifications.show({ message: t.people.focus.signals.removed });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title={t.people.focus.page.signals}>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t.people.focus.signals.intro}
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'novo' ? t.people.focus.signals.new : t.people.common.edit(editing.nome)}
            </Text>
            <TextInput label={t.people.common.name} value={nome} onChange={(e) => setNome(e.currentTarget.value)} required />
            <TextInput
              label={t.people.focus.themes.words}
              description={t.people.focus.signals.wordsHint}
              value={palavras}
              onChange={(e) => setPalavras(e.currentTarget.value)}
            />
            <TextInput label={t.people.focus.signals.meaning} description={t.people.focus.signals.meaningHint} value={gatilho} onChange={(e) => setGatilho(e.currentTarget.value)} />
            <ColorInput label={t.people.common.color} value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                {t.people.focus.signals.save}
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                {t.people.common.cancel}
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('novo')} style={{ alignSelf: 'flex-start' }}>
            {t.people.focus.signals.new}
          </Button>
        )}

        <Stack gap="xs">
          {documento.sinais.map((s) => (
            <Group key={s.nome} justify="space-between" wrap="nowrap" className="tf-person-row">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                <span className="tf-dot" style={{ background: s.cor, width: 12, height: 12 }} aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {s.nome}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {s.gatilho || s.palavras || t.people.focus.signals.noWords}
                  </Text>
                </div>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label={t.people.common.edit(s.nome)} onClick={() => start(s)}>
                  <IconPencil size={15} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label={t.people.common.remove(s.nome)} onClick={() => remove(s)}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
      {dialog}
    </Drawer>
  );
}

/* ------------------------------------------------------- Troca de foco */

export function TrocaModal({
  opened,
  onClose,
  documento,
  inicial,
  seed,
  commit,
}: {
  opened: boolean;
  onClose: () => void;
  documento: Documento;
  /** The shift being edited, or null for a new one. */
  inicial: Registro | null;
  seed?: Partial<Registro>;
  commit: Commit;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const base = inicial ?? seed ?? {};
  const temas = documento.temas.map((t) => t.nome);
  const [nome, setNome] = useState(base.nome ?? documento.pessoas[0]?.nome ?? '');
  const [data, setData] = useState(() => (base.data ? isoDeBr(base.data) : hojeIso()));
  const [de, setDe] = useState(base.deTema ?? temas[0] ?? PAUSA);
  const [para, setPara] = useState(base.paraTema ?? temas[1] ?? temas[0] ?? '');
  const [icone, setIcone] = useState(base.icone ?? '🔀');
  const [cor, setCor] = useState(base.corDestaque ?? '#6366F1');
  const [estilo, setEstilo] = useState<EstiloLinha>(base.estiloLinha ?? 'borda-gradiente');
  const [motivo, setMotivo] = useState(base.registro ?? '');

  const opcoesDe = [...temas, PAUSA].map((value) => ({ value, label: rotuloTema(value) }));
  const pessoasOpcoes = documento.pessoas.map((p) => ({ value: p.nome, label: p.nome }));

  const save = () => {
    if (!nome || !data || !para) return;
    const payload: Registro = {
      uid: inicial?.uid ?? uid(),
      tipo: 'troca',
      nome,
      data: brDeIso(data),
      deTema: de,
      paraTema: para,
      icone,
      corDestaque: cor,
      estiloLinha: estilo,
      registro: motivo.trim(),
    };
    commit((d) => ({
      ...d,
      registros: inicial ? d.registros.map((r) => (r.uid === inicial.uid ? payload : r)) : [...d.registros, payload],
    }));
    notifications.show({ message: t.people.focus.shift.saved });
    onClose();
  };

  const remove = async () => {
    if (!inicial) return;
    const ok = await confirm({
      title: t.people.focus.shift.deleteTitle,
      body: t.people.focus.shift.deleteBody,
      confirmLabel: t.people.focus.shift.deleteConfirm,
    });
    if (!ok) return;
    commit((d) => ({ ...d, registros: d.registros.filter((r) => r.uid !== inicial.uid) }));
    notifications.show({ message: t.people.focus.shift.removed });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t.people.focus.page.shift} size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t.people.focus.shift.member} data={pessoasOpcoes} value={nome} onChange={(v) => setNome(v ?? '')} allowDeselect={false} />
          <TextInput label={t.people.focus.shift.date} type="date" value={data} onChange={(e) => setData(e.currentTarget.value)} />
          <Select label={t.people.focus.shift.fromTheme} data={opcoesDe} value={de} onChange={(v) => setDe(v ?? PAUSA)} allowDeselect={false} />
          <Select label={t.people.focus.shift.toTheme} data={temas} value={para} onChange={(v) => setPara(v ?? '')} allowDeselect={false} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <div>
            <Text size="sm" fw={500} mb={4}>
              {t.people.focus.shift.icon}
            </Text>
            <Group gap={6}>
              {ICONES_TROCA.map((ic) => (
                <Button
                  key={ic}
                  variant={icone === ic ? 'filled' : 'default'}
                  size="compact-md"
                  aria-pressed={icone === ic}
                  aria-label={t.people.focus.shift.iconAria(ic)}
                  onClick={() => setIcone(ic)}
                >
                  {ic}
                </Button>
              ))}
            </Group>
          </div>
          <Select label={t.people.focus.shift.borderStyle} data={estilosLinha()} value={estilo} onChange={(v) => setEstilo((v ?? 'borda-gradiente') as EstiloLinha)} allowDeselect={false} />
        </SimpleGrid>

        <ColorInput label={t.people.focus.shift.highlightColor} value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
        <Textarea label={t.people.focus.shift.reason} rows={2} value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} placeholder={t.people.focus.shift.reasonPlaceholder} />

        <div className="tf-form-box">
          <Text size="xs" c="dimmed" mb={6} tt="uppercase" fw={600}>
            {t.people.focus.shift.preview}
          </Text>
          <TrocaCard icone={icone} cor={cor} estilo={estilo} de={de} para={para || '—'} texto={motivo.trim()} />
        </div>

        <Group justify={inicial ? 'space-between' : 'flex-end'} gap="xs">
          {inicial && (
            <Button color="red" variant="light" onClick={remove}>
              {t.people.common.delete}
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t.people.common.cancel}
            </Button>
            <Button onClick={save} disabled={!nome || !para}>
              {t.people.focus.shift.save}
            </Button>
          </Group>
        </Group>
      </Stack>
      {dialog}
    </Modal>
  );
}

/* --------------------------------------------------------- Atividade */

export function AtividadeModal({
  opened,
  onClose,
  documento,
  inicial,
  pessoa,
  commit,
}: {
  opened: boolean;
  onClose: () => void;
  documento: Documento;
  inicial: Registro | null;
  pessoa?: string;
  commit: Commit;
}) {
  const t = useT();
  const { confirm, dialog } = useConfirm();
  const [nome, setNome] = useState(inicial?.nome ?? pessoa ?? documento.pessoas[0]?.nome ?? '');
  const [data, setData] = useState(() => (inicial ? isoDeBr(inicial.data) : hojeIso()));
  const [texto, setTexto] = useState(inicial?.registro ?? '');

  const save = () => {
    const limpo = texto.trim();
    if (!nome || !data || !limpo) return;
    const payload: Registro = { uid: inicial?.uid ?? uid(), tipo: 'tarefa', nome, data: brDeIso(data), registro: limpo };
    commit((d) => ({
      ...d,
      registros: inicial ? d.registros.map((r) => (r.uid === inicial.uid ? payload : r)) : [...d.registros, payload],
    }));
    notifications.show({ message: inicial ? t.people.focus.activity.updated : t.people.focus.activity.added });
    onClose();
  };

  const remove = async () => {
    if (!inicial) return;
    const ok = await confirm({
      title: t.people.focus.activity.deleteTitle,
      body: t.people.focus.activity.deleteBody,
      confirmLabel: t.people.focus.activity.deleteConfirm,
    });
    if (!ok) return;
    commit((d) => ({ ...d, registros: d.registros.filter((r) => r.uid !== inicial.uid) }));
    notifications.show({ message: t.people.focus.activity.removed });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={inicial ? t.people.focus.cards.editActivity : t.people.focus.activity.newTitle} size="md">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t.people.focus.activity.owner} data={documento.pessoas.map((p) => ({ value: p.nome, label: p.nome }))} value={nome} onChange={(v) => setNome(v ?? '')} allowDeselect={false} />
          <TextInput label={t.people.focus.sort.data} type="date" value={data} onChange={(e) => setData(e.currentTarget.value)} />
        </SimpleGrid>
        <Textarea
          label={t.people.common.description}
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          placeholder={t.people.focus.activity.placeholder}
          autosize
        />
        <Text size="xs" c="dimmed">
          {t.people.focus.activity.splitNote}
        </Text>
        <Group justify={inicial ? 'space-between' : 'flex-end'} gap="xs">
          {inicial && (
            <Button color="red" variant="light" onClick={remove}>
              {t.people.common.delete}
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              {t.people.common.cancel}
            </Button>
            <Button onClick={save} disabled={!nome || !texto.trim()}>
              {inicial ? t.people.common.save : t.people.common.add}
            </Button>
          </Group>
        </Group>
      </Stack>
      {dialog}
    </Modal>
  );
}
