import { useMemo, useState } from "react";
import { ChevronDown, Leaf, Plus, X } from "lucide-react";
import { getDevices } from "@/lib/data";
import type { Device } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addPersonalDevice,
  getPersonalDevices,
  isPersonalSlug,
  personalDeviceAsDevice,
} from "./personal";

interface DevicePickerProps {
  value: string | null;
  onChange: (slug: string) => void;
  invalid?: boolean;
}

/**
 * Searchable device combobox over the curated catalog + personal devices.
 * Personal devices are name-only and stay on this device.
 */
export default function DevicePicker({
  value,
  onChange,
  invalid = false,
}: DevicePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [personal, setPersonal] = useState<Device[]>(() =>
    getPersonalDevices().map(personalDeviceAsDevice),
  );

  const all = useMemo(() => {
    const catalog = getDevices();
    return [...personal, ...catalog];
  }, [personal]);

  const selected = useMemo(
    () => (value ? all.find((d) => d.slug === value) : undefined),
    [all, value],
  );

  function pick(slug: string) {
    onChange(slug);
    setOpen(false);
    setCreating(false);
    setQuery("");
  }

  function openCreate() {
    setNewName(query.trim());
    setCreating(true);
  }

  function confirmCreate() {
    const name = newName.trim();
    if (!name) return;
    const entry = addPersonalDevice(name);
    setPersonal(getPersonalDevices().map(personalDeviceAsDevice));
    pick(entry.slug);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreating(false);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose a device"
          className={cn(
            "pressable flex min-h-14 w-full items-center gap-3 rounded-xl border bg-background px-4 text-left transition-colors duration-150",
            invalid
              ? "border-destructive"
              : "border-border hover:border-foreground/25",
          )}
        >
          {selected ? (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold">
                  {selected.name}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {isPersonalSlug(selected.slug)
                    ? "Personal device"
                    : "Catalog device"}
                </span>
              </span>
              {isPersonalSlug(selected.slug) ? (
                <Badge variant="secondary" className="shrink-0">
                  Yours
                </Badge>
              ) : null}
            </>
          ) : (
            <span className="flex-1 text-base text-muted-foreground">
              Search devices…
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0"
      >
        {creating ? (
          <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Add your device</p>
              <button
                type="button"
                aria-label="Back to search"
                onClick={() => setCreating(false)}
                className="pressable flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Name
              </span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    confirmCreate();
                  }
                }}
                placeholder="e.g. Grandpa's Volcano"
                className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-foreground/40"
              />
            </label>

            <Button
              type="button"
              onClick={confirmCreate}
              disabled={!newName.trim()}
              className="pressable herb-hover min-h-11 bg-herb text-herb-foreground"
            >
              <Plus className="size-4" />
              Save &amp; use this device
            </Button>
            <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
              Saved on this device only — your gear stays private.
            </p>
          </div>
        ) : (
          <Command>
            <CommandInput
              placeholder="Search devices…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                No device matches “{query}”.
              </CommandEmpty>

              {personal.length > 0 ? (
                <CommandGroup heading="Your devices">
                  {personal.map((d) => (
                    <DeviceRow key={d.slug} device={d} onPick={pick} />
                  ))}
                </CommandGroup>
              ) : null}

              <CommandGroup heading="Catalog">
                {getDevices().map((d) => (
                  <DeviceRow key={d.slug} device={d} onPick={pick} />
                ))}
              </CommandGroup>

              <div className="border-t p-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="pressable flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <span className="flex size-6 items-center justify-center rounded-full bg-secondary">
                    <Plus className="size-3.5" />
                  </span>
                  {query.trim()
                    ? `Add “${query.trim()}” as your device`
                    : "Can't find it? Add yours"}
                </button>
              </div>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DeviceRow({
  device,
  onPick,
}: {
  device: Device;
  onPick: (slug: string) => void;
}) {
  const personalRow = isPersonalSlug(device.slug);
  return (
    <CommandItem
      value={device.slug}
      keywords={[device.name]}
      onSelect={() => onPick(device.slug)}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2"
    >
      {personalRow ? (
        <Leaf className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {device.name}
        </span>
        <span className="block text-xs text-muted-foreground">
          {personalRow ? "Personal device" : "Catalog device"}
        </span>
      </span>
    </CommandItem>
  );
}
