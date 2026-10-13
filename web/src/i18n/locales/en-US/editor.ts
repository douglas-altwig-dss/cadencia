// Namespace `editor`, owned by `components/editor` and the editor libraries (`lib/deckEdits.ts`, `lib/textLayout.ts`, `lib/findReplace.ts`, ...).
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

export const editor = {};
