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
      var lastScan = null;
      function isAliasValue(v) {
        return typeof v === "object" && v !== null && v.type === "VARIABLE_ALIAS";
      }
      function pushColorOccurrences(node, page, key, out) {
        const paints = node[key];
        if (!Array.isArray(paints))
          return;
        paints.forEach((paint, i) => {
          var _a, _b;
          if (paint.type !== "SOLID" || paint.visible === false)
            return;
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
      function collectNode(node, page, usedIds, refs, occ) {
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
        if ("fills" in node && node.fills !== figma.mixed)
          pushColorOccurrences(node, page, "fills", occ);
        if ("strokes" in node && Array.isArray(node.strokes))
          pushColorOccurrences(node, page, "strokes", occ);
        if ("cornerRadius" in node) {
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
        if ("strokeWeight" in node && Array.isArray(node.strokes) && node.strokes.length > 0) {
          const sw = node.strokeWeight;
          if (sw !== figma.mixed && typeof sw === "number" && sw > 0 && !(bv == null ? void 0 : bv.strokeWeight)) {
            pushNumberOccurrence(node, page, "strokeWeight", "strokeWeight", sw, occ);
          }
        }
        if ("layoutMode" in node && node.layoutMode !== "NONE") {
          const spacingFields = ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "itemSpacing", "counterAxisSpacing"];
          for (const f of spacingFields) {
            const val = node[f];
            if (typeof val === "number" && val > 0 && !(bv == null ? void 0 : bv[f]))
              pushNumberOccurrence(node, page, "spacing", f, val, occ);
          }
        }
        if (node.type === "TEXT") {
          const t = node;
          if (t.fontSize !== figma.mixed && typeof t.fontSize === "number" && !(bv == null ? void 0 : bv.fontSize))
            pushNumberOccurrence(node, page, "fontSize", "fontSize", t.fontSize, occ);
          if (t.lineHeight !== figma.mixed && t.lineHeight.unit && t.lineHeight.unit !== "AUTO" && !(bv == null ? void 0 : bv.lineHeight))
            pushNumberOccurrence(node, page, "lineHeight", "lineHeight", t.lineHeight.value, occ);
          if (t.letterSpacing !== figma.mixed && typeof t.letterSpacing.value === "number" && !(bv == null ? void 0 : bv.letterSpacing))
            pushNumberOccurrence(node, page, "letterSpacing", "letterSpacing", t.letterSpacing.value, occ);
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
          const localRaw = yield figma.variables.getLocalVariablesAsync();
          const collections = yield figma.variables.getLocalVariableCollectionsAsync();
          const collName = new Map(collections.map((c) => [c.id, c.name]));
          const usedIds = /* @__PURE__ */ new Set();
          for (const v of localRaw) {
            for (const modeId of Object.keys(v.valuesByMode)) {
              const val = v.valuesByMode[modeId];
              if (isAliasValue(val))
                usedIds.add(val.id);
            }
          }
          const refs = [];
          const occurrencesAll = [];
          let scanned = 0;
          for (const page of figma.root.children) {
            const nodes = page.findAll(() => true);
            for (const node of nodes) {
              collectNode(node, page, usedIds, refs, occurrencesAll);
              if (++scanned % 800 === 0)
                figma.ui.postMessage({ type: "scan-progress", scanned });
            }
          }
          const brokenAll = [];
          const existence = /* @__PURE__ */ new Map();
          for (const { id } of refs) {
            if (existence.has(id))
              continue;
            const v = yield figma.variables.getVariableByIdAsync(id);
            existence.set(id, v !== null);
          }
          for (const { id, ref } of refs)
            if (!existence.get(id))
              brokenAll.push(ref);
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
          const unused = computeUnused(infos, usedIds);
          return { unused, brokenAll, occurrencesAll };
        });
      }
      function filterByScope(scope) {
        if (!lastScan)
          return { scope, summary: { unused: 0, broken: 0, hardcoded: 0 }, unused: [], broken: [], hardcoded: [] };
        const currentPageId = figma.currentPage.id;
        const selIds = scope === "selection" ? collectSelectionIds() : null;
        const inScope = (nodeId, pageId) => scope === "document" ? true : scope === "page" ? pageId === currentPageId : !!selIds && selIds.has(nodeId);
        const broken = lastScan.brokenAll.filter((b) => inScope(b.nodeId, b.pageId));
        const occ = lastScan.occurrencesAll.filter((o) => inScope(o.nodeId, o.pageId));
        const hardcoded = groupHardcoded(occ);
        return {
          scope,
          summary: { unused: lastScan.unused.length, broken: broken.length, hardcoded: occ.length },
          unused: lastScan.unused,
          broken,
          hardcoded
        };
      }
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        var _a;
        try {
          if (msg.type === "scan") {
            lastScan = yield fullScan();
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(msg.scope) });
          } else if (msg.type === "set-scope") {
            if (!lastScan)
              lastScan = yield fullScan();
            figma.ui.postMessage({ type: "scan-result", result: filterByScope(msg.scope) });
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
            figma.ui.postMessage({
              type: "action-result",
              ok: true,
              message: `Deleted ${removed.length} variable${removed.length === 1 ? "" : "s"}.`,
              removedVariableIds: removed
            });
          }
        } catch (e) {
          figma.ui.postMessage({ type: "error", message: String((_a = e == null ? void 0 : e.message) != null ? _a : e) });
        }
      });
    }
  });
  require_code();
})();
