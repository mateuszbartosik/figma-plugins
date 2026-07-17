import type { RGBA, HardcodedKind, HardcodedCategory, UnusedVariable, VariableResolvedType, Occurrence, HardcodedGroup, CandidateVariable, UnlinkedRef, UnlinkedGroup } from './types.ts';

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

export function colorDistance(a: RGBA, b: RGBA): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  const da = a.a - b.a;
  return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
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

export interface LocalVarInfo {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: VariableResolvedType;
  remote: boolean;
  valuePreview: string;
  colorHex?: string;
}

export function computeUnused(localVars: LocalVarInfo[], usedIds: Set<string>): UnusedVariable[] {
  return localVars
    .filter(v => !v.remote && !usedIds.has(v.id))
    .map(v => ({
      id: v.id,
      name: v.name,
      collectionName: v.collectionName,
      resolvedType: v.resolvedType,
      valuePreview: v.valuePreview,
      colorHex: v.colorHex,
    }));
}

export function groupHardcoded(occurrences: Occurrence[]): HardcodedGroup[] {
  const byKey = new Map<string, HardcodedGroup>();
  for (const o of occurrences) {
    let g = byKey.get(o.valueKey);
    if (!g) {
      g = {
        category: o.category, kind: o.kind, valueKey: o.valueKey,
        label: '', colorHex: o.colorHex, opacity: o.opacity, num: o.num,
        count: 0, occurrences: [],
      };
      byKey.set(o.valueKey, g);
    }
    g.occurrences.push(o);
    g.count++;
  }
  const groups = [...byKey.values()];
  // label from group meta (reuse groupMeta for consistency)
  for (const g of groups) {
    g.label = groupMeta(g.kind, g.colorHex ?? null, g.opacity ?? null, g.num ?? null).label;
  }
  groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return groups;
}

export function groupUnlinked(refs: UnlinkedRef[]): UnlinkedGroup[] {
  const byKey = new Map<string, UnlinkedGroup>();
  for (const r of refs) {
    let g = byKey.get(r.collectionKey);
    if (!g) {
      g = { collectionKey: r.collectionKey, collectionName: r.collectionName, count: 0, refs: [] };
      byKey.set(r.collectionKey, g);
    }
    g.refs.push(r);
    g.count++;
  }
  const groups = [...byKey.values()];
  groups.sort((a, b) => b.count - a.count || a.collectionName.localeCompare(b.collectionName));
  return groups;
}

export type VarValue = RGBA | number | string | boolean | { type: 'VARIABLE_ALIAS'; id: string };
export interface ResolvableVar { id: string; valuesByMode: Record<string, VarValue> }

function isAlias(v: VarValue): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return typeof v === 'object' && v !== null && (v as any).type === 'VARIABLE_ALIAS';
}

export function resolveVariableValue(
  id: string,
  modeId: string,
  varMap: Map<string, ResolvableVar>,
  seen: Set<string> = new Set(),
): RGBA | number | string | boolean | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const v = varMap.get(id);
  if (!v) return null;
  let val: VarValue | undefined = v.valuesByMode[modeId];
  if (val === undefined) {
    const firstKey = Object.keys(v.valuesByMode)[0];
    if (firstKey === undefined) return null;
    val = v.valuesByMode[firstKey];
  }
  if (isAlias(val)) return resolveVariableValue(val.id, modeId, varMap, seen);
  return val;
}

export interface ResolvedCandidate {
  id: string;
  name: string;
  collectionName: string;
  resolvedType: 'COLOR' | 'FLOAT';
  valuePreview: string;
  colorHex?: string;
  modeValues: (RGBA | number | string | boolean | null)[];
}

type Target = { kind: 'color'; colorHex: string; opacity: number } | { kind: 'number'; num: number };

function matchesTarget(value: RGBA | number | string | boolean | null, target: Target): boolean {
  if (value === null) return false;
  if (target.kind === 'number') {
    return typeof value === 'number' && Math.abs(value - target.num) < 1e-4;
  }
  if (typeof value !== 'object') return false;
  const hex = rgbaToHex(value as RGBA);
  const op = Number.parseFloat(((value as RGBA).a ?? 1).toFixed(3));
  return hex === target.colorHex && Math.abs(op - target.opacity) < 1e-4;
}

export function rankCandidates(target: Target, candidates: ResolvedCandidate[]): CandidateVariable[] {
  // Build results with exact flag
  const results: CandidateVariable[] = candidates.map(c => ({
    id: c.id,
    name: c.name,
    collectionName: c.collectionName,
    valuePreview: c.valuePreview,
    colorHex: c.colorHex,
    exact: c.modeValues.some(v => matchesTarget(v, target)),
  }));

  // Calculate distances for non-exact candidates
  const distances = new Map<string, number>();
  for (const c of candidates) {
    const exact = c.modeValues.some(v => matchesTarget(v, target));
    if (!exact) {
      if (target.kind === 'color') {
        const targetRgba: RGBA = {
          r: parseInt(target.colorHex.slice(1, 3), 16) / 255,
          g: parseInt(target.colorHex.slice(3, 5), 16) / 255,
          b: parseInt(target.colorHex.slice(5, 7), 16) / 255,
          a: target.opacity,
        };
        let minDist = Infinity;
        for (const v of c.modeValues) {
          if (typeof v === 'object' && v !== null && 'r' in v) {
            minDist = Math.min(minDist, colorDistance(targetRgba, v as RGBA));
          }
        }
        if (minDist !== Infinity) distances.set(c.id, minDist);
      } else if (target.kind === 'number') {
        let minDelta = Infinity;
        for (const v of c.modeValues) {
          if (typeof v === 'number') {
            minDelta = Math.min(minDelta, Math.abs(v - target.num));
          }
        }
        if (minDelta !== Infinity) distances.set(c.id, minDelta);
      }
    }
  }

  // Flag top 3 non-exact as near if within threshold
  const threshold = target.kind === 'color' ? 0.5 : 10;
  const nearIds = Array.from(distances.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .filter(([, dist]) => dist <= threshold)
    .map(([id]) => id);

  for (const result of results) {
    if (!result.exact && nearIds.includes(result.id)) {
      result.near = true;
    }
  }

  // Sort: exact first by collection/name, then non-exact by distance
  const exactResults = results.filter(r => r.exact);
  const nonExactResults = results.filter(r => !r.exact);

  exactResults.sort((a, b) =>
    a.collectionName.localeCompare(b.collectionName) || a.name.localeCompare(b.name));

  nonExactResults.sort((a, b) => {
    const distA = distances.get(a.id) ?? Infinity;
    const distB = distances.get(b.id) ?? Infinity;
    return distA - distB;
  });

  return [...exactResults, ...nonExactResults];
}
