import {
  IconAdjustments,
  IconAdjustmentsHorizontal,
  IconBell,
  IconCalendarTime,
  IconForms,
  IconLayoutKanban,
  IconMail,
  IconPlugConnected,
  IconRefresh,
  IconSparkles,
  IconTimeline,
  type Icon,
} from '@tabler/icons-react';

/**
 * The Settings sections in navigation order. The ids are the `?tab=` values, unchanged from the
 * old tab bar so existing links keep landing in the right place.
 */
export const SECTIONS = [
  {
    group: 'system',
    items: [
      { id: 'conexao', icon: IconPlugConnected },
      { id: 'calendario', icon: IconCalendarTime },
      { id: 'coleta', icon: IconRefresh },
      { id: 'email', icon: IconMail },
      { id: 'ia', icon: IconSparkles },
      { id: 'geral', icon: IconAdjustments },
    ],
  },
  {
    group: 'jira',
    items: [
      { id: 'boards', icon: IconLayoutKanban },
      { id: 'campos', icon: IconForms },
      { id: 'perfil', icon: IconAdjustmentsHorizontal },
    ],
  },
  {
    group: 'delivery',
    items: [
      { id: 'notificacoes', icon: IconBell },
      { id: 'plano-epico', icon: IconTimeline },
    ],
  },
] as const satisfies readonly { group: string; items: readonly { id: string; icon: Icon }[] }[];

export type SectionId = (typeof SECTIONS)[number]['items'][number]['id'];
export type SectionGroup = (typeof SECTIONS)[number]['group'];

const IDS: readonly string[] = SECTIONS.flatMap((group) => group.items.map((item) => item.id));

export const isSection = (value: string): value is SectionId => IDS.includes(value);

/** The System sections are runtime configuration, each one group of `GET /config`. */
export const CONFIG_GROUP_OF = {
  conexao: 'jira',
  calendario: 'calendar',
  coleta: 'collection',
  email: 'notifications',
  ia: 'ai',
  geral: 'general',
} as const satisfies Partial<Record<SectionId, string>>;

export type SystemSectionId = keyof typeof CONFIG_GROUP_OF;

export const isSystemSection = (value: SectionId): value is SystemSectionId => value in CONFIG_GROUP_OF;
