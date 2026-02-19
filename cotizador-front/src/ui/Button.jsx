export default function Button({ children, onClick, variant = "primary", type = "button", disabled }) {
  const styles =
    variant === "danger"
      ? { background: "#d93025", color: "white" }
      : variant === "ghost"
      ? { background: "transparent", color: "#111", border: "1px solid #ddd" }
      : { background: "#2b59ff", color: "white" };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles,
        border: "none",
        borderRadius: 8,
        padding: "8px 12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
