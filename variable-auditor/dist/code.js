"use strict";
(() => {
  // src/code.ts
  figma.showUI(__html__, { width: 404, height: 660 });
  figma.ui.onmessage = (msg) => {
    if ((msg == null ? void 0 : msg.type) === "noop")
      figma.closePlugin();
  };
})();
