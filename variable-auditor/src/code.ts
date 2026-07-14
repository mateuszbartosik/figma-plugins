import {
  rgbaToHex, formatNumber, groupMeta, computeUnused, groupHardcoded, groupUnlinked,
  resolveVariableValue, rankCandidates,
  type LocalVarInfo, type ResolvableVar, type ResolvedCandidate,
} from './analysis.ts';
import type {
  Scope, Occurrence, BrokenReference, UnusedVariable, HardcodedGroup,
  UnlinkedRef, UnlinkedGroup, ScanResult, UIToPlugin, Checks, HardcodedProps,
} from './types.ts';

figma.showUI(__html__, { width: 404, height: 660 });

let checks: Checks = { unused: true, broken: true, hardcoded: true, unlinked: true };
let props: HardcodedProps = { color: true, radius: true, strokeWeight: true, spacing: true, typography: true };
let lastScope: Scope = 'page';
const CHECKS_KEY = 'variable-auditor:checks';
const PROPS_KEY = 'variable-auditor:props';

(async () => {
  try { const saved = await figma.clientStorage.getAsync(CHECKS_KEY); if (saved) checks = { ...checks, ...saved }; } catch (e) {}
  try { const savedProps = await figma.clientStorage.getAsync(PROPS_KEY); if (savedProps) props = { ...props, ...savedProps }; } catch (e) {}
  figma.ui.postMessage({ type: 'settings', checks, props });
})();

interface FullScan {
  unused: UnusedVariable[];
  brokenAll: BrokenReference[];
  occurrencesAll: Occurrence[];
  unlinkedRefsAll: UnlinkedRef[];
}
let lastScan: FullScan | null = null;

function isAliasValue(v: unknown): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return typeof v === 'object' && v !== null && (v as any).type === 'VARIABLE_ALIAS';
}

function pushColorOccurrences(
  node: SceneNode, page: PageNode, key: 'fills' | 'strokes', out: Occurrence[],
) {
  const paints = (node as any)[key];
  if (!Array.isArray(paints)) return;
  paints.forEach((paint: Paint, i: number) => {
    if (paint.type !== 'SOLID' || paint.visible === false) return;
    if ((paint as any).boundVariables?.color) return; // already bound
    const colorHex = rgbaToHex({ ...paint.color, a: 1 });
    const opacity = paint.opacity ?? 1;
    const meta = groupMeta('color', colorHex, opacity, null);
    out.push({
      nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
      category: meta.category, kind: 'color', field: key, paintIndex: i,
      valueKey: meta.valueKey, colorHex, opacity,
    });
  });
}

function pushNumberOccurrence(
  node: SceneNode, page: PageNode, kind: Exclude<Parameters<typeof groupMeta>[0], 'color'>,
  field: string, num: number, out: Occurrence[],
) {
  const meta = groupMeta(kind, null, null, num);
  out.push({
    nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
    category: meta.category, kind, field, valueKey: meta.valueKey, num,
  });
}

