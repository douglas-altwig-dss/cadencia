// Namespace `shell`, owned by the App shell: navigation, header, command palette, shortcuts, and
// the shared components in `components/*.tsx` and `lib/`.
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

export const shell = {
  /** The header's display preferences menu (`HeaderTools.PreferencesMenu`). */
  preferences: {
    title: 'Display preferences',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    density: 'Table density',
    densityComfortable: 'Comfortable',
    densityCompact: 'Compact',
    chartPatterns: 'Patterns in charts',
    chartPatternsHint: 'hatching as well as color, to tell series apart without relying on it',
    reduceMotion: 'Reduce motion',
    reduceMotionHint: 'the operating system setting is respected too',
    shortcuts: 'Keyboard shortcuts',
  },
};
