export function Button({
  children,
  className = "",
  variant = "quiet",
  size = "regular",
  type = "button",
  ...props
}) {
  return (
    <button
      className={["ui-button", `ui-button--${variant}`, `ui-button--${size}`, className].filter(Boolean).join(" ")}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, size = "regular", className = "", ...props }) {
  return (
    <Button
      className={["ui-icon-button", className].filter(Boolean).join(" ")}
      size={size}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
