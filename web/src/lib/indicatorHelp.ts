/**
 * How each indicator is calculated, in the words the "i" beside it shows.
 *
 * They live in one place (the `shell.help` catalogue, one per language), not next to each number, so
 * the wording is written once, reads as one voice, and a test can check that no indicator on the Home
 * page was added without one. Each states the rule the code follows — what counts, over what, and the
 * thresholds — so a number can be argued with. When a calculation changes, change its text there.
 */

import { t, type Messages } from '../i18n';

export type HelpKey = keyof Messages['shell']['help'];

/**
 * `HELP['person:load']` reads the current language at the moment it is read (a getter per key), so a
 * screen rendering after a change of language shows the new words without anything holding a copy.
 */
export const HELP: Readonly<Record<HelpKey, string>> = Object.defineProperties(
  {},
  Object.fromEntries(
    // Only the keys are read here, at load; every value is looked up when used.
    (Object.keys(t().shell.help) as HelpKey[]).map((key) => [key, { enumerable: true, get: () => t().shell.help[key] }]),
  ),
) as Record<HelpKey, string>;

/** The help for a Home tile of this type. */
export const tileHelp = (type: string): string | undefined => (t().shell.help as Record<string, string>)[`tile:${type}`];
