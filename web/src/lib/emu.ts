/**
 * The editor's unit system (RF-47).
 *
 * PowerPoint stores geometry in EMU — 914400 per inch, 12700 per point — as integers. The canvas
 * keeps those integers as the truth and derives screen pixels from them, never the other way
 * round: a shape is *at* 1143000 EMU and merely *drawn* at 213.4 px. Rounding therefore happens
 * once, on the way to the screen, and never accumulates into the file.
 */
import { fmtNum } from './format';

export const EMU_PER_INCH = 914400;
export const EMU_PER_PT = 12700;
export const PT_PER_INCH = 72;

/** Screen pixels per EMU for a stage of `widthPx` showing a slide `slideWidthEmu` wide. */
export const scaleFor = (widthPx: number, slideWidthEmu: number) => widthPx / slideWidthEmu;

export const emuToPx = (emu: number, scale: number) => emu * scale;
export const pxToEmu = (px: number, scale: number) => Math.round(px / scale);
export const ptToEmu = (pt: number) => Math.round(pt * EMU_PER_PT);
export const emuToPt = (emu: number) => emu / EMU_PER_PT;
export const emuToCm = (emu: number) => emu / EMU_PER_INCH * 2.54;
export const cmToEmu = (cm: number) => Math.round((cm / 2.54) * EMU_PER_INCH);

/** A point size drawn on a stage: points are EMU too, so the same scale applies. */
export const fontPx = (sizePt: number, scale: number) => sizePt * EMU_PER_PT * scale;

export const fmtCm = (emu: number) => `${fmtNum(emuToCm(emu), 2)} cm`;
