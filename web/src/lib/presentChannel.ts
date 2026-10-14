/**
 * RF-100: the presenter's window and the audience's window talk over a BroadcastChannel — same
 * browser, same origin, no server round trip, so a slide change is instant on the projector.
 */
export interface AudienceSlide {
  key: string;
  image?: string;
  title: string;
}

/** #29: a point on the slide, as a fraction of its width and height, so both windows agree. */
export interface InkPoint {
  x: number;
  y: number;
}

export interface Ink {
  /** Pen strokes on the slide being shown. */
  strokes: InkPoint[][];
  /** Where the laser pointer is, or null when it is off the slide. */
  laser: InkPoint | null;
}

export type PresentMessage =
  | { type: 'hello' }
  | { type: 'state'; slides: AudienceSlide[]; index: number }
  | { type: 'nav'; delta: number }
  | { type: 'ink'; key: string; ink: Ink }
  | { type: 'end' };

export const channelName = (id: string) => `cadencia-apresentacao-${id}`;

export const audienceUrl = (id: string) => `/present/audience?channel=${encodeURIComponent(id)}`;

export const supportsAudience = () => typeof window !== 'undefined' && 'BroadcastChannel' in window;

/** #28: Jira issue keys mentioned on a slide, in order of appearance and without repeats. */
export function issueKeys(text: string): string[] {
  return [...new Set(text.match(/\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/g) ?? [])];
}
