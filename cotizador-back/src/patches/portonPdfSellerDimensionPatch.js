import PDFDocument from "pdfkit";

const SELLER_DIMENSION_RE = /^Ancho:\s*[^-]+\s*-\s*Alto:/i;
const INFO_SEPARATOR = "   -   ";

function isSellerDimensionInfoText(value) {
  const text = String(value || "");
  return SELLER_DIMENSION_RE.test(text);
}

function splitSellerDimensionInfo(text) {
  const parts = String(text || "").split(INFO_SEPARATOR);
  return {
    main: parts.shift() || "",
    rest: parts.join(INFO_SEPARATOR),
  };
}

export function applyPortonPdfSellerDimensionPatch() {
  const proto = PDFDocument?.prototype;
  if (!proto || proto.__portonPdfSellerDimensionPatchApplied) return;

  const originalText = proto.text;
  const originalHeightOfString = proto.heightOfString;

  proto.heightOfString = function patchedHeightOfString(text, options = {}) {
    if (!isSellerDimensionInfoText(text)) {
      return originalHeightOfString.call(this, text, options);
    }

    const { main, rest } = splitSellerDimensionInfo(text);
    const width = options?.width;
    const mainHeight = originalHeightOfString.call(this, main, { ...options, width, lineGap: 0 });
    const restHeight = rest ? originalHeightOfString.call(this, rest, { ...options, width, lineGap: 2 }) : 0;
    return mainHeight + (rest ? 6 + restHeight : 0);
  };

  proto.text = function patchedText(text, x, y, options = {}) {
    if (!isSellerDimensionInfoText(text) || typeof x !== "number" || typeof y !== "number") {
      return originalText.call(this, text, x, y, options);
    }

    const { main, rest } = splitSellerDimensionInfo(text);
    const width = options?.width;
    const mainFontSize = 13;
    const restFontSize = 10;

    this.font("Helvetica-Bold").fontSize(mainFontSize).fillColor("#111827");
    originalText.call(this, main, x, y, { ...options, width, lineGap: 0 });

    if (rest) {
      const restY = y + this.heightOfString(main, { ...options, width, lineGap: 0 }) + 5;
      this.font("Helvetica").fontSize(restFontSize).fillColor("#111827");
      originalText.call(this, rest, x, restY, { ...options, width, lineGap: 2 });
    }

    return this;
  };

  Object.defineProperty(proto, "__portonPdfSellerDimensionPatchApplied", {
    value: true,
    enumerable: false,
    configurable: false,
  });
}
