export function normalizeWhatsappPhone(phone) {
  const raw = String(phone || "");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("15")) digits = digits.slice(2);
  if (!digits.startsWith("54")) digits = `54${digits}`;

  return digits || null;
}

export function buildWhatsappUrl(phone, text = "") {
  const digits = normalizeWhatsappPhone(phone);
  if (!digits) return null;

  const base = `https://wa.me/${digits}`;
  const msg = String(text || "").trim();
  return msg ? `${base}?text=${encodeURIComponent(msg)}` : base;
}

export function buildMeasurementWhatsappMessage(publicPdfUrl) {
  const parts = [
    "Se ha realizado el relevamiento de medidas de la obra para poder comenzar la producción de su portón.",
    publicPdfUrl
      ? `En el siguiente link podrá ver la planilla de medición online:\n${publicPdfUrl}`
      : "La planilla de medición ya se encuentra disponible.",
    "Gracias por confiar en De Grandis Portones.",
  ];

  return parts.join("\n\n");
}

export async function tryNativeShareWithPdf({ blob, filename, title, text }) {
  if (typeof window === "undefined" || !blob || !window.navigator?.share || typeof File === "undefined") {
    return false;
  }

  const file = new File([blob], filename || "medicion.pdf", { type: blob.type || "application/pdf" });
  const shareData = {
    title: title || "Planilla de medición",
    text: text || "",
    files: [file],
  };

  if (typeof window.navigator.canShare === "function" && !window.navigator.canShare({ files: [file] })) {
    return false;
  }

  await window.navigator.share(shareData);
  return true;
}
