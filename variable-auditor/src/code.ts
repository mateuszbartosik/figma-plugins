figma.showUI(__html__, { width: 404, height: 660 });
figma.ui.onmessage = (msg) => {
  // handlers added in later tasks
  if (msg?.type === 'noop') figma.closePlugin();
};