function collectNode(
  node: SceneNode, page: PageNode,
  usedIds: Set<string>, refs: { id: string; ref: BrokenReference }[], occ: Occurrence[],
  collectHardcoded: boolean, props: HardcodedProps,
) {
  const bv = (node as any).boundVariables as Record<string, any> | undefined;
  if (bv) {
    for (const field of Object.keys(bv)) {
      const entry = bv[field];
      const aliases = field === 'componentProperties' && entry && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.values(entry as any)
        : Array.isArray(entry) ? entry : [entry];
      for (const a of aliases as any[]) {
        if (a && typeof a.id === 'string') {
          usedIds.add(a.id);
          refs.push({ id: a.id, ref: {
            nodeId: node.id, nodeName: node.name, pageId: page.id, pageName: page.name,
            field, variableId: a.id,
          }});
        }
      }
    }
  }

  if (collectHardcoded) {
    // Colors
    if (props.color) {
      if ('fills' in node && (node as any).fills !== figma.mixed) pushColorOccurrences(node, page, 'fills', occ);
      if ('strokes' in node && Array.isArray((node as any).strokes)) pushColorOccurrences(node, page, 'strokes', occ);
    }

    // Corner radius (uniform primary; per-corner when mixed)
    if (props.radius && 'cornerRadius' in node) {
      const cr = (node as any).cornerRadius;
      if (cr !== figma.mixed && typeof cr === 'number') {
        if (cr > 0 && !bv?.cornerRadius && !bv?.topLeftRadius) pushNumberOccurrence(node, page, 'radius', 'cornerRadius', cr, occ);
      } else if (cr === figma.mixed && 'topLeftRadius' in node) {
        for (const f of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'] as const) {
          const val = (node as any)[f];
          if (typeof val === 'number' && val > 0 && !bv?.[f]) pushNumberOccurrence(node, page, 'radius', f, val, occ);
        }
      }
    }

    // Stroke weight (only if strokes present, uniform)
    if (props.strokeWeight && 'strokeWeight' in node && Array.isArray((node as any).strokes) && (node as any).strokes.length > 0) {
      const sw = (node as any).strokeWeight;
      if (sw !== figma.mixed && typeof sw === 'number' && sw > 0 && !bv?.strokeWeight) {
        pushNumberOccurrence(node, page, 'strokeWeight', 'strokeWeight', sw, occ);
      }
    }

    // Auto-layout spacing
    if (props.spacing && 'layoutMode' in node && (node as any).layoutMode !== 'NONE') {
      const paddingFields = ['paddingLeft','paddingRight','paddingTop','paddingBottom'] as const;
      for (const f of paddingFields) {
        const val = (node as any)[f];
        if (typeof val === 'number' && val > 0 && !bv?.[f]) pushNumberOccurrence(node, page, 'spacing', f, val, occ);
      }
      // itemSpacing is ignored by Figma (shown as "Auto") when items are distributed —
      // the property still holds a stale number, so reporting it would be a false positive.
      if ((node as any).primaryAxisAlignItems !== 'SPACE_BETWEEN') {
        const itemSpacing = (node as any).itemSpacing;
        if (typeof itemSpacing === 'number' && itemSpacing > 0 && !bv?.itemSpacing) {
          pushNumberOccurrence(node, page, 'spacing', 'itemSpacing', itemSpacing, occ);
        }
      }
      // counterAxisSpacing (the wrap gap) only applies when the layout actually wraps.
      if ((node as any).layoutWrap === 'WRAP') {
        const counterAxisSpacing = (node as any).counterAxisSpacing;
        if (typeof counterAxisSpacing === 'number' && counterAxisSpacing > 0 && !bv?.counterAxisSpacing) {
          pushNumberOccurrence(node, page, 'spacing', 'counterAxisSpacing', counterAxisSpacing, occ);
        }
      }
    }

    // Typography (skip mixed)
    if (props.typography && node.type === 'TEXT') {
      const t = node as TextNode;
      if (t.fontSize !== figma.mixed && typeof t.fontSize === 'number' && !bv?.fontSize)
        pushNumberOccurrence(node, page, 'fontSize', 'fontSize', t.fontSize, occ);
      if (t.lineHeight !== figma.mixed && (t.lineHeight as any).unit && (t.lineHeight as any).unit !== 'AUTO' && !bv?.lineHeight)
        pushNumberOccurrence(node, page, 'lineHeight', 'lineHeight', (t.lineHeight as any).value, occ);
      // Letter spacing 0 is the default and almost always intentional — skip it as noise.
      if (t.letterSpacing !== figma.mixed && typeof (t.letterSpacing as any).value === 'number' && (t.letterSpacing as any).value !== 0 && !bv?.letterSpacing)
        pushNumberOccurrence(node, page, 'letterSpacing', 'letterSpacing', (t.letterSpacing as any).value, occ);
    }
  }
}

