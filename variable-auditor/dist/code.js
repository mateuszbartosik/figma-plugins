"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/analysis.ts
  function channelToHex(v) {
    const n = Math.max(0, Math.min(255, Math.round(v * 255)));
    return n.toString(16).padStart(2, "0").toUpperCase();
  }
  function rgbaToHex(c) {
    return "#" + channelToHex(c.r) + channelToHex(c.g) + channelToHex(c.b);
  }
  function formatNumber(n) {
    return String(Number.parseFloat(n.toFixed(3)));
  }
  function groupMeta(kind, colorHex, opacity, num) {
    const category = CATEGORY_BY_KIND[kind];
    if (kind === "color") {
      const op = formatNumber(opacity != null ? opacity : 1);
      return { category, valueKey: `color:${colorHex}@${op}`, label: colorHex != null ? colorHex : "#000000" };
    }
    const val = formatNumber(num != null ? num : 0);
    return { category, valueKey: `${kind}:${val}`, label: `${LABEL_BY_KIND[kind]} \xB7 ${val}` };
  }
  function computeUnused(localVars, usedIds) {
    return localVars.filter((v) => !v.remote && !usedIds.has(v.id)).map((v) => ({
      id: v.id,
      name: v.name,
      collectionName: v.collectionName,
      resolvedType: v.resolvedType,
      valuePreview: v.valuePreview,
      colorHex: v.colorHex
    }));
  }
  function groupHardcoded(occurrences) {
    var _a, _b, _c;
    const byKey = /* @__PURE__ */ new Map();
    for (const o of occurrences) {
      let g = byKey.get(o.valueKey);
      if (!g) {
        g = {
          category: o.category,
          kind: o.kind,
          valueKey: o.valueKey,
          label: "",
          colorHex: o.colorHex,
          opacity: o.opacity,
          num: o.num,
          count: 0,
          occurrences: []
        };
        byKey.set(o.valueKey, g);
      }
      g.occurrences.push(o);
      g.count++;
    }
    const groups = [...byKey.values()];
    for (const g of groups) {
      g.label = groupMeta(g.kind, (_a = g.colorHex) != null ? _a : null, (_b = g.opacity) != null ? _b : null, (_c = g.num) != null ? _c : null).label;
    }
    groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return groups;
  }
  function groupUnlinked(refs) {
    const byKey = /* @__PURE__ */ new Map();
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
  function isAlias(v) {
    return typeof v === "object" && v !== null && v.type === "VARIABLE_ALIAS";
  }
  function resolveVariableValue(id, modeId, varMap, seen = /* @__PURE__ */ new Set()) {
    if (seen.has(id))
      return null;
    seen.add(id);
    const v = varMap.get(id);
    if (!v)
      return null;
    let val = v.valuesByMode[modeId];
    if (val === void 0) {
      const firstKey = Object.keys(v.valuesByMode)[0];
      if (firstKey === void 0)
        return null;
      val = v.valuesByMode[firstKey];
    }
    if (isAlias(val))
      return resolveVariableValue(val.id, modeId, varMap, seen);
    return val;
  }
  function matchesTarget(value, target) {
    var _a;
    if (value === null)
      return false;
    if (target.kind === "number") {
      return typeof value === "number" && Math.abs(value - target.num) < 1e-4;
    }
    if (typeof value !== "object")
      return false;
    const hex = rgbaToHex(value);
    const op = Number.parseFloat(((_a = value.a) != null ? _a : 1).toFixed(3));
    return hex === target.colorHex && Math.abs(op - target.opacity) < 1e-4;
  }
  function rankCandidates(target, candidates) {
    return candidates.map((c) => ({
      id: c.id,
      name: c.name,
      collectionName: c.collectionName,
      valuePreview: c.valuePreview,
      colorHex: c.colorHex,
      exact: c.modeValues.some((v) => matchesTarget(v, target))
    })).sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || a.collectionName.localeCompare(b.collectionName) || a.name.localeCompare(b.name));
  }
  var CATEGORY_BY_KIND, LABEL_BY_KIND;
  var init_analysis = __esm({
    "src/analysis.ts"() {
      "use strict";
      CATEGORY_BY_KIND = {
        color: "color",
        radius: "radiusStroke",
        strokeWeight: "radiusStroke",
        spacing: "spacing",
        fontSize: "typography",
        lineHeight: "typography",
        letterSpacing: "typography"
      };
      LABEL_BY_KIND = {
        radius: "Corner radius",
        strokeWeight: "Stroke weight",
        spacing: "Spacing",
        fontSize: "Font size",
        lineHeight: "Line height",
        letterSpacing: "Letter spacing"
      };
    }
  });

  // src/code.ts
  var require_code = __commonJS({
    "src/code.ts"(exports) {
      init_analysis();
      figma.showUI(__html__, { width: 404, height: 660 });
      var checks = { unused: true, broken: true, hardcoded: true, unlinked: true };
      var props = { color: true, radius: true, strokeWeight: true, spacing: true, typography: true };
      var lastScope = "page";
      var CHECKS_KEY = "variable-auditor:checks";
      var PROPS_KEY = "variable-auditor:props";
      (() => __async(exports, null, function* () {
        try {
          const saved = yield figma.clientStorage.getAsync(CHECKS_KEY);
          if (saved)
            checks = __spreadValues(__spreadValues({}, checks), saved);
        } catch (e) {
        }
        try {
          const savedProps = yield figma.clientStorage.getAsync(PROPS_KEY);
          if (savedProps)
            props = __spreadValues(__spreadValues({}, props), savedProps);
        } catch (e) {
        }
        figma.ui.postMessage({ type: "settings", checks, props });
      }))();
      var lastScan = null;
      var attachedKeysCache = null;
      function isAliasValue(v) {
        return typeof v === "object" && v !== null && v.type === "VARIABLE_ALIAS";
      }
      function pushColorOccurrences(node, page, key, out) {
        const paints = node[key];
        if (!Array.isArray(paints))
          return;
        paints.forEach((paint, i) => {
          var _a, _b;
          if (paint.visible === false)
            return;
          if (paint.type === "SOLID") {
            if ((_a = paint.boundVariables) == null ? void 0 : _a.color)
              return;
            const colorHex = rgbaToHex(__spreadProps(__spreadValues({}, paint.color), { a: 1 }));
            const opacity = (_b = paint.opacity) != null ? _b : 1;
            const meta = groupMeta("color", colorHex, opacity, null);
            out.push({
              nodeId: node.id,
              nodeName: node.name,
              pageId: page.id,
              pageName: page.name,
              category: meta.category,
              kind: "color",
              field: key,
              paintIndex: i,
              valueKey: meta.valueKey,
              colorHex,
              opacity
            });
            return;
          }
          if (paint.type === "GRADIENT_LINEAR" || paint.type === "GRADIENT_RADIAL" || paint.type === "GRADIENT_ANGULAR" || paint.type === "GRADIENT_DIAMOND") {
            pushGradientStopOccurrences(node, page, key, paint, i, out);
          }
        });
      }
      function pushGradientStopOccurrences(node, page, key, paint, paintIndex, out) {
        paint.gradientStops.forEach((stop) => {
          var _a, _b;
          if ((_a = stop.boundVariables) == null ? void 0 : _a.color)
            return;
          const colorHex = rgbaToHex(stop.color);
          const opacity = (_b = stop.color.a) != null ? _b : 1;
          const meta = groupMeta("color", colorHex, opacity, null);
          out.push({
            nodeId: node.id,
            nodeName: node.name,
            pageId: page.id,
            pageName: page.name,
            category: meta.category,
            kind: "color",
            field: `${key}[gradientStop]`,
            paintIndex,
            valueKey: meta.valueKey,
            colorHex,
            opacity,
            replaceable: false
          });
        });
      }
      function pushEffectColorOccurrences(node, page, out) {
        const effects = node.effects;
        if (!Array.isArray(effects))
          return;
        effects.forEach((effect) => {
          var _a, _b;
          if (effect.type !== "DROP_SHADOW" && effect.type !== "INNER_SHADOW")
            return;
          if (effect.visible === false)
            return;
          if ((_a = effect.boundVariables) == null ? void 0 : _a.color)
            return;
          const colorHex = rgbaToHex(effect.color);
          const opacity = (_b = effect.color.a) != null ? _b : 1;
          const meta = groupMeta("color", colorHex, opacity, null);
          out.push({
            nodeId: node.id,
            nodeName: node.name,
            pageId: page.id,
            pageName: page.name,
            category: meta.category,
            kind: "color",
            field: "effects",
            valueKey: meta.valueKey,
            colorHex,
            opacity,
            replaceable: false
          });
        });
      }
      function pushNumberOccurrence(node, page, kind, field, num, out) {
        const meta = groupMeta(kind, null, null, num);
        out.push({
          nodeId: node.id,
          nodeName: node.name,
          pageId: page.id,
          pageName: page.name,
          category: meta.category,
          kind,
          field,
          valueKey: meta.valueKey,
          num
        });
      }
      function collectNode(node, page, usedIds, refs, occ, collectHardcoded, props2) {
        const bv = node.boundVariables;
        if (bv) {
          for (const field of Object.keys(bv)) {
            const entry = bv[field];
            const aliases = field === "componentProperties" && entry && typeof entry === "object" && !Array.isArray(entry) ? Object.values(entry) : Array.isArray(entry) ? entry : [entry];
            for (const a of aliases) {
              if (a && typeof a.id === "string") {
                usedIds.add(a.id);
                refs.push({ id: a.id, ref: {
                  nodeId: node.id,
                  nodeName: node.name,
                  pageId: page.id,
                  pageName: page.name,
                  field,
                  variableId: a.id
                } });
              }
            }
          }
        }
        if (collectHardcoded) {
          if (props2.color) {
            if ("fills" in node && node.fills !== figma.mixed)
              pushColorOccurrences(node, page, "fills", occ);
            if ("strokes" in node && Array.isArray(node.strokes))
              pushColorOccurrences(node, page, "strokes", occ);
            if ("effects" in node)
              pushEffectColorOccurrences(node, page, occ);
          }
          if (props2.radius && "cornerRadius" in node) {
            const cr = node.cornerRadius;
            if (cr !== figma.mixed && typeof cr === "number") {
              if (cr > 0 && !(bv == null ? void 0 : bv.cornerRadius) && !(bv == null ? void 0 : bv.topLeftRadius))
                pushNumberOccurrence(node, page, "radius", "cornerRadius", cr, occ);
            } else if (cr === figma.mixed && "topLeftRadius" in node) {
              for (const f of ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]) {
                const val = node[f];
                if (typeof val === "number" && val > 0 && !(bv == null ? void 0 : bv[f]))
                  pushNumberOccurrence(node, page, "radius", f, val, occ);
              }
            }
          }
          if (props2.strokeWeight && "strokeWeight" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
            const sw = node.strokeWeight;
            if (sw !== figma.mixed && typeof sw === "number" && sw > 0 && !(bv == null ? void 0 : bv.strokeWeight)) {
              pushNumberOccurrence(node, page, "strokeWeight", "strokeWeight", sw, occ);
            }
          }
          if (props2.spacing && "layoutMode" in node && node.layoutMode !== "NONE") {
            const paddingFields = ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];
            for (const f of paddingFields) {
              const val = node[f];
              if (typeof val === "number" && val > 0 && !(bv == null ? void 0 : bv[f]))
                pushNumberOccurrence(node, page, "spacing", f, val, occ);
            }
            if (node.primaryAxisAlignItems !== "SPACE_BETWEEN") {
              const itemSpacing = node.itemSpacing;
              if (typeof itemSpacing === "number" && itemSpacing > 0 && !(bv == null ? void 0 : bv.itemSpacing)) {
                pushNumberOccurrence(node, page, "spacing", "itemSpacing", itemSpacing, occ);
              }
            }
            if (node.layoutWrap === "WRAP") {
              const counterAxisSpacing = node.counterAxisSpacing;
              if (typeof counterAxisSpacing === "number" && counterAxisSpacing > 0 && !(bv == null ? void 0 : bv.counterAxisSpacing)) {
                pushNumberOccurrence(node, page, "spacing", "counterAxisSpacing", counterAxisSpacing, occ);
              }
            }
          }
          if (props2.typography && node.type === "TEXT") {
            const t = node;
            if (t.fontSize !== figma.mixed && typeof t.fontSize === "number" && !(bv == null ? void 0 : bv.fontSize))
              pushNumberOccurrence(node, page, "fontSize", "fontSize", t.fontSize, occ);
            if (t.lineHeight !== figma.mixed && t.lineHeight.unit && t.lineHeight.unit !== "AUTO" && !(bv == null ? void 0 : bv.lineHeight))
              pushNumberOccurrence(node, page, "lineHeight", "lineHeight", t.lineHeight.value, occ);
            if (t.letterSpacing !== figma.mixed && typeof t.letterSpacing.value === "number" && t.letterSpacing.value !== 0 && !(bv == null ? void 0 : bv.letterSpacing))
              pushNumberOccurrence(node, page, "letterSpacing", "letterSpacing", t.letterSpacing.value, occ);
          }
        }
      }
      function collectSelectionIds() {
        const ids = /* @__PURE__ */ new Set();
        const walk = (n) => {
          ids.add(n.id);
          if ("children" in n)
            for (const c of n.children)
              walk(c);
        };
        for (const n of figma.currentPage.selection)
          walk(n);
        return ids;
      }
      function fullScan() {
        return __async(this, null, function* () {
          figma.skipInvisibleInstanceChildren = true;
          yield figma.loadAllPagesAsync();
          const usedIds = /* @__PURE__ */ new Set();
          let localRaw = [];
          let collName = /* @__PURE__ */ new Map();
          if (checks.unused) {
            localRaw = yield figma.variables.getLocalVariablesAsync();
            const collections = yield figma.variables.getLocalVariableCollectionsAsync();
            collName = new Map(collections.map((c) => [c.id, c.name]));
            for (const v of localRaw) {
              for (const modeId of Object.keys(v.valuesByMode)) {
                const val = v.valuesByMode[modeId];
                if (isAliasValue(val))
                  usedIds.add(val.id);
              }
            }
          }
          let attachedKeys = /* @__PURE__ */ new Set();
          let teamLibOk = false;
          if (checks.unlinked) {
            if (attachedKeysCache !== null) {
              attachedKeys = attachedKeysCache;
              teamLibOk = true;
            } else {
              try {
                const avail = yield figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                attachedKeys = new Set(avail.map((c) => c.key));
                attachedKeysCache = attachedKeys;
                teamLibOk = true;
              } catch (e) {
                teamLibOk = false;
              }
            }
          }
          const refs = [];
          const occurrencesAll = [];
          let scanned = 0;
          for (const page of figma.root.children) {
            const nodes = page.findAll(() => true);
            for (const node of nodes) {
              collectNode(node, page, usedIds, refs, occurrencesAll, checks.hardcoded, props);
              if (++scanned % 800 === 0)
                figma.ui.postMessage({ type: "scan-progress", scanned });
            }
          }
          const brokenAll = [];
          const unlinkedRefsAll = [];
          if (checks.broken || checks.unlinked) {
            const resolvedVar = /* @__PURE__ */ new Map();
            const resolvedColl = /* @__PURE__ */ new Map();
            const unlinkedMark = /* @__PURE__ */ new Map();
            for (const { id } of refs) {
              if (resolvedVar.has(id))
                continue;
              const v = yield figma.variables.getVariableByIdAsync(id);
              resolvedVar.set(id, v);
              if (v === null)
                continue;
              if (checks.unlinked && teamLibOk && v.remote) {
                let c = resolvedColl.get(v.variableCollectionId);
                if (c === void 0) {
                  c = yield figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
                  resolvedColl.set(v.variableCollectionId, c);
                }
                if (c && !attachedKeys.has(c.key)) {
                  unlinkedMark.set(id, { variableName: v.name, collectionName: c.name, collectionKey: c.key });
                }
              }
            }
            if (checks.broken) {
              for (const { id, ref } of refs)
                if (resolvedVar.get(id) === null)
                  brokenAll.push(ref);
            }
            if (checks.unlinked) {
              for (const { id, ref } of refs) {
                const mark = unlinkedMark.get(id);
                if (mark) {
                  unlinkedRefsAll.push({
                    nodeId: ref.nodeId,
                    nodeName: ref.nodeName,
                    pageId: ref.pageId,
                    pageName: ref.pageName,
                    field: ref.field,
                    variableName: mark.variableName,
                    collectionName: mark.collectionName,
                    collectionKey: mark.collectionKey
                  });
                }
              }
            }
          }
          let unused = [];
          if (checks.unused) {
            const firstModeValue = (v) => v.valuesByMode[Object.keys(v.valuesByMode)[0]];
            const infos = localRaw.map((v) => {
              var _a;
              const isColor = v.resolvedType === "COLOR";
              const mv = firstModeValue(v);
              const colorHex = isColor && mv && typeof mv === "object" && !isAliasValue(mv) ? rgbaToHex(mv) : void 0;
              const valuePreview = colorHex != null ? colorHex : typeof mv === "number" ? formatNumber(mv) : isAliasValue(mv) ? "\u2192 alias" : String(mv);
              return {
                id: v.id,
                name: v.name,
                collectionName: (_a = collName.get(v.variableCollectionId)) != null ? _a : "\u2014",
                resolvedType: v.resolvedType,
                remote: v.remote,
                valuePreview,
                colorHex
              };
            });
            unused = computeUnused(infos, usedIds);
          }
          return { unused, brokenAll, occurrencesAll, unlinkedRefsAll };
        });
      }
      function filterByScope(scope) {
        if (!lastScan)
          return { scope, summary: { unused: 0, broken: 0, hardcoded: 0, unlinked: 0 }, unused: [], broken: [], hardcoded: [], unlinked: [] };
        const currentPageId = figma.currentPage.id;
        const selIds = scope === "selection" ? collectSelectionIds() : null;
        const inScope = (nodeId, pageId) => scope === "document" ? true : scope === "page" ? pageId === currentPageId : !!selIds && selIds.has(nodeId);
        const broken = lastScan.brokenAll.filter((b) => inScope(b.nodeId, b.pageId));
        const occ = lastScan.occurrencesAll.filter((o) => inScope(o.nodeId, o.pageId));
        const hardcoded = groupHardcoded(occ);
        const unlinkedRefs = lastScan.unlinkedRefsAll.filter((u) => inScope(u.nodeId, u.pageId));
        const unlinked = groupUnlinked(unlinkedRefs);
        return {
          scope,
          summary: { unused: lastScan.unused.length, broken: broken.length, hardcoded: occ.length, unlinked: unlinkedRefs.length },
          unused: lastScan.unused,
          broken,
          hardcoded,
          unlinked
        };
      }
      function applyBinding(node, o, variable) {
        return __async(this, null, function* () {
          var _a;
          if (o.kind === "color") {
            const key = o.field;
            const paints = node[key].slice();
            const p = paints[(_a = o.paintIndex) != null ? _a : -1];
            if (!p || p.type !== "SOLID")
              throw new Error("paint gone");
            paints[o.paintIndex] = figma.variables.setBoundVariableForPaint(p, "color", variable);
            node[key] = paints;
          } else if (o.field === "cornerRadius") {
            node.setBoundVariable("cornerRadius", variable);
          } else {
            if (node.type === "TEXT" && node.fontName !== figma.mixed)
              yield figma.loadFontAsync(node.fontName);
            node.setBoundVariable(o.field, variable);
          }
        });
      }
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        var _a, _b, _c, _d, _e, _f;
        try {
          if (msg.type === "scan") {
            lastScope = msg.scope;
            attachedKeysCache = null;
            lastScan = yield fullScan();
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(msg.scope) });
          } else if (msg.type === "set-scope") {
            lastScope = msg.scope;
            if (!lastScan)
              lastScan = yield fullScan();
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(msg.scope) });
          } else if (msg.type === "set-checks") {
            checks = msg.checks;
            props = msg.props;
            figma.clientStorage.setAsync(CHECKS_KEY, checks).catch(() => {
            });
            figma.clientStorage.setAsync(PROPS_KEY, props).catch(() => {
            });
            if (lastScan) {
              lastScan = yield fullScan();
              figma.ui.postMessage({ type: "scan-result", result: filterByScope(lastScope) });
            }
          } else if (msg.type === "navigate") {
            const node = yield figma.getNodeByIdAsync(msg.nodeId);
            if (!node) {
              figma.ui.postMessage({ type: "error", message: "That layer no longer exists \u2014 rescan." });
              return;
            }
            const page = yield figma.getNodeByIdAsync(msg.pageId);
            if (page && page.type === "PAGE" && figma.currentPage.id !== page.id) {
              yield figma.setCurrentPageAsync(page);
            }
            figma.currentPage.selection = [node];
            figma.viewport.scrollAndZoomIntoView([node]);
          } else if (msg.type === "detach") {
            const node = yield figma.getNodeByIdAsync(msg.nodeId);
            if (!node) {
              figma.ui.postMessage({ type: "error", message: "That layer no longer exists \u2014 rescan." });
              return;
            }
            try {
              node.setBoundVariable(msg.field, null);
            } catch (e) {
              figma.ui.postMessage({ type: "error", message: String((_a = e == null ? void 0 : e.message) != null ? _a : e) });
              return;
            }
            if (lastScan) {
              lastScan.brokenAll = lastScan.brokenAll.filter((b) => !(b.nodeId === msg.nodeId && b.field === msg.field));
            }
            figma.notify("Detached binding");
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(lastScope) });
          } else if (msg.type === "delete-variables") {
            const removed = [];
            for (const id of msg.ids) {
              const v = yield figma.variables.getVariableByIdAsync(id);
              if (v) {
                try {
                  v.remove();
                  removed.push(id);
                } catch (e) {
                }
              }
            }
            if (lastScan && removed.length) {
              const removedSet = new Set(removed);
              lastScan.unused = lastScan.unused.filter((u) => !removedSet.has(u.id));
            }
            figma.ui.postMessage({
              type: "action-result",
              ok: true,
              message: `Deleted ${removed.length} variable${removed.length === 1 ? "" : "s"}.`,
              removedVariableIds: removed
            });
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(lastScope) });
          } else if (msg.type === "get-candidates") {
            const wantColor = msg.category === "color";
            const type = wantColor ? "COLOR" : "FLOAT";
            const localVars = (yield figma.variables.getLocalVariablesAsync()).filter((v) => v.resolvedType === type);
            const collections = yield figma.variables.getLocalVariableCollectionsAsync();
            const collName = new Map(collections.map((c) => [c.id, c.name]));
            const varMap = new Map(localVars.map((v) => [v.id, { id: v.id, valuesByMode: v.valuesByMode }]));
            const resolved = localVars.map((v) => {
              var _a2;
              const modes = Object.keys(v.valuesByMode);
              const modeValues = modes.map((m) => resolveVariableValue(v.id, m, varMap));
              const first = modeValues[0];
              const colorHex = wantColor && first && typeof first === "object" ? rgbaToHex(first) : void 0;
              const valuePreview = wantColor ? colorHex != null ? colorHex : "\u2014" : typeof first === "number" ? formatNumber(first) : "\u2014";
              return {
                id: v.id,
                name: v.name,
                collectionName: (_a2 = collName.get(v.variableCollectionId)) != null ? _a2 : "\u2014",
                resolvedType: type,
                valuePreview,
                colorHex,
                modeValues
              };
            });
            const group = lastScan == null ? void 0 : lastScan.occurrencesAll.find((o) => o.valueKey === msg.valueKey);
            const target = wantColor ? { kind: "color", colorHex: (_b = group == null ? void 0 : group.colorHex) != null ? _b : "", opacity: (_c = group == null ? void 0 : group.opacity) != null ? _c : 1 } : { kind: "number", num: (_d = group == null ? void 0 : group.num) != null ? _d : 0 };
            figma.ui.postMessage({
              type: "candidates",
              category: msg.category,
              valueKey: msg.valueKey,
              candidates: rankCandidates(target, resolved)
            });
          } else if (msg.type === "replace") {
            const variable = yield figma.variables.getVariableByIdAsync(msg.variableId);
            if (!variable) {
              figma.ui.postMessage({ type: "error", message: "That variable no longer exists \u2014 rescan." });
              return;
            }
            const occ = ((_e = lastScan == null ? void 0 : lastScan.occurrencesAll) != null ? _e : []).filter((o) => o.valueKey === msg.valueKey);
            let replaced = 0, skipped = 0;
            for (const o of occ) {
              if (o.replaceable === false) {
                skipped++;
                continue;
              }
              const node = yield figma.getNodeByIdAsync(o.nodeId);
              if (!node) {
                skipped++;
                continue;
              }
              try {
                yield applyBinding(node, o, variable);
                replaced++;
              } catch (e) {
                skipped++;
              }
            }
            if (lastScan) {
              lastScan.occurrencesAll = lastScan.occurrencesAll.filter((o) => !(o.valueKey === msg.valueKey && o.replaceable !== false));
              if (replaced > 0)
                lastScan.unused = lastScan.unused.filter((u) => u.id !== variable.id);
            }
            figma.ui.postMessage({
              type: "action-result",
              ok: true,
              message: `Replaced ${replaced}${skipped ? `, skipped ${skipped}` : ""}.`,
              replacedValueKey: msg.valueKey,
              replacedCount: replaced,
              skippedCount: skipped
            });
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(lastScope) });
          }
        } catch (e) {
          figma.ui.postMessage({ type: "error", message: String((_f = e == null ? void 0 : e.message) != null ? _f : e) });
        }
      });
    }
  });
  require_code();
})();
