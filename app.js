const elements = {
  markdownInput: document.getElementById("markdownInput"),
  parseMessage: document.getElementById("parseMessage"),
  exportMessage: document.getElementById("exportMessage"),
  previewPanel: document.getElementById("previewPanel"),
  controlsPanel: document.getElementById("controlsPanel"),
  jumpPreviewBtn: document.getElementById("jumpPreviewBtn"),
  previewUpdateBadge: document.getElementById("previewUpdateBadge"),
  tableMount: document.getElementById("tableMount"),
  captureSurface: document.getElementById("captureSurface"),
  canvasWidth: document.getElementById("canvasWidth"),
  canvasHeight: document.getElementById("canvasHeight"),
  fitToCanvas: document.getElementById("fitToCanvas"),
  lockAspectRatio: document.getElementById("lockAspectRatio"),
  tableTitle: document.getElementById("tableTitle"),
  tableCaption: document.getElementById("tableCaption"),
  surfacePadding: document.getElementById("surfacePadding"),
  fontFamily: document.getElementById("fontFamily"),
  fontSize: document.getElementById("fontSize"),
  lineHeight: document.getElementById("lineHeight"),
  cellPaddingY: document.getElementById("cellPaddingY"),
  cellPaddingX: document.getElementById("cellPaddingX"),
  textColor: document.getElementById("textColor"),
  headerTextColor: document.getElementById("headerTextColor"),
  headerBg: document.getElementById("headerBg"),
  rowBg: document.getElementById("rowBg"),
  rowAltBg: document.getElementById("rowAltBg"),
  borderColor: document.getElementById("borderColor"),
  borderWidth: document.getElementById("borderWidth"),
  tableRadius: document.getElementById("tableRadius"),
  backgroundModeRadios: Array.from(document.querySelectorAll('input[name="backgroundMode"]')),
  surfaceBg: document.getElementById("surfaceBg"),
  surfaceGradient: document.getElementById("surfaceGradient"),
  surfaceImage: document.getElementById("surfaceImage"),
  surfaceBgWrap: document.getElementById("surfaceBgWrap"),
  surfaceGradientWrap: document.getElementById("surfaceGradientWrap"),
  surfaceImageWrap: document.getElementById("surfaceImageWrap"),
  fontUrl: document.getElementById("fontUrl"),
  loadFontBtn: document.getElementById("loadFontBtn"),
  fileName: document.getElementById("fileName"),
  pngScale: document.getElementById("pngScale"),
  exportPngBtn: document.getElementById("exportPngBtn"),
  exportSvgBtn: document.getElementById("exportSvgBtn")
};

const rangeReadouts = [
  ["fontSize", "fontSizeValue", (value) => String(Math.round(value))],
  ["lineHeight", "lineHeightValue", (value) => value.toFixed(2)],
  ["surfacePadding", "surfacePaddingValue", (value) => String(Math.round(value))],
  ["cellPaddingY", "cellPaddingYValue", (value) => String(Math.round(value))],
  ["cellPaddingX", "cellPaddingXValue", (value) => String(Math.round(value))],
  ["borderWidth", "borderWidthValue", (value) => String(Math.round(value))],
  ["tableRadius", "tableRadiusValue", (value) => String(Math.round(value))]
];

const colorControls = new Map();

const initialWidth = Number(elements.canvasWidth.value) || 1200;
const initialHeight = Number(elements.canvasHeight.value) || 630;

const state = {
  lastParsed: null,
  aspectRatio: initialWidth / initialHeight,
  exportBusy: false,
  previewFeedbackTimer: null,
  savedSurfacePadding: null,
  committedWidth: initialWidth,
  committedHeight: initialHeight
};

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parsePositiveNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function clampDimensionForExport(value) {
  return Math.max(100, Math.min(4000, Math.round(value)));
}

function debounce(fn, waitMs) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

