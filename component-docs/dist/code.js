"use strict";
(() => {
  var __defProp = Object.defineProperty;
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

  // src/code.ts
  var require_code = __commonJS({
    "src/code.ts"(exports) {
      figma.showUI(__html__, { width: 360, height: 480, title: "Component Docs" });
      var DESC_PLACEHOLDER = "Add a description for this component\u2026";
      var KEY_DOC = "docId";
      var KEY_SOURCE = "sourceId";
      var KEY_OPTS = "options";
      var KEY_DESC = "description";
      function linkNodes(source, doc) {
        source.setPluginData(KEY_DOC, doc.id);
        doc.setPluginData(KEY_SOURCE, source.id);
      }
      function resolveLiveNode(id) {
        return __async(this, null, function* () {
          if (!id)
            return null;
          let node = null;
          try {
            node = yield figma.getNodeByIdAsync(id);
          } catch (e) {
            return null;
          }
          if (!node)
            return null;
          if (node.removed)
            return null;
          return node;
        });
      }
      function saveDocMeta(doc, opts, description) {
        doc.setPluginData(KEY_OPTS, JSON.stringify(opts));
        doc.setPluginData(KEY_DESC, description);
      }
      function readDocOptions(doc) {
        const raw = doc.getPluginData(KEY_OPTS);
        if (!raw)
          return null;
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      }
      function readDocSourceId(doc) {
        return doc.getPluginData(KEY_SOURCE);
      }
      function readSourceDocId(source) {
        return source.getPluginData(KEY_DOC);
      }
      function isDocFrame(node) {
        return node.getPluginData(KEY_SOURCE) !== "";
      }
      function loadFonts() {
        return __async(this, null, function* () {
          yield Promise.all([
            figma.loadFontAsync({ family: "Inter", style: "Regular" }),
            figma.loadFontAsync({ family: "Inter", style: "Medium" }),
            figma.loadFontAsync({ family: "Inter", style: "Bold" })
          ]);
        });
      }
      var PAD_H = 24;
      var MIN_CONTENT_W = 512;
      var COL1 = 160;
      var COL2 = 100;
      function calcWidths(comp) {
        let maxW = MIN_CONTENT_W;
        if (comp.type === "COMPONENT_SET") {
          for (const child of comp.children) {
            const w = child.width;
            if (w > maxW)
              maxW = w;
          }
        } else {
          if (comp.width > maxW)
            maxW = comp.width;
        }
        return { contentW: maxW, docW: maxW + PAD_H * 2 };
      }
      function rgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 };
      }
      function fill(hex) {
        return { type: "SOLID", color: rgb(hex) };
      }
      function frame(name) {
        const f = figma.createFrame();
        f.name = name;
        f.fills = [];
        f.clipsContent = false;
        return f;
      }
      function vStack(f, w, gap, padH = 0, padV = 0) {
        f.layoutMode = "VERTICAL";
        f.itemSpacing = gap;
        f.paddingLeft = padH;
        f.paddingRight = padH;
        f.paddingTop = padV;
        f.paddingBottom = padV;
        f.resize(w, 100);
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "FIXED";
      }
      function hStack(f, gap, padH = 0, padV = 0) {
        f.layoutMode = "HORIZONTAL";
        f.itemSpacing = gap;
        f.paddingLeft = padH;
        f.paddingRight = padH;
        f.paddingTop = padV;
        f.paddingBottom = padV;
        f.primaryAxisSizingMode = "AUTO";
        f.counterAxisSizingMode = "AUTO";
      }
      function txt(content, size, style, color = "#1A1A1A") {
        const t = figma.createText();
        t.fontName = { family: "Inter", style };
        t.characters = content;
        t.fontSize = size;
        t.fills = [fill(color)];
        return t;
      }
      function pill(label, bg, fg) {
        const f = frame(`pill-${label}`);
        f.fills = [fill(bg)];
        f.cornerRadius = 4;
        hStack(f, 0, 6, 3);
        const t = figma.createText();
        t.fontName = { family: "Inter", style: "Medium" };
        t.characters = label;
        t.fontSize = 10;
        t.fills = [fill(fg)];
        f.appendChild(t);
        return f;
      }
      function componentBadge(name) {
        const f = frame("component-badge");
        f.fills = [fill("#F0F0F0")];
        f.cornerRadius = 4;
        hStack(f, 5, 7, 4);
        const icon = figma.createText();
        icon.fontName = { family: "Inter", style: "Regular" };
        icon.characters = "\u25C6";
        icon.fontSize = 8;
        icon.fills = [fill("#888888")];
        f.appendChild(icon);
        const label = figma.createText();
        label.fontName = { family: "Inter", style: "Medium" };
        label.characters = name;
        label.fontSize = 10;
        label.fills = [fill("#444444")];
        f.appendChild(label);
        return f;
      }
      function hr(w) {
        const f = figma.createFrame();
        f.name = "divider";
        f.fills = [fill("#E6E6E6")];
        f.resize(w, 1);
        return f;
      }
      function tableCell(width, height, child) {
        const cell = frame("cell");
        cell.layoutMode = "HORIZONTAL";
        cell.paddingLeft = 12;
        cell.paddingRight = 12;
        cell.primaryAxisAlignItems = "MIN";
        cell.counterAxisAlignItems = "CENTER";
        cell.resize(width, height);
        cell.primaryAxisSizingMode = "FIXED";
        cell.counterAxisSizingMode = "FIXED";
        child.layoutAlign = "CENTER";
        cell.appendChild(child);
        return cell;
      }
      function buildPropsTable(props, contentW) {
        const col3 = contentW - COL1 - COL2;
        const tableW = contentW;
        const ROW_H = 36;
        const table = frame("props-table");
        table.layoutMode = "VERTICAL";
        table.itemSpacing = 0;
        table.fills = [fill("#FAFAFA")];
        table.cornerRadius = 8;
        table.strokeWeight = 1;
        table.strokes = [fill("#E6E6E6")];
        table.clipsContent = true;
        table.resize(tableW, 100);
        table.primaryAxisSizingMode = "AUTO";
        table.counterAxisSizingMode = "FIXED";
        const headerRow = frame("header-row");
        headerRow.layoutMode = "HORIZONTAL";
        headerRow.itemSpacing = 0;
        headerRow.fills = [fill("#F0F0F0")];
        headerRow.resize(tableW, ROW_H);
        headerRow.primaryAxisSizingMode = "AUTO";
        headerRow.counterAxisSizingMode = "FIXED";
        const colWidths = [COL1, COL2, col3];
        const headers = ["Property", "Type", "Values / Default"];
        headers.forEach((h, i) => {
          const t = txt(h, 11, "Bold", "#6E6E6E");
          t.textAutoResize = "TRUNCATE";
          t.resize(colWidths[i] - 24, 16);
          headerRow.appendChild(tableCell(colWidths[i], ROW_H, t));
        });
        table.appendChild(headerRow);
        props.forEach((prop, idx) => {
          const row = frame("row");
          row.layoutMode = "HORIZONTAL";
          row.itemSpacing = 0;
          row.fills = [fill(idx % 2 === 1 ? "#F7F7F7" : "#FFFFFF")];
          row.resize(tableW, ROW_H);
          row.primaryAxisSizingMode = "AUTO";
          row.counterAxisSizingMode = "FIXED";
          const nameT = txt(prop.name, 12, "Medium");
          nameT.textAutoResize = "TRUNCATE";
          nameT.resize(COL1 - 24, 16);
          row.appendChild(tableCell(COL1, ROW_H, nameT));
          const { bg, fg, label } = typeStyle(prop.type);
          row.appendChild(tableCell(COL2, ROW_H, pill(label, bg, fg)));
          let col3Child;
          if (prop.type === "INSTANCE_SWAP" && prop.defaultValue) {
            col3Child = componentBadge(prop.defaultValue);
          } else {
            const valStr = prop.options.length > 0 ? prop.options.join(" \xB7 ") : `Default: ${prop.defaultValue}`;
            const valT = txt(valStr, 11, "Regular", "#6E6E6E");
            valT.textAutoResize = "TRUNCATE";
            valT.resize(col3 - 24, 16);
            col3Child = valT;
          }
          row.appendChild(tableCell(col3, ROW_H, col3Child));
          table.appendChild(row);
        });
        return table;
      }
      var TYPE_STYLES = {
        VARIANT: { bg: "#F3EEFF", fg: "#7C3AED", label: "Variant" },
        BOOLEAN: { bg: "#F0FDF9", fg: "#0D9488", label: "Boolean" },
        TEXT: { bg: "#FFFBEB", fg: "#B45309", label: "Text" }
      };
      function typeStyle(type) {
        var _a;
        return (_a = TYPE_STYLES[type]) != null ? _a : { bg: "#EFF6FF", fg: "#2563EB", label: "Instance" };
      }
      function formatVariantName(raw) {
        return raw.split(",").map((part) => {
          var _a, _b;
          return (_b = (_a = part.split("=").pop()) == null ? void 0 : _a.trim()) != null ? _b : part.trim();
        }).join(" / ");
      }
      function buildVariantGrid(componentSet, contentW, maxItems) {
        return __async(this, null, function* () {
          const variants = [...componentSet.children];
          const shown = variants.slice(0, maxItems);
          const grid = frame("variant-grid");
          grid.layoutMode = "HORIZONTAL";
          grid.layoutWrap = "WRAP";
          grid.itemSpacing = 16;
          grid.counterAxisSpacing = 20;
          grid.resize(contentW, 100);
          grid.primaryAxisSizingMode = "FIXED";
          grid.counterAxisSizingMode = "AUTO";
          for (const variant of shown) {
            const wrapper = frame("variant-wrapper");
            wrapper.layoutMode = "VERTICAL";
            wrapper.itemSpacing = 8;
            wrapper.counterAxisAlignItems = "CENTER";
            wrapper.primaryAxisSizingMode = "AUTO";
            wrapper.counterAxisSizingMode = "AUTO";
            const instance = variant.createInstance();
            instance.layoutAlign = "INHERIT";
            instance.layoutSizingHorizontal = "FIXED";
            instance.layoutSizingVertical = "FIXED";
            wrapper.appendChild(instance);
            const label = txt(formatVariantName(variant.name), 10, "Regular", "#6E6E6E");
            label.textAutoResize = "WIDTH_AND_HEIGHT";
            label.textAlignHorizontal = "CENTER";
            wrapper.appendChild(label);
            grid.appendChild(wrapper);
          }
          return grid;
        });
      }
      function transferChildren(from, to) {
        for (const child of [...to.children])
          child.remove();
        for (const child of [...from.children])
          to.appendChild(child);
      }
      function readExistingDescription(source) {
        return __async(this, null, function* () {
          const doc = yield resolveLiveNode(readSourceDocId(source));
          if (!doc || doc.type !== "FRAME")
            return DESC_PLACEHOLDER;
          const cached = doc.getPluginData(KEY_DESC);
          const section = doc.findOne(
            (n) => n.type === "FRAME" && n.name === "description-section"
          );
          if (!section)
            return cached || DESC_PLACEHOLDER;
          const texts = section.children.filter((n) => n.type === "TEXT");
          const valueNode = texts[texts.length - 1];
          if (!valueNode)
            return cached || DESC_PLACEHOLDER;
          const text = valueNode.characters.trim();
          return text && text !== DESC_PLACEHOLDER ? valueNode.characters : DESC_PLACEHOLDER;
        });
      }
      function generateDocs(nodeId, options) {
        return __async(this, null, function* () {
          var _a;
          const node = yield figma.getNodeByIdAsync(nodeId);
          if (!node)
            throw new Error("Node not found.");
          if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
            throw new Error("Select a Component or Component Set.");
          }
          yield loadFonts();
          const isSet = node.type === "COMPONENT_SET";
          const comp = node;
          const descriptionText = yield readExistingDescription(comp);
          const { contentW, docW } = calcWidths(comp);
          const defs = (_a = comp.componentPropertyDefinitions) != null ? _a : {};
          const props = yield Promise.all(
            Object.entries(defs).map((_0) => __async(this, [_0], function* ([rawName, def]) {
              var _a2;
              let defaultValue = String(def.defaultValue);
              if (def.type === "INSTANCE_SWAP" && def.defaultValue) {
                const ref = yield figma.getNodeByIdAsync(String(def.defaultValue));
                if (ref)
                  defaultValue = ref.name;
              }
              return {
                name: rawName.includes("#") ? rawName.split("#")[0] : rawName,
                type: def.type,
                options: (_a2 = def.variantOptions) != null ? _a2 : [],
                defaultValue
              };
            }))
          );
          const variantCount = isSet ? comp.children.length : 0;
          const doc = frame(`\u{1F4C4} ${comp.name} \u2014 Documentation`);
          doc.fills = [fill("#FFFFFF")];
          doc.cornerRadius = 12;
          doc.strokeWeight = 1;
          doc.strokes = [fill("#E6E6E6")];
          doc.clipsContent = false;
          vStack(doc, docW, 0, 0, 0);
          const header = frame("header");
          header.fills = [fill("#F8F8F8")];
          vStack(header, docW, 6, PAD_H, 20);
          const titleRow = frame("title-row");
          hStack(titleRow, 10, 0, 0);
          titleRow.counterAxisAlignItems = "CENTER";
          titleRow.appendChild(txt(comp.name, 20, "Bold"));
          titleRow.appendChild(pill(isSet ? "Component Set" : "Component", "#EFF6FF", "#2563EB"));
          header.appendChild(titleRow);
          const metaParts = [];
          if (props.length > 0)
            metaParts.push(`${props.length} ${props.length === 1 ? "property" : "properties"}`);
          if (isSet && variantCount > 0)
            metaParts.push(`${variantCount} variants`);
          header.appendChild(txt(metaParts.join("  \xB7  ") || "No properties", 12, "Regular", "#6E6E6E"));
          doc.appendChild(header);
          doc.appendChild(hr(docW));
          if (options.includeNotes) {
            const hasDesc = descriptionText !== DESC_PLACEHOLDER;
            const notesSection = frame("description-section");
            vStack(notesSection, docW, 8, PAD_H, 20);
            notesSection.appendChild(txt("DESCRIPTION", 10, "Bold", "#AAAAAA"));
            notesSection.appendChild(
              txt(descriptionText, 13, "Regular", hasDesc ? "#1A1A1A" : "#CCCCCC")
            );
            doc.appendChild(notesSection);
            doc.appendChild(hr(docW));
          }
          if (options.includeProps && props.length > 0) {
            const propsSection = frame("properties-section");
            vStack(propsSection, docW, 12, PAD_H, 20);
            propsSection.appendChild(txt(`PROPERTIES (${props.length})`, 10, "Bold", "#AAAAAA"));
            propsSection.appendChild(buildPropsTable(props, contentW));
            doc.appendChild(propsSection);
          }
          if (options.includeVariants && isSet && variantCount > 0) {
            doc.appendChild(hr(docW));
            const varSection = frame("variants-section");
            vStack(varSection, docW, 16, PAD_H, 20);
            varSection.appendChild(txt(`VARIANTS (${variantCount})`, 10, "Bold", "#AAAAAA"));
            const MAX_VARIANTS = 24;
            const grid = yield buildVariantGrid(comp, contentW, MAX_VARIANTS);
            varSection.appendChild(grid);
            if (variantCount > MAX_VARIANTS) {
              varSection.appendChild(
                txt(`+ ${variantCount - MAX_VARIANTS} more variants not shown`, 11, "Regular", "#CCCCCC")
              );
            }
            doc.appendChild(varSection);
          }
          const existingDoc = yield resolveLiveNode(readSourceDocId(comp));
          const isUpdate = existingDoc !== null && existingDoc.type === "FRAME";
          let finalDoc;
          if (isUpdate) {
            const target = existingDoc;
            transferChildren(doc, target);
            target.resize(docW, target.height);
            target.name = doc.name;
            doc.remove();
            finalDoc = target;
          } else {
            const bounds = comp.absoluteBoundingBox;
            doc.x = bounds.x + bounds.width + 80;
            doc.y = bounds.y;
            figma.currentPage.appendChild(doc);
            finalDoc = doc;
          }
          linkNodes(comp, finalDoc);
          saveDocMeta(finalDoc, options, descriptionText);
          figma.currentPage.selection = [finalDoc];
          figma.viewport.scrollAndZoomIntoView([finalDoc]);
          return { propCount: props.length, variantCount, mode: isUpdate ? "update" : "generate" };
        });
      }
      function getSelectionInfo() {
        return __async(this, null, function* () {
          var _a;
          const sel = figma.currentPage.selection;
          if (!sel.length)
            return null;
          const selected = sel[0];
          let source = null;
          let docNode = null;
          if (selected.type === "COMPONENT" || selected.type === "COMPONENT_SET") {
            source = selected;
            const docId = readSourceDocId(source);
            docNode = yield resolveLiveNode(docId);
          } else if (isDocFrame(selected)) {
            const resolvedSource = yield resolveLiveNode(readDocSourceId(selected));
            if (resolvedSource && (resolvedSource.type === "COMPONENT" || resolvedSource.type === "COMPONENT_SET")) {
              source = resolvedSource;
              docNode = selected;
            }
          }
          if (!source)
            return null;
          const hasLiveDoc = docNode !== null && docNode.type === "FRAME";
          const defs = (_a = source.componentPropertyDefinitions) != null ? _a : {};
          return {
            id: source.id,
            name: source.name,
            type: source.type,
            propCount: Object.keys(defs).length,
            variantCount: source.type === "COMPONENT_SET" ? source.children.length : 0,
            mode: hasLiveDoc ? "update" : "generate",
            docId: hasLiveDoc ? docNode.id : null,
            options: hasLiveDoc ? readDocOptions(docNode) : null
          };
        });
      }
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        if (msg.type === "init") {
          const info = yield getSelectionInfo();
          figma.ui.postMessage(info ? { type: "context", info } : { type: "no-selection" });
        }
        if (msg.type === "generate") {
          try {
            const result = yield generateDocs(
              msg.nodeId,
              msg.options
            );
            figma.ui.postMessage(__spreadValues({ type: "done" }, result));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            figma.notify(`Error: ${message}`, { error: true });
            figma.ui.postMessage({ type: "error", message });
          }
        }
        if (msg.type === "reveal") {
          const doc = yield resolveLiveNode(msg.docId);
          if (doc && doc.type === "FRAME") {
            figma.currentPage.selection = [doc];
            figma.viewport.scrollAndZoomIntoView([doc]);
          }
        }
        if (msg.type === "close") {
          figma.closePlugin();
        }
      });
      figma.on("selectionchange", () => __async(exports, null, function* () {
        const info = yield getSelectionInfo();
        figma.ui.postMessage(info ? { type: "context", info } : { type: "no-selection" });
      }));
    }
  });
  require_code();
})();
