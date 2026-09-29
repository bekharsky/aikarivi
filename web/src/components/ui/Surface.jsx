export function Surface({ as: Element = "section", variant = "raised", className = "", ...props }) {
  return <Element className={["ui-surface", `ui-surface--${variant}`, className].filter(Boolean).join(" ")} {...props} />;
}

export function Separator({ orientation = "horizontal", className = "" }) {
  return (
    <span
      className={["ui-separator", `ui-separator--${orientation}`, className].filter(Boolean).join(" ")}
      aria-hidden="true"
    />
  );
}
