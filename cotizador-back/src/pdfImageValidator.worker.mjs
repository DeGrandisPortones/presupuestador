// Proceso hijo aislado para validar que una imagen (logo subido por un
// distribuidor/vendedor) sea decodificable por pdfkit ANTES de guardarla.
//
// Por que en un proceso aparte y no un simple try/catch: algunas corrupciones de
// PNG hacen que la libreria interna de pdfkit (png-js) falle en el callback async
// de zlib con un "throw" que no cae dentro de ningun try/catch (confirmado en vivo:
// tira abajo el proceso de Node entero, no solo el request). Aislarlo en un proceso
// hijo descartable evita que un logo corrupto pueda voltear el servidor real.
//
// Protocolo: recibe el data URL por mensaje IPC, intenta dibujarlo en un PDF
// descartable, y responde "ok"/"bad" antes de salir. Si el proceso muere sin
// responder (exactamente el escenario que motiva este archivo), el padre lo
// interpreta como "bad" por timeout/exit-sin-mensaje.
import PDFDocument from "pdfkit";

process.on("message", (dataUrl) => {
  try {
    const match = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/i);
    if (!match) {
      process.send({ ok: false, error: "Formato de imagen no reconocido" });
      process.exitCode = 1;
      return;
    }
    const buffer = Buffer.from(match[2], "base64");
    const doc = new PDFDocument({ size: [200, 100], margin: 0 });
    doc.on("data", () => {});
    doc.on("error", (e) => {
      process.send({ ok: false, error: e?.message || "Error generando PDF de prueba" });
      process.exitCode = 1;
    });
    doc.image(buffer, 0, 0, { width: 100, height: 50, fit: [100, 50] });
    doc.end();
    doc.on("end", () => {
      process.send({ ok: true });
      process.exitCode = 0;
    });
  } catch (e) {
    try { process.send({ ok: false, error: e?.message || "Imagen invalida" }); } catch {}
    process.exitCode = 1;
  }
});
