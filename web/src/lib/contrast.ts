/**
 * RF-95: WCAG 2.1 contrast, for colours a person picks. A status fill carries a label in the deck,
 * so the label has to stay readable on it: 4.5:1 for body text, 3:1 for large text.
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) return NaN;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  if (Number.isNaN(la) || Number.isNaN(lb)) return NaN;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The better of black or white text on ``fill``, and how well it reads. */
export function bestText(fill: string): { color: 'FFFFFF' | '000000'; ratio: number } {
  const white = contrastRatio(fill, 'FFFFFF');
  const black = contrastRatio(fill, '000000');
  return white >= black ? { color: 'FFFFFF', ratio: white } : { color: '000000', ratio: black };
}