function splitMarkdownRow(rowLine) {
  let line = rowLine.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);

  const cells = [];
  let current = "";

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === "\\" && next === "|") {
      current += "|";
      i += 1;
      continue;
    }

    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseTableMarkdown(markdownText) {
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Need at least a header row and a separator row.");
  }

  const headers = splitMarkdownRow(lines[0]);
  const separator = splitMarkdownRow(lines[1]);

  if (!headers.length || headers.every((cell) => cell.length === 0)) {
    throw new Error("Header row is empty.");
  }

  if (separator.length !== headers.length) {
    throw new Error("Separator column count must match the header column count.");
  }

  const alignments = separator.map((cell) => {
    if (!/^:?-{3,}:?$/.test(cell)) {
      throw new Error("Separator row must use markdown dashes like --- or :---:.");
    }

    if (cell.startsWith(":")) {
      if (cell.endsWith(":")) return "center";
      return "left";
    }

    if (cell.endsWith(":")) return "right";
    return "left";
  });

  const rows = lines.slice(2).map((line) => {
    const parsed = splitMarkdownRow(line);
    const normalized = [...parsed];

    if (normalized.length < headers.length) {
      while (normalized.length < headers.length) normalized.push("");
    }

    if (normalized.length > headers.length) {
      normalized.length = headers.length;
    }

    return normalized;
  });

  return { headers, alignments, rows };
}

function setMessage(element, text, isError = false) {
  element.textContent = text;
  if (isError) {
    element.classList.add("error");
  } else {
    element.classList.remove("error");
  }
}

function refreshRangeReadouts() {
  rangeReadouts.forEach(([inputId, outputId, formatter]) => {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);
    if (!input || !output) return;
    output.textContent = formatter(numeric(input.value));
  });
}

function getBackgroundMode() {
  const checked = elements.backgroundModeRadios.find((radio) => radio.checked);
  return checked ? checked.value : "solid";
}

function normalizeHex(input) {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const value = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const expanded = value
      .split("")
      .map((char) => `${char}${char}`)
      .join("");
    return `#${expanded.toLowerCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toLowerCase()}`;
  }

  return null;
}

function updateColorControlUI(controlId, hexValue) {
  const control = colorControls.get(controlId);
  if (!control) return;
  const normalizedUpper = hexValue.toUpperCase();

  control.swatch.style.backgroundColor = normalizedUpper;
  control.swatch.title = normalizedUpper;
  control.hexInput.title = normalizedUpper;
  control.hexInput.value = normalizedUpper;
}