function collectSelectionIds(): Set<string> {
  const ids = new Set<string>();
  const walk = (n: SceneNode) => { ids.add(n.id); if ('children' in n) for (const c of n.children) walk(c as SceneNode); };
  for (const n of figma.currentPage.selection) walk(n);
  return ids;
}

async function fullScan(): Promise<FullScan> {
  figma.skipInvisibleInstanceChildren = true;
  await figma.loadAllPagesAsync();

  const usedIds = new Set<string>();
  let localRaw: Variable[] = [];
  let collName = new Map<string, string>();

  if (checks.unused) {
    localRaw = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    collName = new Map(collections.map(c => [c.id, c.name]));

    // variable→variable alias usage
    for (const v of localRaw) {
      for (const modeId of Object.keys(v.valuesByMode)) {
        const val = v.valuesByMode[modeId];
        if (isAliasValue(val)) usedIds.add(val.id);
      }
    }
  }

  // Attached-library collection keys, needed for unlinked-variable detection.
  // Fetched once, defensively: if teamLibrary is unavailable (older Figma, or the
  // request fails), unlinked detection is skipped entirely rather than flagging
  // everything as unlinked.
  let attachedKeys = new Set<string>();
  let teamLibOk = false;
  if (checks.unlinked) {
    try {
      const avail = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      attachedKeys = new Set(avail.map(c => c.key));
      teamLibOk = true;
    } catch (e) { teamLibOk = false; }
  }

  const refs: { id: string; ref: BrokenReference }[] = [];
  const occurrencesAll: Occurrence[] = [];
  let scanned = 0;
  for (const page of figma.root.children) {
    const nodes = (page as PageNode).findAll(() => true);
    for (const node of nodes) {
      collectNode(node as SceneNode, page as PageNode, usedIds, refs, occurrencesAll, checks.hardcoded, props);
      if ((++scanned % 800) === 0) figma.ui.postMessage({ type: 'scan-progress', scanned });
    }
  }

  // Broken references + unlinked library variables: resolve each unique referenced
  // id once, sharing the lookup between both checks.
  const brokenAll: BrokenReference[] = [];
  const unlinkedRefsAll: UnlinkedRef[] = [];
  if (checks.broken || checks.unlinked) {
    const resolvedVar = new Map<string, Variable | null>();
    const resolvedColl = new Map<string, VariableCollection | null>();
    const unlinkedMark = new Map<string, { variableName: string; collectionName: string; collectionKey: string }>();
    for (const { id } of refs) {
      if (resolvedVar.has(id)) continue;
      const v = await figma.variables.getVariableByIdAsync(id);
      resolvedVar.set(id, v);
      if (v === null) continue; // broken — handled below
      if (checks.unlinked && teamLibOk && v.remote) {
        let c = resolvedColl.get(v.variableCollectionId);
        if (c === undefined) {
          c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
          resolvedColl.set(v.variableCollectionId, c);
        }
        if (c && !attachedKeys.has(c.key)) {
          unlinkedMark.set(id, { variableName: v.name, collectionName: c.name, collectionKey: c.key });
        }
      }
    }
    if (checks.broken) {
      for (const { id, ref } of refs) if (resolvedVar.get(id) === null) brokenAll.push(ref);
    }
    if (checks.unlinked) {
      for (const { id, ref } of refs) {
        const mark = unlinkedMark.get(id);
        if (mark) {
          unlinkedRefsAll.push({
            nodeId: ref.nodeId, nodeName: ref.nodeName, pageId: ref.pageId, pageName: ref.pageName,
            field: ref.field, variableName: mark.variableName, collectionName: mark.collectionName, collectionKey: mark.collectionKey,
          });
        }
      }
    }
  }

  // Unused
  let unused: UnusedVariable[] = [];
  if (checks.unused) {
    const firstModeValue = (v: Variable): unknown => v.valuesByMode[Object.keys(v.valuesByMode)[0]];
    const infos: LocalVarInfo[] = localRaw.map(v => {
      const isColor = v.resolvedType === 'COLOR';
      const mv = firstModeValue(v);
      const colorHex = isColor && mv && typeof mv === 'object' && !isAliasValue(mv)
        ? rgbaToHex(mv as any) : undefined;
      const valuePreview = colorHex ?? (typeof mv === 'number' ? formatNumber(mv) : isAliasValue(mv) ? '→ alias' : String(mv));
      return {
        id: v.id, name: v.name, collectionName: collName.get(v.variableCollectionId) ?? '—',
        resolvedType: v.resolvedType, remote: v.remote, valuePreview, colorHex,
      };
    });
    unused = computeUnused(infos, usedIds);
  }

  return { unused, brokenAll, occurrencesAll, unlinkedRefsAll };
}

