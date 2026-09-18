import { useThemeStore } from "../domain/theme/store.js";

const OPTIONS = [
  { value: "light", label: "☀️", title: "Modo claro" },
  { value: "dark", label: "🌙", title: "Modo oscuro" },
  { value: "auto", label: "🖥️", title: "Automático (según el sistema)" },
];

export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <div className="theme-toggle" role="group" aria-label="Tema de la aplicación">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.title}
          aria-pressed={mode === opt.value}
          className={`theme-toggle-btn${mode === opt.value ? " active" : ""}`}
          onClick={() => setMode(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
