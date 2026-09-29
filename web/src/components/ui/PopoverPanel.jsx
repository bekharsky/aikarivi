import * as Popover from "@radix-ui/react-popover";

export function PopoverPanel({ trigger, label, heading, children, align = "start", side = "bottom", className = "", open, onOpenChange }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={["ui-popover", className].filter(Boolean).join(" ")}
          aria-label={label}
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={16}
        >
          {heading && <h2 className="ui-popover-heading">{heading}</h2>}
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