function setupColorControls() {
  const colorInputs = Array.from(document.querySelectorAll(".color-field input[type='color']"));

  colorInputs.forEach((colorInput) => {
    const field = colorInput.closest(".color-field");
    if (!field || field.querySelector(".color-control")) return;

    const controlWrap = document.createElement("div");
    controlWrap.className = "color-control";

    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "color-swatch";
    swatch.setAttribute("aria-label", "Open color picker");

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "color-hex";
    hexInput.maxLength = 7;
    hexInput.placeholder = "#RRGGBB";
    hexInput.inputMode = "text";

    colorInput.classList.add("color-native");

    controlWrap.appendChild(swatch);
    controlWrap.appendChild(hexInput);
    controlWrap.appendChild(colorInput);
    field.appendChild(controlWrap);

    colorControls.set(colorInput.id, {
      colorInput,
      hexInput,
      swatch
    });

    updateColorControlUI(colorInput.id, colorInput.value);

    swatch.addEventListener("click", () => {
      if (typeof colorInput.showPicker === "function") {
        colorInput.showPicker();
      } else {
        colorInput.click();
      }
    });

    colorInput.addEventListener("input", () => {
      updateColorControlUI(colorInput.id, colorInput.value);
      renderPreview({ announce: true });
    });

    hexInput.addEventListener("input", () => {
      const sanitized = hexInput.value.replace(/[^#0-9a-fA-F]/g, "");
      if (sanitized !== hexInput.value) {
        hexInput.value = sanitized;
      }

      const normalized = normalizeHex(sanitized);
      if (normalized) {
        colorInput.value = normalized;
        updateColorControlUI(colorInput.id, normalized);
        renderPreview({ announce: true });
      }
    });

    hexInput.addEventListener("blur", () => {
      updateColorControlUI(colorInput.id, colorInput.value);
    });
  });
}

function applySurfaceBackground() {
  const mode = getBackgroundMode();
  const surface = elements.captureSurface;

  surface.style.background = "transparent";
  surface.style.backgroundImage = "none";

  if (mode === "none") return;

  if (mode === "solid") {
    surface.style.background = elements.surfaceBg.value;
  }

  if (mode === "gradient") {
    surface.style.background = elements.surfaceGradient.value || elements.surfaceBg.value;
  }

  if (mode === "image") {
    const imageUrl = elements.surfaceImage.value.trim();
    surface.style.background = elements.surfaceBg.value;

    if (imageUrl.length > 0) {
      surface.style.backgroundImage = `url("${imageUrl}")`;
      surface.style.backgroundSize = "cover";
      surface.style.backgroundPosition = "center";
      surface.style.backgroundRepeat = "no-repeat";
    }
  }
}

function syncBackgroundInputs() {
  const mode = getBackgroundMode();
  const fitCanvasMode = elements.fitToCanvas.checked;
  const showSolid = mode === "solid" || mode === "image";
  const showGradient = mode === "gradient";
  const showImage = mode === "image";

  elements.surfaceBgWrap.hidden = !showSolid;
  elements.surfaceGradientWrap.hidden = !showGradient;
  elements.surfaceImageWrap.hidden = !showImage;

  elements.surfaceBg.disabled = !showSolid;
  elements.surfaceGradient.disabled = !showGradient;
  elements.surfaceImage.disabled = !showImage;

  const tableOnlyMode = mode === "none";
  const disableManualCanvas = tableOnlyMode || fitCanvasMode;

  if (tableOnlyMode) {
    if (state.savedSurfacePadding === null) {
      state.savedSurfacePadding = elements.surfacePadding.value;
    }
    elements.surfacePadding.value = "0";
    elements.surfacePadding.disabled = true;
    elements.canvasWidth.disabled = true;
    elements.canvasHeight.disabled = true;
    elements.lockAspectRatio.disabled = true;
  } else {
    if (state.savedSurfacePadding !== null) {
      elements.surfacePadding.value = state.savedSurfacePadding;
      state.savedSurfacePadding = null;
    }
    elements.surfacePadding.disabled = false;
  }

  elements.canvasWidth.disabled = disableManualCanvas;
  elements.canvasHeight.disabled = disableManualCanvas;
  elements.lockAspectRatio.disabled = disableManualCanvas;
}

function resolveCanvasForPreview() {
  const widthInput = parsePositiveNumber(elements.canvasWidth.value);
  const heightInput = parsePositiveNumber(elements.canvasHeight.value);

  if (widthInput !== null) {
    state.committedWidth = widthInput;
  }

  if (heightInput !== null) {
    state.committedHeight = heightInput;
  }

  return {
    width: widthInput ?? state.committedWidth,
    height: heightInput ?? state.committedHeight
  };
}

function updateCaptureDimensions() {
  const mode = getBackgroundMode();
  const fitCanvasMode = elements.fitToCanvas.checked;

  if (mode === "none") {
    elements.captureSurface.classList.add("table-only-mode");
    elements.captureSurface.classList.remove("fit-canvas-mode");
    elements.tableMount.classList.add("table-only-mount");
    elements.tableMount.classList.remove("fit-canvas-mount");
    elements.captureSurface.style.width = "";
    elements.captureSurface.style.height = "";
    return;
  }

  elements.captureSurface.classList.remove("table-only-mode");
  elements.tableMount.classList.remove("table-only-mount");

  if (fitCanvasMode) {
    elements.captureSurface.classList.add("fit-canvas-mode");
    elements.tableMount.classList.add("fit-canvas-mount");
    elements.captureSurface.style.width = "";
    elements.captureSurface.style.height = "";
    return;
  }

  elements.captureSurface.classList.remove("fit-canvas-mode");
  elements.tableMount.classList.remove("fit-canvas-mount");

  const dimensions = resolveCanvasForPreview();
  elements.captureSurface.style.width = `${Math.round(dimensions.width)}px`;
  elements.captureSurface.style.height = `${Math.round(dimensions.height)}px`;

  if (!elements.lockAspectRatio.checked && dimensions.height > 0) {
    state.aspectRatio = dimensions.width / dimensions.height;
  }
}

function syncAspectRatioPair(source) {
  if (elements.fitToCanvas.checked || getBackgroundMode() === "none") return;
  if (!elements.lockAspectRatio.checked) return;

  const ratio = state.aspectRatio || 1;

  if (source === "width") {
    const width = parsePositiveNumber(elements.canvasWidth.value);
    if (width === null) return;
    const nextHeight = Math.max(1, Math.round(width / ratio));
    elements.canvasHeight.value = String(nextHeight);
  }

  if (source === "height") {
    const height = parsePositiveNumber(elements.canvasHeight.value);
    if (height === null) return;
    const nextWidth = Math.max(1, Math.round(height * ratio));
    elements.canvasWidth.value = String(nextWidth);
  }
}

function commitDimensions(source) {
  if (elements.fitToCanvas.checked || getBackgroundMode() === "none") {
    renderPreview({ announce: true });
    return;
  }

  const ratio = state.aspectRatio || 1;
  let width = parsePositiveNumber(elements.canvasWidth.value);
  let height = parsePositiveNumber(elements.canvasHeight.value);

  if (elements.lockAspectRatio.checked) {
    if (source === "width" && width !== null) {
      height = width / ratio;
    }

    if (source === "height" && height !== null) {
      width = height * ratio;
    }
  }

  width = clampDimensionForExport(width ?? state.committedWidth);
  height = clampDimensionForExport(height ?? state.committedHeight);

  state.committedWidth = width;
  state.committedHeight = height;

  elements.canvasWidth.value = String(width);
  elements.canvasHeight.value = String(height);

  if (elements.lockAspectRatio.checked && height > 0) {
    state.aspectRatio = width / height;
  }

  renderPreview({ announce: true });
}

function buildTableView(parsed) {
  const mode = getBackgroundMode();
  const tableOnlyMode = mode === "none";
  const autoContentWidth = tableOnlyMode || elements.fitToCanvas.checked;
  const padding = tableOnlyMode ? 0 : Math.max(0, numeric(elements.surfacePadding.value, 36));
  const baseFontSize = Math.max(8, numeric(elements.fontSize.value, 22));
  const borderWidth = Math.max(0, numeric(elements.borderWidth.value, 1));
  const cellPaddingY = Math.max(2, numeric(elements.cellPaddingY.value, 14));
  const cellPaddingX = Math.max(2, numeric(elements.cellPaddingX.value, 18));
  const radiusPx = Math.max(0, numeric(elements.tableRadius.value, 16));
  const family = elements.fontFamily.value.trim() || "sans-serif";

  const surfaceLayout = document.createElement("div");
  surfaceLayout.className = "surface-layout";
  surfaceLayout.style.padding = `${padding}px`;

  const titleText = elements.tableTitle.value.trim();
  if (titleText.length > 0) {
    const title = document.createElement("p");
    title.className = "table-title";
    title.textContent = titleText;
    title.style.fontFamily = family;
    title.style.fontSize = `${Math.round(Math.max(14, baseFontSize * 1.02))}px`;
    title.style.lineHeight = "1.2";
    title.style.color = elements.textColor.value;
    surfaceLayout.appendChild(title);
  }

  const center = document.createElement("div");
  center.className = "table-center";

  const wrap = document.createElement("div");
  wrap.className = autoContentWidth ? "table-wrap table-only-wrap" : "table-wrap";

  const table = document.createElement("table");
  table.className = autoContentWidth ? "rendered-table table-only-table" : "rendered-table";
  table.style.fontFamily = family;
  table.style.fontSize = `${baseFontSize}px`;
  table.style.lineHeight = String(Math.max(1, numeric(elements.lineHeight.value, 1.35)));
  table.style.color = elements.textColor.value;
  table.style.borderRadius = `${radiusPx}px`;
  table.style.overflow = "hidden";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  parsed.headers.forEach((headerText, columnIndex) => {
    const th = document.createElement("th");
    th.textContent = headerText;
    th.style.background = elements.headerBg.value;
    th.style.color = elements.headerTextColor.value;
    th.style.padding = `${cellPaddingY}px ${cellPaddingX}px`;
    th.style.border = `${borderWidth}px solid ${elements.borderColor.value}`;
    th.style.textAlign = parsed.alignments[columnIndex];

    if (columnIndex === 0) {
      th.style.borderTopLeftRadius = `${radiusPx}px`;
    }

    if (columnIndex === parsed.headers.length - 1) {
      th.style.borderTopRightRadius = `${radiusPx}px`;
    }

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  parsed.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    row.forEach((cellText, columnIndex) => {
      const td = document.createElement("td");
      td.textContent = cellText;
      td.style.padding = `${cellPaddingY}px ${cellPaddingX}px`;
      td.style.border = `${borderWidth}px solid ${elements.borderColor.value}`;
      td.style.textAlign = parsed.alignments[columnIndex];
      td.style.background = rowIndex % 2 === 0 ? elements.rowBg.value : elements.rowAltBg.value;

      const isLastBodyRow = rowIndex === parsed.rows.length - 1;

      if (isLastBodyRow && columnIndex === 0) {
        td.style.borderBottomLeftRadius = `${radiusPx}px`;
      }

      if (isLastBodyRow && columnIndex === row.length - 1) {
        td.style.borderBottomRightRadius = `${radiusPx}px`;
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  center.appendChild(wrap);
  surfaceLayout.appendChild(center);

  const captionText = elements.tableCaption.value.trim();
  if (captionText.length > 0) {
    const caption = document.createElement("p");
    caption.className = "table-caption";
    caption.textContent = captionText;
    caption.style.fontFamily = family;
    caption.style.fontSize = `${Math.round(Math.max(11, baseFontSize * 0.62))}px`;
    caption.style.lineHeight = "1.25";
    caption.style.color = elements.textColor.value;
    surfaceLayout.appendChild(caption);
  }

  return surfaceLayout;
}

function markPreviewUpdated() {
  if (state.previewFeedbackTimer) {
    clearTimeout(state.previewFeedbackTimer);
  }

  elements.captureSurface.classList.remove("preview-flash");
  void elements.captureSurface.offsetWidth;
  elements.captureSurface.classList.add("preview-flash");

  elements.previewUpdateBadge.classList.add("is-visible");

  state.previewFeedbackTimer = setTimeout(() => {
    elements.previewUpdateBadge.classList.remove("is-visible");
    elements.captureSurface.classList.remove("preview-flash");
  }, 820);
}

function renderPreview(options = {}) {
  const announce = options.announce !== false;

  refreshRangeReadouts();
  syncBackgroundInputs();
  updateCaptureDimensions();
  applySurfaceBackground();

  const markdown = elements.markdownInput.value;

  try {
    const parsed = parseTableMarkdown(markdown);
    state.lastParsed = parsed;

    elements.tableMount.innerHTML = "";
    elements.tableMount.appendChild(buildTableView(parsed));

    setMessage(
      elements.parseMessage,
      `Parsed ${parsed.headers.length} columns and ${parsed.rows.length} data rows.`,
      false
    );
  } catch (error) {
    state.lastParsed = null;
    elements.tableMount.innerHTML = "";

    const errorNote = document.createElement("p");
    errorNote.className = "table-error";
    errorNote.textContent = error.message;

    elements.tableMount.appendChild(errorNote);
    setMessage(elements.parseMessage, error.message, true);
  }

  if (announce) {
    markPreviewUpdated();
  }
}

const debouncedMarkdownRender = debounce(() => renderPreview({ announce: true }), 250);
const debouncedDimensionRender = debounce(() => renderPreview({ announce: true }), 240);

function sanitizeFileName(name) {
  const cleaned = name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");
  return cleaned.length > 0 ? cleaned : "table-export";
}

function copyComputedStyles(sourceElement, targetElement) {
  const computed = window.getComputedStyle(sourceElement);
  const cssText = Array.from(computed)
    .map((property) => `${property}:${computed.getPropertyValue(property)};`)
    .join("");

  targetElement.setAttribute("style", cssText);

  const sourceChildren = sourceElement.children;
  const targetChildren = targetElement.children;

  for (let i = 0; i < sourceChildren.length; i += 1) {
    if (!targetChildren[i]) break;
    copyComputedStyles(sourceChildren[i], targetChildren[i]);
  }
}

function isEmbeddableUrl(rawUrl) {
  if (!rawUrl) return false;
  const value = rawUrl.trim();
  if (value.startsWith("data:")) return false;
  if (value.startsWith("blob:")) return false;
  if (value.startsWith("#")) return false;
  return true;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not convert asset to data URL."));
    reader.readAsDataURL(blob);
  });
}

async function fetchAssetAsDataUrl(assetUrl) {
  const response = await fetch(assetUrl, {
    mode: "cors",
    credentials: "omit",
    cache: "force-cache"
  });

  if (!response.ok) {
    throw new Error(`Asset request failed (${response.status})`);
  }

  const blob = await response.blob();
  return blobToDataUrl(blob);
}

async function inlineExternalAssetsForExport(rootNode) {
  const cache = new Map();
  const warnings = new Set();
  const nodes = [rootNode, ...rootNode.querySelectorAll("*")];
  const urlRegex = /url\((['"]?)(.*?)\1\)/g;

  for (const node of nodes) {
    const styleAttr = node.getAttribute("style");
    if (!styleAttr || !styleAttr.includes("url(")) continue;

    const matches = [...styleAttr.matchAll(urlRegex)];
    if (matches.length === 0) continue;

    let updatedStyle = styleAttr;

    for (const match of matches) {
      const originalExpression = match[0];
      const rawUrl = match[2].trim();
      if (!isEmbeddableUrl(rawUrl)) continue;

      let absoluteUrl;
      try {
        absoluteUrl = new URL(rawUrl, window.location.href).href;
      } catch {
        continue;
      }

      let replacement = null;

      try {
        if (!cache.has(absoluteUrl)) {
          cache.set(absoluteUrl, await fetchAssetAsDataUrl(absoluteUrl));
        }
        replacement = `url("${cache.get(absoluteUrl)}")`;
      } catch {
        warnings.add(absoluteUrl);
        replacement = "none";
      }

      updatedStyle = updatedStyle.replace(originalExpression, replacement);
    }

    node.setAttribute("style", updatedStyle);
  }

  return [...warnings];
}

function getExportDimensions() {
  const mode = getBackgroundMode();
  const fitCanvasMode = elements.fitToCanvas.checked;

  if (mode === "none" || fitCanvasMode) {
    const target = elements.captureSurface;
    const rect = target.getBoundingClientRect();
    const width = Math.max(1, Math.ceil(rect.width));
    const height = Math.max(1, Math.ceil(rect.height));
    return { width, height };
  }

  const width = clampDimensionForExport(
    parsePositiveNumber(elements.canvasWidth.value) ?? state.committedWidth
  );
  const height = clampDimensionForExport(
    parsePositiveNumber(elements.canvasHeight.value) ?? state.committedHeight
  );

  return { width, height };
}

async function createSvgBlobFromNode(node, width, height, options = {}) {
  const inlineAssets = options.inlineAssets !== false;
  const clone = node.cloneNode(true);
  copyComputedStyles(node, clone);

  let warnings = [];
  if (inlineAssets) {
    warnings = await inlineExternalAssetsForExport(clone);
  }

  const holder = document.createElement("div");
  holder.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  holder.style.width = `${width}px`;
  holder.style.height = `${height}px`;
  holder.style.margin = "0";
  holder.style.padding = "0";
  holder.appendChild(clone);

  const serialized = new XMLSerializer().serializeToString(holder);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${serialized}</foreignObject></svg>`;
  return {
    blob: new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
    warnings
  };
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

async function ensureFontsLoaded() {
  const family = (elements.fontFamily.value.split(",")[0] || "sans-serif").trim();
  const px = Math.max(8, numeric(elements.fontSize.value, 22));

  if (document.fonts && family) {
    try {
      await document.fonts.load(`${px}px ${family}`);
    } catch {
      // fallback render continues
    }
  }

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function setExportBusy(isBusy) {
  state.exportBusy = isBusy;
  elements.exportPngBtn.disabled = isBusy;
  elements.exportSvgBtn.disabled = isBusy;
}

async function exportSvg() {
  if (!state.lastParsed) {
    setMessage(elements.exportMessage, "Fix markdown errors before export.", true);
    return;
  }

  try {
    setExportBusy(true);
    setMessage(elements.exportMessage, "Preparing SVG export...", false);
    renderPreview({ announce: false });
    await ensureFontsLoaded();

    const dimensions = getExportDimensions();
    const { blob, warnings } = await createSvgBlobFromNode(
      elements.captureSurface,
      dimensions.width,
      dimensions.height,
      { inlineAssets: true }
    );

    triggerDownload(blob, `${sanitizeFileName(elements.fileName.value)}.svg`);
    if (warnings.length > 0) {
      setMessage(
        elements.exportMessage,
        `SVG exported with ${warnings.length} external asset(s) skipped due CORS.`,
        false
      );
    } else {
      setMessage(elements.exportMessage, "SVG exported.", false);
    }
  } catch (error) {
    setMessage(elements.exportMessage, `SVG export failed: ${error.message}`, true);
  } finally {
    setExportBusy(false);
  }
}

async function exportPng() {
  if (!state.lastParsed) {
    setMessage(elements.exportMessage, "Fix markdown errors before export.", true);
    return;
  }

  try {
    setExportBusy(true);
    setMessage(elements.exportMessage, "Preparing PNG export...", false);
    renderPreview({ announce: false });
    await ensureFontsLoaded();

    const dimensions = getExportDimensions();
    const scale = Number(elements.pngScale.value) === 3 ? 3 : Number(elements.pngScale.value) === 1 ? 1 : 2;

    const { blob: svgBlob, warnings } = await createSvgBlobFromNode(
      elements.captureSurface,
      dimensions.width,
      dimensions.height,
      { inlineAssets: true }
    );
    const svgUrl = URL.createObjectURL(svgBlob);

    let pngBlob;

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Could not rasterize SVG. If using remote images/fonts, ensure CORS allows access."));
        img.src = svgUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width * scale;
      canvas.height = dimensions.height * scale;

      const context = canvas.getContext("2d");
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

      pngBlob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Browser returned an empty PNG blob."));
              return;
            }
            resolve(blob);
          }, "image/png");
        } catch (error) {
          reject(error);
        }
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }

    triggerDownload(pngBlob, `${sanitizeFileName(elements.fileName.value)}.png`);
    if (warnings.length > 0) {
      setMessage(
        elements.exportMessage,
        `PNG exported at ${scale}x. ${warnings.length} external asset(s) were skipped due CORS.`,
        false
      );
    } else {
      setMessage(elements.exportMessage, `PNG exported at ${scale}x scale.`, false);
    }
  } catch (error) {
    if (String(error.message).toLowerCase().includes("tainted")) {
      setMessage(
        elements.exportMessage,
        "PNG export failed: remote assets blocked by CORS. Try Solid/Gradient background or enable CORS on asset URLs.",
        true
      );
    } else {
      setMessage(elements.exportMessage, `PNG export failed: ${error.message}`, true);
    }
  } finally {
    setExportBusy(false);
  }
}

async function loadCustomFont() {
  const url = elements.fontUrl.value.trim();

  if (!url) {
    setMessage(elements.exportMessage, "Enter a font URL first.", true);
    return;
  }

  try {
    const familyName = `CustomFont${Date.now()}`;
    const face = new FontFace(familyName, `url(${url})`);
    await face.load();
    document.fonts.add(face);

    elements.fontFamily.value = `'${familyName}', ${elements.fontFamily.value}`;
    renderPreview({ announce: true });
    setMessage(elements.exportMessage, `Font loaded as ${familyName}.`, false);
  } catch (error) {
    setMessage(
      elements.exportMessage,
      `Font load failed. Confirm URL and CORS support. ${error.message}`,
      true
    );
  }
}

elements.markdownInput.addEventListener("input", () => {
  debouncedMarkdownRender();
});

elements.canvasWidth.addEventListener("input", () => {
  syncAspectRatioPair("width");
  debouncedDimensionRender();
});

elements.canvasHeight.addEventListener("input", () => {
  syncAspectRatioPair("height");
  debouncedDimensionRender();
});

elements.canvasWidth.addEventListener("blur", () => {
  commitDimensions("width");
});

elements.canvasHeight.addEventListener("blur", () => {
  commitDimensions("height");
});

elements.canvasWidth.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitDimensions("width");
    elements.canvasWidth.blur();
  }
});

elements.canvasHeight.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitDimensions("height");
    elements.canvasHeight.blur();
  }
});

elements.lockAspectRatio.addEventListener("change", () => {
  const width = parsePositiveNumber(elements.canvasWidth.value) ?? state.committedWidth;
  const height = parsePositiveNumber(elements.canvasHeight.value) ?? state.committedHeight;
  if (height > 0) {
    state.aspectRatio = width / height;
  }
  renderPreview({ announce: true });
});

elements.fitToCanvas.addEventListener("change", () => {
  renderPreview({ announce: true });
});

[
  elements.tableTitle,
  elements.tableCaption,
  elements.surfacePadding,
  elements.fontFamily,
  elements.fontSize,
  elements.lineHeight,
  elements.cellPaddingY,
  elements.cellPaddingX,
  elements.surfaceGradient,
  elements.surfaceImage,
  elements.fileName,
  elements.pngScale,
  elements.borderWidth,
  elements.tableRadius
].forEach((control) => {
  control.addEventListener("input", () => renderPreview({ announce: true }));
  control.addEventListener("change", () => renderPreview({ announce: true }));
});

elements.backgroundModeRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    renderPreview({ announce: true });
  });
});

elements.jumpPreviewBtn.addEventListener("click", () => {
  elements.previewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

elements.loadFontBtn.addEventListener("click", loadCustomFont);
elements.exportSvgBtn.addEventListener("click", exportSvg);
elements.exportPngBtn.addEventListener("click", exportPng);

setupColorControls();
syncBackgroundInputs();
refreshRangeReadouts();
renderPreview({ announce: false });
setMessage(
  elements.exportMessage,
  "Ready. PNG exports use 2x scale by default for higher density.",
  false
);
