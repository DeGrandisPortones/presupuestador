export default function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  title,
  className = "",
  ...rest
}) {
  const v = variant || "primary";
  const cls = ["btn", `btn--${v}`, className].filter(Boolean).join(" ");

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cls}
      {...rest}
    >
      {children}
    </button>
  );
}
