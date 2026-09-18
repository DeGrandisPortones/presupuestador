const MAX_MEDICION_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_MEDICION_VIDEO_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Techo del archivo ORIGINAL de imagen antes de intentar comprimirlo (una foto de
// celular sin editar rara vez pasa esto). Después de comprimir se vuelve a validar
// contra MAX_MEDICION_ATTACHMENT_BYTES como siempre.
const MAX_MEDICION_IMAGE_SOURCE_BYTES = 30 * 1024 * 1024;
const COMPRESSIBLE_MEDICION_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// 1600px de lado mayor y calidad 0.82 ya es de sobra para ver el estado de un
// portón/vano en detalle - una foto de celular sin comprimir (3-8MB) suele bajar a
// unos cientos de KB, dejando mucho más margen contra el tope combinado de arriba.
const MEDICION_IMAGE_COMPRESSION_MAX_DIMENSION_PX = 1600;
const MEDICION_IMAGE_COMPRESSION_QUALITY = 0.82;
// Tope combinado de TODAS las fotos/videos de una misma medición. En base64 un
// archivo pesa ~x1.34 su tamaño real, así que 15MB crudos ya son ~20MB de JSON —
// el body-parser del backend acepta hasta 25MB en total (express.json en index.js).
// Mismo criterio que ticketAttachment.js.
export const MAX_MEDICION_ATTACHMENTS_TOTAL_BYTES = 15 * 1024 * 1024;
const VIDEO_MEDICION_ATTACHMENT_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const ALLOWED_MEDICION_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  ...VIDEO_MEDICION_ATTACHMENT_TYPES,
]);

function safeText(value) {
  return String(value ?? "").trim();
}

function isVideoFile(file) {
  const type = safeText(file?.type).toLowerCase();
  if (type) return VIDEO_MEDICION_ATTACHMENT_TYPES.has(type);
  return ["mp4", "mov", "webm"].includes(extensionFromName(file?.name));
}

function maxBytesForFile(file) {
  return isVideoFile(file) ? MAX_MEDICION_VIDEO_ATTACHMENT_BYTES : MAX_MEDICION_ATTACHMENT_BYTES;
}

