import { Combobox } from "@base-ui/react/combobox";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type PickerOption = { value: string; label: string; group?: string };
type PickerGroup = { value: string; items: PickerOption[] };

export function SearchPicker({
  options,
  value,
  onValueChange,
  label,
  placeholder = "Search…",
  disabled = false,
  className = "",
}: {
  options: readonly PickerOption[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const portalRoot = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? null;
  const [query, setQuery] = useState(selected?.label ?? "");
  const selectedLabel = selected?.label ?? "";
  useEffect(() => setQuery(selectedLabel), [value, selectedLabel]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, PickerOption[]>();
    for (const option of options) {
      const name = option.group ?? "";
      const items = byGroup.get(name) ?? [];
      items.push(option);
      byGroup.set(name, items);
    }
    return Array.from(byGroup, ([name, items]) => ({ value: name, items }));
  }, [options]);

  return (
    <div ref={portalRoot} className={`min-w-0 ${className}`}>
      <Combobox.Root<PickerOption>
        items={groups}
        value={selected}
        inputValue={query}
        disabled={disabled}
        autoHighlight
        isItemEqualToValue={(a, b) => a.value === b.value}
        onInputValueChange={(next, details) => {
          // Selection text follows the controlled value, including add-and-reset callers that keep it null.
          if (details.reason !== "item-press") setQuery(next);
        }}
        onValueChange={(next) => {
          onValueChange(next?.value ?? null);
          setQuery("");
        }}
        onOpenChange={(open) => {
          if (!open) setQuery(selectedLabel);
        }}
      >
        <label htmlFor={id} className="mb-1.5 block font-bold">
          {label}
        </label>
        <Combobox.InputGroup className="flex min-w-0 gap-1">
          <Combobox.Input id={id} placeholder={placeholder} className="field min-w-0 flex-1 disabled:opacity-50" />
          <Combobox.Trigger className="btn shrink-0" aria-label={`Browse ${label}`}>
            ▾
          </Combobox.Trigger>
        </Combobox.InputGroup>
        {/* A local portal inherits its theme and stays inside any fullscreen ancestor. */}
        <Combobox.Portal container={portalRoot}>
          <Combobox.Positioner sideOffset={4} align="start" positionMethod="fixed" className="z-50 max-w-(--available-width)">
            <Combobox.Popup className="w-(--anchor-width) max-w-(--available-width) overflow-hidden rounded-[6px] border border-line bg-paper text-ink shadow-lg">
              <Combobox.Empty className="p-3 text-sm text-dim">No results found.</Combobox.Empty>
              <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1">
                {(group: PickerGroup) => (
                  <Combobox.Group key={group.value} items={group.items}>
                    {group.value && (
                      <Combobox.GroupLabel className="px-3 pt-3 pb-1 text-sm font-bold text-dim">{group.value}</Combobox.GroupLabel>
                    )}
                    <Combobox.Collection>
                      {(option: PickerOption) => (
                        <Combobox.Item
                          key={option.value}
                          value={option}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-[4px] px-3 py-2 text-sm font-semibold data-highlighted:bg-mist data-highlighted:outline-2 data-highlighted:outline-ink data-selected:bg-line"
                        >
                          <span className="min-w-0 flex-1 break-words">{option.label}</span>
                          <Combobox.ItemIndicator aria-hidden>✓</Combobox.ItemIndicator>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
