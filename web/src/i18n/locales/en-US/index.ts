import { common } from './common';
import { config } from './config';
import { deck } from './deck';
import { editor } from './editor';
import { epicPlan } from './epicPlan';
import { people } from './people';
import { shell } from './shell';
import { tracking } from './tracking';

/** The source catalogue. Its type is `Messages`, the shape every other language must match. */
export const enUS = { common, shell, tracking, people, epicPlan, deck, editor, config };

export type Messages = typeof enUS;
