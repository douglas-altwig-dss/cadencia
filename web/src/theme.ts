import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Petrol: the single accent. Colour is reserved for state (done / attention / risk).
const petrol: MantineColorsTuple = [
  '#e6f4f3',
  '#cfe6e4',
  '#9dcbc8',
  '#68b0ab',
  '#3f9993',
  '#258a84',
  '#12827c',
  '#0e6f6a',
  '#0e5c5b',
  '#084846',
];

// Dark-scheme neutrals leaning towards the accent, so the dark theme reads as the same product
// rather than as Mantine's stock grey. Index 7 is the page, 6 the cards, 4 the borders.
const dark: MantineColorsTuple = [
  '#d5dcda',
  '#aab5b2',
  '#85918e',
  '#63706d',
  '#3a4543',
  '#2b3533',
  '#1d2524',
  '#141a19',
  '#101514',
  '#0b0f0e',
];

export const theme = createTheme({
  primaryColor: 'petrol',
  primaryShade: { light: 8, dark: 4 },
  colors: { petrol, dark },
  fontFamily: '"IBM Plex Sans", system-ui, "Segoe UI", sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", ui-monospace, Consolas, monospace',
  headings: {
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.875rem', lineHeight: '1.2' },
      h2: { fontSize: '1.5rem', lineHeight: '1.25' },
      h3: { fontSize: '1.125rem', lineHeight: '1.35' },
      h4: { fontSize: '1rem', lineHeight: '1.4' },
      h5: { fontSize: '0.875rem', lineHeight: '1.4' },
    },
  },
  defaultRadius: 'md',
  cursorType: 'pointer',
  shadows: {
    xs: '0 1px 2px rgb(16 32 30 / 0.05)',
    sm: '0 1px 2px rgb(16 32 30 / 0.05), 0 2px 6px rgb(16 32 30 / 0.05)',
    md: '0 2px 4px rgb(16 32 30 / 0.06), 0 8px 20px rgb(16 32 30 / 0.08)',
  },
  components: {
    Paper: { defaultProps: { radius: 'md' } },
    Button: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm' } },
    Table: { defaultProps: { verticalSpacing: 'sm', highlightOnHover: true } },
    Tooltip: { defaultProps: { withArrow: true } },
    Modal: { defaultProps: { radius: 'md', overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
    Drawer: { defaultProps: { overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
  },
});

/** Chart colours per state, tuned for both schemes (AA against the page background). */
export const chartColors = {
  light: {
    done: '#2C6844',
    progress: '#0E5C5B',
    todo: '#9AA5A2',
    risk: '#B4421F',
    warn: '#9C5510',
    added: '#6B4FA0',
    grid: '#D6DCDA',
    text: '#4C5A57',
  },
  dark: {
    done: '#72C093',
    progress: '#5EBAB4',
    todo: '#6F7C79',
    risk: '#F08A6C',
    warn: '#DFA361',
    added: '#B79CEB',
    grid: '#293633',
    text: '#A4B1AD',
  },
} as const;

export type ChartPalette = Record<keyof (typeof chartColors)['light'], string>;
