export default function Input({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      style={{
        padding: "8px 10px",
        borderRadius: 8,
        border: "1px solid #ddd",
        outline: "none",
        minWidth: 180,
        ...style,
      }}
    />
  );
}
