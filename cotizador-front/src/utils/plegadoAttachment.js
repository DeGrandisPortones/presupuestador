const MAX_PLEGADO_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_PLEGADO_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function safeText(value) {
  return String(value ?? "").trim();
}

function extensionFromName(name = "") {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function isAllowedPlegadoAttachment(file) {
  if (!file) return false;
  const type = safeText(file.type).toLowerCase();
  const ext = extensionFromName(file.name);
  return ALLOWED_PLEGADO_ATTACHMENT_TYPES.has(type) || ["pdf", "jpg", "jpeg", "png", "webp", "gif"].includes(ext);
}

export function fileToPlegadoAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!isAllowedPlegadoAttachment(file)) {
      reject(new Error("El plano debe ser una imagen o un PDF."));
      return;
    }
    if (Number(file.size || 0) > MAX_PLEGADO_ATTACHMENT_BYTES) {
      reject(new Error("El plano no puede superar 8 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: safeText(file.name) || "plano_plegado",
        type: safeText(file.type) || "application/octet-stream",
        size: Number(file.size || 0) || 0,
        data_url: String(reader.result || ""),
        uploaded_at: new Date().toISOString(),
      });
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo del plano."));
    reader.readAsDataURL(file);
  });
}

export function getPlegadoAttachment(source = {}) {
  const payload = source?.payload && typeof source.payload === "object" ? source.payload : {};
  const dimensions = payload?.dimensions && typeof payload.dimensions === "object" ? payload.dimensions : {};
  const candidates = [
    dimensions?.plegado_plano_attachment,
    dimensions?.plano_plegado_attachment,
    dimensions?.plegado_plano,
    dimensions?.plano_plegado,
    payload?.plegado_plano_attachment,
    payload?.plano_plegado_attachment,
    source?.plegado_plano_attachment,
    source?.plano_plegado_attachment,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === "string" && candidate.trim()) {
      return { name: "plano_plegado", type: "application/octet-stream", size: 0, data_url: candidate.trim() };
    }
    if (typeof candidate === "object") {
      const dataUrl = safeText(candidate.data_url || candidate.dataUrl || candidate.url || candidate.href);
      if (dataUrl) {
        return {
          name: safeText(candidate.name || candidate.filename || candidate.file_name) || "plano_plegado",
          type: safeText(candidate.type || candidate.mime_type || candidate.mimetype) || "application/octet-stream",
          size: Number(candidate.size || candidate.size_bytes || 0) || 0,
          data_url: dataUrl,
          uploaded_at: candidate.uploaded_at || candidate.created_at || null,
        };
      }
    }
  }
  return null;
}

export function hasPlegadoAttachment(source = {}) {
  return !!getPlegadoAttachment(source)?.data_url;
}

export function formatPlegadoAttachmentMeta(attachment) {
  if (!attachment) return "";
  const name = safeText(attachment.name) || "plano_plegado";
  const size = Number(attachment.size || 0) || 0;
  if (!size) return name;
  const unit = size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${name} · ${unit}`;
}

export function openPlegadoAttachment(attachment) {
  const href = safeText(attachment?.data_url);
  if (!href) return false;
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  return !!opened;
}

export function downloadPlegadoAttachment(attachment) {
  const href = safeText(attachment?.data_url);
  if (!href) return false;
  const a = document.createElement("a");
  a.href = href;
  a.download = safeText(attachment?.name) || "plano_plegado";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
