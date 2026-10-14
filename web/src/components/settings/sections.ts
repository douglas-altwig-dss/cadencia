import {
  IconAdjustments,
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
 * The Settings sections in navigation order. The ids are the `?tab=` values; the Portuguese ones
 * they replaced are translated by `lib/legacyRoutes`, so existing links keep landing in the right place.
 */
export const SECTIONS = [
  {
    group: 'system',
    items: [
      { id: 'connection', icon: IconPlugConnected },
      { id: 'calendar', icon: IconCalendarTime },
      { id: 'collection', icon: IconRefresh },
      { id: 'email', icon: IconMail },
      { id: 'ai', icon: IconSparkles },
      { id: 'general', icon: IconAdjustments },
    ],
  },
  {
    group: 'jira',
    items: [
      { id: 'boards', icon: IconLayoutKanban },
      { id: 'fields', icon: IconForms },
    ],
  },
  {
    group: 'delivery',
    items: [
      { id: 'notifications', icon: IconBell },
      { id: 'epic-plan', icon: IconTimeline },
    ],
  },
] as const satisfies readonly { group: string; items: readonly { id: string; icon: Icon }[] }[];

export type SectionId = (typeof SECTIONS)[number]['items'][number]['id'];
export type SectionGroup = (typeof SECTIONS)[number]['group'];

const IDS: readonly string[] = SECTIONS.flatMap((group) => group.items.map((item) => item.id));

export const isSection = (value: string): value is SectionId => IDS.includes(value);

/** The System sections are runtime configuration, each one group of `GET /config`. */
export const CONFIG_GROUP_OF = {
  connection: 'jira',
  calendar: 'calendar',
  collection: 'collection',
  email: 'notifications',
  ai: 'ai',
  general: 'general',
} as const satisfies Partial<Record<SectionId, string>>;

export type SystemSectionId = keyof typeof CONFIG_GROUP_OF;

export const isSystemSection = (value: SectionId): value is SystemSectionId => value in CONFIG_GROUP_OF;
