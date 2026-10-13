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

import {
  brDeIso,
  contagemPorPessoa,
  type Documento,
  type EstiloLinha,
  ESTILOS_LINHA,
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
      notifications.show({ message: 'Já existe um membro com este nome.', color: 'red' });
      return;
    }
    if (editing === 'nova') {
      commit((d) => ({ ...d, pessoas: [...d.pessoas, { id: `p_${uid()}`, nome: limpo, cargo: cargo.trim(), cor }] }));
      notifications.show({ message: 'Membro adicionado.' });
    } else if (editing) {
      const antigo = editing.nome;
      commit((d) => ({
        ...d,
        pessoas: d.pessoas.map((p) => (p.id === editing.id ? { ...p, nome: limpo, cargo: cargo.trim(), cor } : p)),
        registros: d.registros.map((r) => (r.nome === antigo ? { ...r, nome: limpo } : r)),
      }));
      if (antigo !== limpo) onRenamed(antigo, limpo);
      notifications.show({ message: 'Membro atualizado.' });
    }
    setEditing(null);
  };

  const remove = async (pessoa: Pessoa) => {
    const quantas = contagemPorPessoa(entradas, pessoa.nome);
    if (quantas > 0) {
      const ok = await confirm({
        title: `Remover ${pessoa.nome}?`,
        body: `${pessoa.nome} tem ${quantas} ${quantas === 1 ? 'atividade' : 'atividades'} no registro. As linhas continuam guardadas, só deixam de aparecer na grade.`,
        confirmLabel: 'Remover membro',
      });
      if (!ok) return;
    }
    commit((d) => ({ ...d, pessoas: d.pessoas.filter((p) => p.id !== pessoa.id) }));
    onRemoved(pessoa.nome);
    notifications.show({ message: 'Membro removido.' });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="Equipe">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Membros são as raias da grade. Quem não está aqui não aparece, e uma linha que cita um nome sem membro cadastrado fica em Geral.
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'nova' ? 'Adicionar membro' : `Editar ${editing.nome}`}
            </Text>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <TextInput label="Nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} placeholder="Ex: Mariana" required />
              <TextInput label="Cargo ou papel" value={cargo} onChange={(e) => setCargo(e.currentTarget.value)} placeholder="Ex: Engenheira de dados" />
            </SimpleGrid>
            <ColorInput label="Cor da raia" value={cor} onChange={setCor} swatches={PALETA_PESSOAS} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                {editing === 'nova' ? 'Cadastrar membro' : 'Salvar alterações'}
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('nova')} style={{ alignSelf: 'flex-start' }}>
            Adicionar membro
          </Button>
        )}

        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Membros ({documento.pessoas.length})
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
                      {p.cargo || 'Membro'} · {quantas} {quantas === 1 ? 'atividade' : 'atividades'}
                    </Text>
                  </div>
                </Group>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" color="gray" aria-label={`Editar ${p.nome}`} onClick={() => start(p)}>
                    <IconPencil size={15} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" aria-label={`Remover ${p.nome}`} onClick={() => remove(p)}>
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
      notifications.show({ message: 'Já existe um tema com este nome.', color: 'red' });
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
    notifications.show({ message: 'Tema salvo. As palavras valem para as próximas leituras.' });
    setEditing(null);
  };

  const remove = async (tema: Tema) => {
    const ok = await confirm({
      title: `Remover o tema ${tema.nome}?`,
      body: 'As linhas que o citam continuam como estão; só deixam de ser filtradas por ele.',
      confirmLabel: 'Remover tema',
    });
    if (!ok) return;
    commit((d) => ({ ...d, temas: d.temas.filter((t) => t !== tema) }));
    onRemoved(tema.nome);
    notifications.show({ message: 'Tema removido.' });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="Temas">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Temas dizem sobre o que é o trabalho. Você cadastra cada um com as palavras que o identificam: uma linha que as cita entra no tema, sem diferenciar acentos nem maiúsculas. Uma troca de foco usa o tema para onde foi.
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'novo' ? 'Novo tema' : `Editar ${editing.nome}`}
            </Text>
            <TextInput label="Nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} required />
            <TextInput
              label="Palavras que o identificam"
              description="Separadas por vírgula"
              value={palavras}
              onChange={(e) => setPalavras(e.currentTarget.value)}
            />
            <ColorInput label="Cor" value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                Salvar tema
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('novo')} style={{ alignSelf: 'flex-start' }}>
            Novo tema
          </Button>
        )}

        <Stack gap="xs">
          {documento.temas.map((t) => (
            <Group key={t.nome} justify="space-between" wrap="nowrap" className="tf-person-row">
              <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                <span className="tf-dot" style={{ background: t.cor, width: 12, height: 12 }} aria-hidden />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600} truncate>
                    {t.nome}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {t.palavras || 'sem palavras: só entra por troca de foco'}
                  </Text>
                </div>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label={`Editar ${t.nome}`} onClick={() => start(t)}>
                  <IconPencil size={15} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label={`Remover ${t.nome}`} onClick={() => remove(t)}>
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
      notifications.show({ message: 'Já existe um sinal com este nome.', color: 'red' });
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
    notifications.show({ message: 'Sinal salvo. Vale para as próximas leituras das linhas.' });
    setEditing(null);
  };

  const remove = async (sinal: Sinal) => {
    const ok = await confirm({
      title: `Remover o sinal ${sinal.nome}?`,
      body: 'As linhas continuam como estão; só deixam de mostrar este sinal.',
      confirmLabel: 'Remover sinal',
    });
    if (!ok) return;
    commit((d) => ({ ...d, sinais: d.sinais.filter((s) => s !== sinal) }));
    onRemoved(sinal.nome);
    notifications.show({ message: 'Sinal removido.' });
  };

  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="Sinais">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Sinais são condições que uma linha revela: bloqueio, espera, urgência. Cada um é encontrado pelas palavras dele no texto, como um tema,
          mas marca como a linha está, não sobre o que ela é.
        </Text>

        {editing ? (
          <Stack gap="xs" className="tf-form-box">
            <Text fw={600} size="sm">
              {editing === 'novo' ? 'Novo sinal' : `Editar ${editing.nome}`}
            </Text>
            <TextInput label="Nome" value={nome} onChange={(e) => setNome(e.currentTarget.value)} required />
            <TextInput
              label="Palavras que o identificam"
              description="Separadas por vírgula. Um sinal sem palavras não aparece em nenhuma linha."
              value={palavras}
              onChange={(e) => setPalavras(e.currentTarget.value)}
            />
            <TextInput label="O que significa" description="Opcional. Aparece na legenda e na dica do sinal." value={gatilho} onChange={(e) => setGatilho(e.currentTarget.value)} />
            <ColorInput label="Cor" value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
            <Group gap="xs">
              <Button size="xs" onClick={save} disabled={!nome.trim()}>
                Salvar sinal
              </Button>
              <Button size="xs" variant="default" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </Group>
          </Stack>
        ) : (
          <Button size="xs" onClick={() => start('novo')} style={{ alignSelf: 'flex-start' }}>
            Novo sinal
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
                    {s.gatilho || s.palavras || 'sem palavras: não aparece em nenhuma linha'}
                  </Text>
                </div>
              </Group>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="subtle" color="gray" aria-label={`Editar ${s.nome}`} onClick={() => start(s)}>
                  <IconPencil size={15} />
                </ActionIcon>
                <ActionIcon variant="subtle" color="red" aria-label={`Remover ${s.nome}`} onClick={() => remove(s)}>
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

  const opcoesDe = [...temas, PAUSA];
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
    notifications.show({ message: 'Troca de foco salva.' });
    onClose();
  };

  const remove = async () => {
    if (!inicial) return;
    const ok = await confirm({
      title: 'Excluir esta troca de foco?',
      body: 'A troca sai da linha do tempo. Use Desfazer (Ctrl+Z) para voltar atrás.',
      confirmLabel: 'Excluir troca',
    });
    if (!ok) return;
    commit((d) => ({ ...d, registros: d.registros.filter((r) => r.uid !== inicial.uid) }));
    notifications.show({ message: 'Troca de foco removida.' });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Troca de foco" size="lg">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Membro da equipe" data={pessoasOpcoes} value={nome} onChange={(v) => setNome(v ?? '')} allowDeselect={false} />
          <TextInput label="Data da transição" type="date" value={data} onChange={(e) => setData(e.currentTarget.value)} />
          <Select label="De (tema que deixa de ser foco)" data={opcoesDe} value={de} onChange={(v) => setDe(v ?? PAUSA)} allowDeselect={false} />
          <Select label="Para (novo foco prioritário)" data={temas} value={para} onChange={(v) => setPara(v ?? '')} allowDeselect={false} />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Ícone de destaque
            </Text>
            <Group gap={6}>
              {ICONES_TROCA.map((ic) => (
                <Button
                  key={ic}
                  variant={icone === ic ? 'filled' : 'default'}
                  size="compact-md"
                  aria-pressed={icone === ic}
                  aria-label={`Ícone ${ic}`}
                  onClick={() => setIcone(ic)}
                >
                  {ic}
                </Button>
              ))}
            </Group>
          </div>
          <Select label="Estilo da borda" data={ESTILOS_LINHA.map((e) => ({ value: e.value, label: e.label }))} value={estilo} onChange={(v) => setEstilo((v ?? 'borda-gradiente') as EstiloLinha)} allowDeselect={false} />
        </SimpleGrid>

        <ColorInput label="Cor de destaque" value={cor} onChange={setCor} swatches={PALETA_DESTAQUE} format="hex" />
        <Textarea label="Motivo da mudança" rows={2} value={motivo} onChange={(e) => setMotivo(e.currentTarget.value)} placeholder="Ex: pausado por causa de um bloqueio no deploy" />

        <div className="tf-form-box">
          <Text size="xs" c="dimmed" mb={6} tt="uppercase" fw={600}>
            Pré-visualização
          </Text>
          <TrocaCard icone={icone} cor={cor} estilo={estilo} de={de} para={para || '—'} texto={motivo.trim()} />
        </div>

        <Group justify={inicial ? 'space-between' : 'flex-end'} gap="xs">
          {inicial && (
            <Button color="red" variant="light" onClick={remove}>
              Excluir
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!nome || !para}>
              Salvar transição
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
    notifications.show({ message: inicial ? 'Atividade atualizada.' : 'Atividade adicionada.' });
    onClose();
  };

  const remove = async () => {
    if (!inicial) return;
    const ok = await confirm({
      title: 'Excluir esta atividade?',
      body: 'A linha sai do registro. Use Desfazer (Ctrl+Z) para voltar atrás.',
      confirmLabel: 'Excluir atividade',
    });
    if (!ok) return;
    commit((d) => ({ ...d, registros: d.registros.filter((r) => r.uid !== inicial.uid) }));
    notifications.show({ message: 'Atividade removida.' });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title={inicial ? 'Editar atividade' : 'Nova atividade'} size="md">
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label="Responsável" data={documento.pessoas.map((p) => ({ value: p.nome, label: p.nome }))} value={nome} onChange={(v) => setNome(v ?? '')} allowDeselect={false} />
          <TextInput label="Data" type="date" value={data} onChange={(e) => setData(e.currentTarget.value)} />
        </SimpleGrid>
        <Textarea
          label="Descrição"
          rows={4}
          value={texto}
          onChange={(e) => setTexto(e.currentTarget.value)}
          placeholder="O que foi feito ou alinhado? Cite outras pessoas com o nome para separar o trabalho delas."
          autosize
        />
        <Text size="xs" c="dimmed">
          Uma linha escrita pelo gestor que cita membros da equipe é dividida em uma atividade por pessoa citada.
        </Text>
        <Group justify={inicial ? 'space-between' : 'flex-end'} gap="xs">
          {inicial && (
            <Button color="red" variant="light" onClick={remove}>
              Excluir
            </Button>
          )}
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!nome || !texto.trim()}>
              {inicial ? 'Salvar' : 'Adicionar'}
            </Button>
          </Group>
        </Group>
      </Stack>
      {dialog}
    </Modal>
  );
}
