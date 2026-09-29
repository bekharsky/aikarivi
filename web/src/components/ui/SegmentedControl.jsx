import * as RadioGroup from "@radix-ui/react-radio-group";
import { Button } from "./Button.jsx";

export function SegmentedControl({ label, options, value, onValueChange }) {
  return (
    <RadioGroup.Root
      className="ui-segmented"
      orientation="horizontal"
      value={value}
      aria-label={label}
      onValueChange={onValueChange}
    >
      {options.map((option) => (
        <RadioGroup.Item key={option.value} asChild value={option.value}>
          <Button variant="segment" size="compact">{option.label}</Button>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
