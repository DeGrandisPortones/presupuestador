import PDFDocument from "pdfkit";

const SELLER_DIMENSION_RE = /^Ancho:\s*[^-]+\s*-\s*Alto:/i;
const PORTON_TECHNICAL_INFO_RE = /(?:^|\s-\s)(?:Ancho:|Medidas de paso:|Peso calculado:|Piernas:)/i;
const INFO_SEPARATOR = "   -   ";

function stripObservationParts(value) {
  const text = String(value || "");
  if (!PORTON_TECHNICAL_INFO_RE.test(text) || !text.includes("Obs:")) return text;

  return text
    .split(INFO_SEPARATOR)
    .map((part) => String(part || "").trim())
    .filter((part) => part && !/^Obs\s*:/i.test(part))
    .join(INFO_SEPARATOR);
}

function isSellerDimensionInfoText(value) {
  const text = String(value || "");
  return SELLER_DIMENSION_RE.test(text);
}

function splitSellerDimensionInfo(text) {
  const cleanText = stripObservationParts(text);
  const parts = String(cleanText || "").split(INFO_SEPARATOR);
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
    const cleanText = stripObservationParts(text);

    if (!isSellerDimensionInfoText(cleanText)) {
      return originalHeightOfString.call(this, cleanText, options);
    }

    const { main, rest } = splitSellerDimensionInfo(cleanText);
    const width = options?.width;
    const mainHeight = originalHeightOfString.call(this, main, { ...options, width, lineGap: 0 });
    const restHeight = rest ? originalHeightOfString.call(this, rest, { ...options, width, lineGap: 2 }) : 0;
    return mainHeight + (rest ? 6 + restHeight : 0);
  };

  proto.text = function patchedText(text, x, y, options = {}) {
    const cleanText = stripObservationParts(text);

    if (!isSellerDimensionInfoText(cleanText) || typeof x !== "number" || typeof y !== "number") {
      return originalText.call(this, cleanText, x, y, options);
    }

    const { main, rest } = splitSellerDimensionInfo(cleanText);
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