function filterByScope(scope: Scope): ScanResult {
  if (!lastScan) return { scope, summary: { unused: 0, broken: 0, hardcoded: 0, unlinked: 0 }, unused: [], broken: [], hardcoded: [], unlinked: [] };
  const currentPageId = figma.currentPage.id;
  const selIds = scope === 'selection' ? collectSelectionIds() : null;
  const inScope = (nodeId: string, pageId: string) =>
    scope === 'document' ? true :
    scope === 'page' ? pageId === currentPageId :
    !!selIds && selIds.has(nodeId);
  const broken = lastScan.brokenAll.filter(b => inScope(b.nodeId, b.pageId));
  const occ = lastScan.occurrencesAll.filter(o => inScope(o.nodeId, o.pageId));
  const hardcoded: HardcodedGroup[] = groupHardcoded(occ);
  const unlinkedRefs = lastScan.unlinkedRefsAll.filter(u => inScope(u.nodeId, u.pageId));
  const unlinked: UnlinkedGroup[] = groupUnlinked(unlinkedRefs);
  return {
    scope,
    summary: { unused: lastScan.unused.length, broken: broken.length, hardcoded: occ.length, unlinked: unlinkedRefs.length },
    unused: lastScan.unused, broken, hardcoded, unlinked,
  };
}

async function applyBinding(node: SceneNode, o: Occurrence, variable: Variable): Promise<void> {
  if (o.kind === 'color') {
    const key = o.field as 'fills' | 'strokes';
    const paints = ((node as any)[key] as Paint[]).slice();
    const p = paints[o.paintIndex ?? -1];
    if (!p || p.type !== 'SOLID') throw new Error('paint gone');
    paints[o.paintIndex!] = figma.variables.setBoundVariableForPaint(p as SolidPaint, 'color', variable);
    (node as any)[key] = paints;
  } else if (o.field === 'cornerRadius') {
    (node as any).setBoundVariable('cornerRadius', variable);
  } else {
    if (node.type === 'TEXT' && node.fontName !== figma.mixed) await figma.loadFontAsync(node.fontName);
    (node as any).setBoundVariable(o.field, variable);
  }
}