function formatMb(bytes) {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

export function medicionAttachmentsTotalBytes(list) {
  return (Array.isArray(list) ? list : []).reduce((sum, a) => sum + (Number(a?.size) || 0), 0);
}

export function formatMedicionAttachmentsMb(bytes) {
  return formatMb(bytes);
}

function extensionFromName(name = "") {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

function extensionFromMimeType(type = "") {
  const mime = safeText(type).toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/quicktime") return "mov";
  if (mime === "video/webm") return "webm";
  return "";
}

function normalizeAttachmentName(attachment = {}) {
  const rawName = safeText(attachment?.name) || "adjunto";
  if (extensionFromName(rawName)) return rawName;
  const ext = extensionFromMimeType(attachment?.type);
  return ext ? `${rawName}.${ext}` : rawName;
}

function dataUrlToBlob(dataUrl = "", fallbackType = "application/octet-stream") {
  const raw = safeText(dataUrl);
  if (!raw || !raw.startsWith("data:")) return null;

  const commaIndex = raw.indexOf(",");
  if (commaIndex < 0) return null;

  const meta = raw.slice(5, commaIndex);
  const body = raw.slice(commaIndex + 1);
  const [mimePart = ""] = meta.split(";");
  const mimeType = safeText(mimePart) || safeText(fallbackType) || "application/octet-stream";
  const isBase64 = meta.toLowerCase().includes(";base64");

  if (isBase64) {
    const binary = window.atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
  }

  return new Blob([decodeURIComponent(body)], { type: mimeType });
}

function buildAttachmentObjectUrl(attachment = {}) {
  const href = safeText(attachment?.data_url);
  if (!href) return null;

  if (href.startsWith("blob:") || href.startsWith("http://") || href.startsWith("https://")) {
    return { url: href, revoke: false };
  }

  const blob = dataUrlToBlob(href, attachment?.type);
  if (!blob) return { url: href, revoke: false };

  return { url: window.URL.createObjectURL(blob), revoke: true };
}

export function isAllowedMedicionAttachment(file) {
  if (!file) return false;
  const type = safeText(file.type).toLowerCase();
  const ext = extensionFromName(file.name);
  return ALLOWED_MEDICION_ATTACHMENT_TYPES.has(type) || ["jpg", "jpeg", "png", "webp", "gif", "mp4", "mov", "webm"].includes(ext);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

// Achica y reencodea la imagen en el navegador antes de mandarla, para no
// depender de que quien la saca la haya comprimido antes (el celular casi nunca
// lo hace). Si algo sale mal en el camino, devuelve el archivo original tal cual
// y que la validación de tamaño de fileToMedicionAttachment decida si entra.
async function compressImageFile(file) {
  if (!COMPRESSIBLE_MEDICION_IMAGE_TYPES.has(safeText(file.type).toLowerCase())) return file;
  if (Number(file.size || 0) > MAX_MEDICION_IMAGE_SOURCE_BYTES) return file;

  let img;
  try {
    img = await loadImageElement(file);
  } catch {
    return file;
  }

  try {
    const { naturalWidth: width, naturalHeight: height } = img;
    if (!width || !height) return file;

    const scale = Math.min(1, MEDICION_IMAGE_COMPRESSION_MAX_DIMENSION_PX / Math.max(width, height));
    // Ya es chica y liviana: comprimirla de nuevo solo perdería calidad sin
    // ganar casi nada de tamaño.
    if (scale >= 1 && file.size <= MAX_MEDICION_ATTACHMENT_BYTES / 4) return file;

    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", MEDICION_IMAGE_COMPRESSION_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const baseName = safeText(file.name).replace(/\.[a-zA-Z0-9]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

export async function fileToMedicionAttachment(file) {
  if (!file) return null;
  if (!isAllowedMedicionAttachment(file)) {
    throw new Error("El adjunto debe ser una imagen o un video.");
  }

  const workingFile = isVideoFile(file) ? file : await compressImageFile(file);

  const maxBytes = maxBytesForFile(workingFile);
  if (Number(workingFile.size || 0) > maxBytes) {
    throw new Error(`El archivo excede el tamaño permitido (máximo ${formatMb(maxBytes)}).`);
  }

  const dataUrl = await readFileAsDataUrl(workingFile);
  return {
    name: safeText(workingFile.name) || "adjunto",
    type: safeText(workingFile.type) || "application/octet-stream",
    size: Number(workingFile.size || 0) || 0,
    data_url: dataUrl,
    uploaded_at: new Date().toISOString(),
  };
}

export function isImageMedicionAttachment(attachment) {
  return safeText(attachment?.type).toLowerCase().startsWith("image/");
}

export function isVideoMedicionAttachment(attachment) {
  return safeText(attachment?.type).toLowerCase().startsWith("video/");
}

export function formatMedicionAttachmentMeta(attachment) {
  if (!attachment) return "";
  const name = normalizeAttachmentName(attachment);
  const size = Number(attachment.size || 0) || 0;
  if (!size) return name;
  const unit = size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${name} · ${unit}`;
}

export function medicionAttachmentDisplayUrl(attachment) {
  return buildAttachmentObjectUrl(attachment)?.url || "";
}

export function openMedicionAttachment(attachment) {
  if (typeof window === "undefined") return false;
  const target = buildAttachmentObjectUrl(attachment);
  if (!target?.url) return false;

  // Chrome bloquea navegación directa a data: URLs. Mismo motivo que
  // ticketAttachment.js: abrir un blob: URL temporal del mismo archivo.
  const opened = window.open(target.url, "_blank", "noopener,noreferrer");
  if (target.revoke) window.setTimeout(() => window.URL.revokeObjectURL(target.url), 60 * 1000);
  return !!opened;
}
