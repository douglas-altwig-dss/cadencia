/**
 * Load metric-compatible faces so the canvas measures text the way PowerPoint will (RF-47).
 *
 * The server tells us which of Carlito/Caladea/Liberation it has; we register each one under the
 * *original* family name, so `fontFamily: 'Calibri'` on the canvas is laid out with Calibri's
 * advance widths even where Calibri is not installed. Where no compatible face exists the family
 * is reported back as approximate and the editor warns instead of pretending.
 */
export interface FontFamilyPlan {
  family: string;
  face: string | null;
  variants: string[];
  metric_compatible: boolean;
}

export interface FontPlan {
  families: FontFamilyPlan[];
  faces: string[];
}

const VARIANTS: Record<string, { weight: string; style: string }> = {
  '400': { weight: '400', style: 'normal' },
  '700': { weight: '700', style: 'normal' },
  '400i': { weight: '400', style: 'italic' },
  '700i': { weight: '700', style: 'italic' },
};

const loaded = new Set<string>();

/** Registers every substitutable family; resolves once the browser has them for measurement. */
export async function loadDeckFonts(plan: FontPlan, base = '/api/reports/fonts'): Promise<string[]> {
  const pending: Promise<unknown>[] = [];
  const approximate: string[] = [];
  for (const entry of plan.families) {
    if (!entry.face) {
      approximate.push(entry.family);
      continue;
    }
    for (const variant of entry.variants) {
      const spec = VARIANTS[variant];
      const token = `${entry.family}|${variant}`;
      if (!spec || loaded.has(token)) continue;
      loaded.add(token);
      // #14: a shared deck loads the same files from the public route.
      const url = `${base}/${encodeURIComponent(entry.face)}/${encodeURIComponent(variant)}`;
      const face = new FontFace(entry.family, `url(${url})`, { weight: spec.weight, style: spec.style });
      pending.push(
        face
          .load()
          .then((ready) => document.fonts.add(ready))
          .catch(() => undefined),
      );
    }
  }
  await Promise.all(pending);
  return approximate;
}

/** What to hand a canvas for a family, with sensible fallbacks when nothing matched. */
export function fontStack(family?: string | null): string {
  const name = (family || 'Calibri').trim();
  const generic = /mono|consol|courier/i.test(name)
    ? 'monospace'
    : /times|georgia|garamond|serif|cambria|caladea/i.test(name)
      ? 'serif'
      : 'sans-serif';
  return `"${name}", ${generic}`;
}
