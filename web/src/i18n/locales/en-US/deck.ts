// Namespace `deck`, owned by the deck (Apresentação) pages and drawers, and `components/deck`.
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

export const deck = {};
