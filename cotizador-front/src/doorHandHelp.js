const DOOR_HAND_SECTION_KEY = "mano_de_la_puerta";
const DOOR_HAND_HELP_IMAGE_SRC = "/images/puerta-mano-ayuda.png";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function closeDoorHandHelpModal() {
  const modal = document.getElementById("door-hand-help-modal");
  if (modal) modal.remove();
}

function openDoorHandHelpModal() {
  closeDoorHandHelpModal();

  const overlay = document.createElement("div");
  overlay.id = "door-hand-help-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Ayuda de mano de puerta");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "9999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.padding = "18px";
  overlay.style.background = "rgba(15, 23, 42, 0.55)";

  const dialog = document.createElement("div");
  dialog.style.width = "min(92vw, 520px)";
  dialog.style.maxHeight = "90vh";
  dialog.style.overflow = "auto";
  dialog.style.borderRadius = "16px";
  dialog.style.background = "#fff";
  dialog.style.boxShadow = "0 20px 50px rgba(15, 23, 42, 0.28)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.padding = "12px 14px";
  header.style.borderBottom = "1px solid #eef2f7";

  const title = document.createElement("div");
  title.textContent = "Mano de la puerta";
  title.style.fontWeight = "900";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Cerrar ayuda");
  closeButton.textContent = "x";
  closeButton.style.border = "0";
  closeButton.style.background = "transparent";
  closeButton.style.fontSize = "24px";
  closeButton.style.lineHeight = "1";
  closeButton.style.cursor = "pointer";
  closeButton.addEventListener("click", closeDoorHandHelpModal);

  header.append(title, closeButton);

  const body = document.createElement("div");
  body.style.padding = "14px";

  const image = document.createElement("img");
  image.src = DOOR_HAND_HELP_IMAGE_SRC;
  image.alt = "Guia visual para determinar mano izquierda o mano derecha de la puerta vista desde exterior.";
  image.style.display = "block";
  image.style.width = "100%";
  image.style.height = "auto";
  image.style.borderRadius = "12px";

  body.append(image);
  dialog.append(header, body);
  overlay.append(dialog);

  overlay.addEventListener("click", closeDoorHandHelpModal);
  dialog.addEventListener("click", (event) => event.stopPropagation());

  document.body.append(overlay);
}

function makeHelpIcon() {
  const helpIcon = document.createElement("span");
  helpIcon.setAttribute("role", "button");
  helpIcon.setAttribute("tabindex", "0");
  helpIcon.setAttribute("aria-label", "Ver ayuda de mano de puerta");
  helpIcon.setAttribute("title", "Ver ayuda de mano de puerta");
  helpIcon.textContent = "?";
  helpIcon.style.display = "inline-flex";
  helpIcon.style.alignItems = "center";
  helpIcon.style.justifyContent = "center";
  helpIcon.style.flex = "0 0 auto";
  helpIcon.style.width = "24px";
  helpIcon.style.height = "24px";
  helpIcon.style.marginLeft = "8px";
  helpIcon.style.borderRadius = "999px";
  helpIcon.style.border = "1px solid #c7d2fe";
  helpIcon.style.background = "#fff";
  helpIcon.style.color = "#3730a3";
  helpIcon.style.fontWeight = "900";
  helpIcon.style.lineHeight = "1";
  helpIcon.style.cursor = "pointer";
  helpIcon.style.userSelect = "none";

  const open = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openDoorHandHelpModal();
  };

  helpIcon.addEventListener("click", open);
  helpIcon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") open(event);
  });

  return helpIcon;
}

function mountDoorHandHelpIcons() {
  const titles = document.querySelectorAll(".dg-acc-title");

  titles.forEach((title) => {
    if (title.dataset.doorHandHelpMounted === "1") return;
    if (normalizeText(title.textContent) !== DOOR_HAND_SECTION_KEY) return;

    title.dataset.doorHandHelpMounted = "1";
    title.style.display = "inline-flex";
    title.style.alignItems = "center";
    title.style.gap = "6px";
    title.append(makeHelpIcon());
  });
}

function startDoorHandHelp() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let pending = false;
  const scheduleMount = () => {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame(() => {
      pending = false;
      mountDoorHandHelpIcons();
    });
  };

  scheduleMount();

  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDoorHandHelpModal();
  });
}

startDoorHandHelp();
