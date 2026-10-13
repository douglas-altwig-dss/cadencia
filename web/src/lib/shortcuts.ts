/**
 * RF-81: every keyboard shortcut in one list, so the `?` overlay and the screens cannot disagree.
 * A screen that adds a shortcut adds it here too; the overlay shows the current screen's first.
 */
export interface Shortcut {
  keys: string[];
  label: string;
}

export interface ShortcutGroup {
  id: string;
  title: string;
  /** Which screens this group belongs to, by path prefix. */
  paths: string[];
  items: Shortcut[];
}

export const SHORTCUT_EVENT = 'cadencia:atalhos';

export const SHORTCUTS: ShortcutGroup[] = [
  {
    id: 'global',
    title: 'Em qualquer tela',
    paths: ['/'],
    items: [
      { keys: ['Ctrl', 'K'], label: 'Buscar e ir para qualquer lugar' },
      { keys: ['?'], label: 'Mostrar estes atalhos' },
      { keys: ['Esc'], label: 'Fechar janelas e menus' },
    ],
  },
  {
    id: 'timeline-foco',
    title: 'Timeline de foco',
    paths: ['/timeline-foco'],
    items: [
      { keys: ['/'], label: 'Buscar atividade ou troca' },
      { keys: ['Ctrl', 'Z'], label: 'Desfazer' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Refazer (também Ctrl+Y)' },
    ],
  },
  {
    id: 'editor',
    title: 'Editor da apresentação',
    paths: ['/apresentacao'],
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Desfazer' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: 'Refazer (também Ctrl+Y)' },
      { keys: ['Ctrl', 'S'], label: 'Salvar agora (edições e mapeamento)' },
      { keys: ['Ctrl', 'Enter'], label: 'Gerar apresentação' },
      { keys: ['Ctrl', 'A'], label: 'Selecionar todas as formas' },
      { keys: ['Ctrl', 'C'], label: 'Copiar' },
      { keys: ['Ctrl', 'V'], label: 'Colar' },
      { keys: ['Ctrl', 'D'], label: 'Duplicar' },
      { keys: ['Ctrl', 'G'], label: 'Agrupar' },
      { keys: ['Ctrl', 'Shift', 'G'], label: 'Desagrupar' },
      { keys: ['Ctrl', 'Shift', 'C'], label: 'Copiar formato' },
      { keys: ['Ctrl', 'Shift', 'V'], label: 'Colar formato na seleção' },
      { keys: ['Ctrl', 'L'], label: 'Bloquear ou desbloquear a seleção' },
      { keys: ['Ctrl', 'H'], label: 'Localizar e substituir' },
      { keys: ['Enter'], label: 'Escrever na forma selecionada (também F2)' },
      { keys: ['Delete'], label: 'Excluir a seleção' },
      { keys: ['←', '→', '↑', '↓'], label: 'Mover 1 mm (com Shift, 5 mm)' },
      { keys: ['Tab'], label: 'Selecionar a próxima forma' },
      { keys: ['Ctrl', 'rolagem'], label: 'Aproximar e afastar' },
      { keys: ['F11'], label: 'Tela cheia do editor' },
    ],
  },
  {
    id: 'apresentar',
    title: 'Modo de apresentação',
    paths: ['/apresentacao', '/apresentar'],
    items: [
      { keys: ['→'], label: 'Próximo slide (também espaço e Page Down)' },
      { keys: ['←'], label: 'Slide anterior' },
      { keys: ['g'], label: 'Todos os slides' },
      { keys: ['n'], label: 'Notas do apresentador' },
      { keys: ['s'], label: 'Abrir a tela da plateia (duas telas)' },
      { keys: ['p'], label: 'Pausar ou retomar o cronômetro' },
      { keys: ['d'], label: 'Caneta: desenhar sobre o slide' },
      { keys: ['l'], label: 'Laser: apontar no slide' },
      { keys: ['c'], label: 'Apagar os traços do slide' },
      { keys: ['e'], label: 'Itens citados no slide (evidências)' },
      { keys: ['q'], label: 'Perguntas da plateia' },
      { keys: ['f'], label: 'Tela cheia' },
      { keys: ['Esc'], label: 'Largar a caneta ou o laser; de novo, sair' },
    ],
  },
];

export function groupsFor(path: string): ShortcutGroup[] {
  const specific = SHORTCUTS.filter((g) => g.id !== 'global' && g.paths.some((p) => path.startsWith(p)));
  const rest = SHORTCUTS.filter((g) => g.id !== 'global' && !specific.includes(g));
  return [...specific, SHORTCUTS[0], ...rest];
}

export const openShortcuts = () => window.dispatchEvent(new Event(SHORTCUT_EVENT));

/** True when a key press is meant for a text field, where `?` and friends are just characters. */
export function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (/input|textarea|select/i.test(element.tagName) || element.isContentEditable));
}
