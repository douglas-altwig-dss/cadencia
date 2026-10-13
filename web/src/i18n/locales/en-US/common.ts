// Namespace `common`, owned by no single area: shared words and buttons used across areas (Save,
// Cancel, "never", "now"...). Add here only what two or more areas really share; everything else
// belongs to its area's namespace.
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

export const common = {
  /** `fromNow` of a missing instant. */
  never: 'never',
  /** `fromNow` of an instant under a minute away. */
  now: 'now',
};
