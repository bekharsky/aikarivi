import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export function MenuSelect({ label, triggerLabel = label, value, options, onValueChange, icon: Icon, className = "" }) {
  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className={["ui-button", "ui-select-trigger", className].filter(Boolean).join(" ")} aria-label={label}>
        {Icon && <Icon aria-hidden="true" className="ui-icon ui-icon--small" />}
        <span aria-hidden="true">{triggerLabel}</span>
        <Select.Icon className="ui-icon ui-select-chevron" aria-hidden="true"><ChevronDown /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="ui-popover ui-select-content" position="popper" sideOffset={6} align="end">
          <Select.Viewport className="ui-menu-list">
            {options.map((option) => (
              <Select.Item className="ui-menu-item ui-select-option" key={option.value} value={option.value}>
                <Select.ItemText className="ui-menu-label">{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