figma.ui.onmessage = async (msg: UIToPlugin) => {
  try {
    if (msg.type === 'scan') {
      lastScope = msg.scope;
      lastScan = await fullScan();
      figma.ui.postMessage({ type: 'scan-result', result: filterByScope(msg.scope) });
    } else if (msg.type === 'set-scope') {
      lastScope = msg.scope;
      if (!lastScan) lastScan = await fullScan();
      figma.ui.postMessage({ type: 'scan-result', result: filterByScope(msg.scope) });
    } else if (msg.type === 'set-checks') {
      checks = msg.checks;
      props = msg.props;
      figma.clientStorage.setAsync(CHECKS_KEY, checks).catch(() => {});
      figma.clientStorage.setAsync(PROPS_KEY, props).catch(() => {});
      // Only rescan if a scan already ran — before that, the empty state stays
      // until the user clicks Scan, so there is nothing yet to recompute.
      if (lastScan) {
        lastScan = await fullScan();
        figma.ui.postMessage({ type: 'scan-result', result: filterByScope(lastScope) });
      }
    } else if (msg.type === 'navigate') {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (!node) { figma.ui.postMessage({ type: 'error', message: 'That layer no longer exists — rescan.' }); return; }
      const page = await figma.getNodeByIdAsync(msg.pageId);
      if (page && page.type === 'PAGE' && figma.currentPage.id !== page.id) {
        await figma.setCurrentPageAsync(page);
      }
      figma.currentPage.selection = [node as SceneNode];
      figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
    } else if (msg.type === 'delete-variables') {
      const removed: string[] = [];
      for (const id of msg.ids) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) { try { v.remove(); removed.push(id); } catch { /* in use / locked */ } }
      }
      figma.ui.postMessage({
        type: 'action-result', ok: true,
        message: `Deleted ${removed.length} variable${removed.length === 1 ? '' : 's'}.`,
        removedVariableIds: removed,
      });
    }
    else if (msg.type === 'get-candidates') {
      const wantColor = msg.category === 'color';
      const type = wantColor ? 'COLOR' : 'FLOAT';
      const localVars = (await figma.variables.getLocalVariablesAsync()).filter(v => v.resolvedType === type);
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      const collName = new Map(collections.map(c => [c.id, c.name]));
      const varMap = new Map<string, ResolvableVar>(localVars.map(v => [v.id, { id: v.id, valuesByMode: v.valuesByMode as any }]));
      const resolved: ResolvedCandidate[] = localVars.map(v => {
        const modes = Object.keys(v.valuesByMode);
        const modeValues = modes.map(m => resolveVariableValue(v.id, m, varMap) as any);
        const first = modeValues[0];
        const colorHex = wantColor && first && typeof first === 'object' ? rgbaToHex(first) : undefined;
        const valuePreview = wantColor ? (colorHex ?? '—') : (typeof first === 'number' ? formatNumber(first) : '—');
        return { id: v.id, name: v.name, collectionName: collName.get(v.variableCollectionId) ?? '—',
          resolvedType: type, valuePreview, colorHex, modeValues };
      });
      const group = lastScan?.occurrencesAll.find(o => o.valueKey === msg.valueKey);
      const target = wantColor
        ? { kind: 'color' as const, colorHex: group?.colorHex ?? '', opacity: group?.opacity ?? 1 }
        : { kind: 'number' as const, num: group?.num ?? 0 };
      figma.ui.postMessage({ type: 'candidates', category: msg.category, valueKey: msg.valueKey,
        candidates: rankCandidates(target, resolved) });
    }
    else if (msg.type === 'replace') {
      const variable = await figma.variables.getVariableByIdAsync(msg.variableId);
      if (!variable) { figma.ui.postMessage({ type: 'error', message: 'That variable no longer exists — rescan.' }); return; }
      const occ = (lastScan?.occurrencesAll ?? []).filter(o => o.valueKey === msg.valueKey);
      let replaced = 0, skipped = 0;
      for (const o of occ) {
        const node = await figma.getNodeByIdAsync(o.nodeId);
        if (!node) { skipped++; continue; }
        try { await applyBinding(node as SceneNode, o, variable); replaced++; }
        catch { skipped++; }
      }
      // drop replaced occurrences from cache so a re-filter reflects reality
      if (lastScan) lastScan.occurrencesAll = lastScan.occurrencesAll.filter(o => o.valueKey !== msg.valueKey);
      figma.ui.postMessage({ type: 'action-result', ok: true,
        message: `Replaced ${replaced}${skipped ? `, skipped ${skipped}` : ''}.`,
        replacedValueKey: msg.valueKey, replacedCount: replaced, skippedCount: skipped });
    }
  } catch (e) {
    figma.ui.postMessage({ type: 'error', message: String((e as Error)?.message ?? e) });
  }
};
