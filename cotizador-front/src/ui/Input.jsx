export default function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  style,
  className = "",
  ...rest
}) {
  return (
    <input
      value={value}
      type={type}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      className={["input", className].filter(Boolean).join(" ")}
      style={style}
      {...rest}
    />
  );
}
