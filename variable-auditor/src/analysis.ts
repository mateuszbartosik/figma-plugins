import type { RGBA, HardcodedKind, HardcodedCategory } from './types.ts';

function channelToHex(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  return n.toString(16).padStart(2, '0').toUpperCase();
}

export function rgbaToHex(c: RGBA): string {
  return '#' + channelToHex(c.r) + channelToHex(c.g) + channelToHex(c.b);
}

export function formatNumber(n: number): string {
  return String(Number.parseFloat(n.toFixed(3)));
}

const CATEGORY_BY_KIND: Record<HardcodedKind, HardcodedCategory> = {
  color: 'color',
  radius: 'radiusStroke',
  strokeWeight: 'radiusStroke',
  spacing: 'spacing',
  fontSize: 'typography',
  lineHeight: 'typography',
  letterSpacing: 'typography',
};

const LABEL_BY_KIND: Record<Exclude<HardcodedKind, 'color'>, string> = {
  radius: 'Corner radius',
  strokeWeight: 'Stroke weight',
  spacing: 'Spacing',
  fontSize: 'Font size',
  lineHeight: 'Line height',
  letterSpacing: 'Letter spacing',
};

export function groupMeta(
  kind: HardcodedKind,
  colorHex: string | null,
  opacity: number | null,
  num: number | null,
): { category: HardcodedCategory; valueKey: string; label: string } {
  const category = CATEGORY_BY_KIND[kind];
  if (kind === 'color') {
    const op = formatNumber(opacity ?? 1);
    return { category, valueKey: `color:${colorHex}@${op}`, label: colorHex ?? '#000000' };
  }
  const val = formatNumber(num ?? 0);
  return { category, valueKey: `${kind}:${val}`, label: `${LABEL_BY_KIND[kind]} · ${val}` };
}
