import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Leaf, Plus, X } from "lucide-react";
import { useDevices } from "@/lib/data";
import type { Device } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
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
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
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
 * Canonical catalog groups, in display order. Categories from the API are
 * matched case-insensitively so "portable" and "Portable" land together;
 * unknown non-empty categories keep their server label and sort after the
 * canonical groups; uncategorized devices (the bundled fallback, personal
 * imports) collect under "Other" at the very end.
 */
const CATEGORY_ORDER = ["Portable", "Desktop", "Butane/Torch", "Ball Vape"];
const OTHER_GROUP = "Other";

interface DeviceGroup {
  label: string;
  devices: Device[];
}

/** Groups the catalog by category; sorts in-group by sortOrder then name. */
function groupDevices(devices: Device[]): DeviceGroup[] {
  const byLabel = new Map<string, Device[]>();
  for (const device of devices) {
    const raw = device.category?.trim() ?? "";
    const canonical =
      raw === ""
        ? undefined
        : CATEGORY_ORDER.find((c) => c.toLowerCase() === raw.toLowerCase());
    const label = raw === "" ? OTHER_GROUP : (canonical ?? raw);
    const list = byLabel.get(label);
    if (list) list.push(device);
    else byLabel.set(label, [device]);
  }
  for (const list of byLabel.values()) {
    list.sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
  }
  const rank = (label: string): number => {
    const i = CATEGORY_ORDER.indexOf(label);
    if (i !== -1) return i;
    return label === OTHER_GROUP
      ? CATEGORY_ORDER.length + 1
      : CATEGORY_ORDER.length; // custom groups before Other
  };
  return Array.from(byLabel, ([label, groupDevices]) => ({
    label,
    devices: groupDevices,
  })).sort(
    (a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label),
  );
}

/**
 * Scores a device against the normalized (trimmed, lowercased) query —
 * 0: exact name, 1: name prefix, 2: a word in the name starts with the
 * query ("might" → "Mighty" beats "Almighty"), 3: name substring,
 * 4: category substring (category stays searchable, as with cmdk's
 * keywords before) — or null when nothing matches. Every match stays in
 * the list; tiers only decide the order, alphabetically within a tier.
 */
function deviceScore(device: Device, normalizedQuery: string): number | null {
  const name = device.name.toLowerCase();
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (
    name
      .split(/[^a-z0-9áéíóúñü]+/)
      .some((word) => word.startsWith(normalizedQuery))
  ) {
    return 2;
  }
  if (name.includes(normalizedQuery)) return 3;
  if ((device.category ?? "").toLowerCase().includes(normalizedQuery)) return 4;
  return null;
}

/**
 * Searchable device combobox over the curated catalog + personal devices.
 * Empty query: grouped by category (the catalog is ~100 devices — a flat
 * list would be unusable). Non-empty query: a single flat ranked list
 * (`shouldFilter={false}`, `deviceScore` ranking) mixing catalog and
 * personal devices, which stay visually marked as personal. Personal
 * devices are name-only and stay on this device.
 *
 * On mobile (<768px) the picker renders as a bottom Drawer instead of a
 * Popover: vaul tracks the visual viewport, so the sheet stays inside the
 * screen when the on-screen keyboard opens — a Popover is positioned
 * against the layout viewport and overflows the margins in that case.
 */
export default function DevicePicker({
  value,
  onChange,
  invalid = false,
}: DevicePickerProps) {
  const { t } = useTranslation("log");
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [personal, setPersonal] = useState<Device[]>(() =>
    getPersonalDevices().map(personalDeviceAsDevice),
  );
  // Bundled seed 8 until the API catalog hydrates, then the full list.
  const { devices: catalog } = useDevices();

  const all = useMemo(() => {
    return [...personal, ...catalog];
  }, [personal, catalog]);

  const groups = useMemo(() => groupDevices(catalog), [catalog]);

  const normalizedQuery = query.trim().toLowerCase();
  const searching = normalizedQuery !== "";

  const ranked = useMemo(() => {
    if (!searching) return [];
    return all
      .map((device) => ({ device, score: deviceScore(device, normalizedQuery) }))
      .filter(
        (entry): entry is { device: Device; score: number } =>
          entry.score !== null,
      )
      .sort(
        (a, b) =>
          a.score - b.score || a.device.name.localeCompare(b.device.name),
      )
      .map((entry) => entry.device);
  }, [all, normalizedQuery, searching]);

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

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreating(false);
      setQuery("");
    }
  }

  const trigger = (
    <button
      type="button"
      aria-label={t("devicePicker.chooseAria")}
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
                ? t("devicePicker.personal")
                : t("devicePicker.catalogDevice")}
            </span>
          </span>
          {isPersonalSlug(selected.slug) ? (
            <Badge variant="secondary" className="shrink-0">
              {t("devicePicker.yours")}
            </Badge>
          ) : null}
        </>
      ) : (
        <span className="flex-1 text-base text-muted-foreground">
          {t("devicePicker.searchPlaceholder")}
        </span>
      )}
      <ChevronDown
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong",
          open && "rotate-180",
        )}
      />
    </button>
  );

  const body = creating ? (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t("devicePicker.addTitle")}</p>
        <button
          type="button"
          aria-label={t("devicePicker.backAria")}
          onClick={() => setCreating(false)}
          className="pressable flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("devicePicker.nameLabel")}
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
          placeholder={t("devicePicker.namePlaceholder")}
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
        {t("devicePicker.saveUse")}
      </Button>
      <p className="-mt-1 text-xs leading-relaxed text-muted-foreground">
        {t("devicePicker.privacyNote")}
      </p>
    </div>
  ) : (
    <Command shouldFilter={false}>
      <CommandInput
        placeholder={t("devicePicker.searchPlaceholder")}
        value={query}
        onValueChange={setQuery}
        className="text-base"
      />
      <CommandList
        className={
          isMobile
            ? "max-h-[55dvh]"
            : "max-h-[min(18rem,var(--radix-popover-content-available-height,18rem))]"
        }
      >
        <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
          {t("devicePicker.noMatch", { query })}
        </CommandEmpty>

        {searching ? (
          <CommandGroup>
            {ranked.map((d) => (
              <DeviceRow
                key={d.slug}
                device={d}
                query={normalizedQuery}
                selected={d.slug === value}
                onPick={pick}
              />
            ))}
          </CommandGroup>
        ) : (
          <>
            {personal.length > 0 ? (
              <CommandGroup heading={t("devicePicker.yourDevices")}>
                {personal.map((d) => (
                  <DeviceRow
                    key={d.slug}
                    device={d}
                    selected={d.slug === value}
                    onPick={pick}
                  />
                ))}
              </CommandGroup>
            ) : null}

            {groups.map((group) => (
              <CommandGroup key={group.label} heading={group.label}>
                {group.devices.map((d) => (
                  <DeviceRow
                    key={d.slug}
                    device={d}
                    selected={d.slug === value}
                    onPick={pick}
                  />
                ))}
              </CommandGroup>
            ))}
          </>
        )}

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
              ? t("devicePicker.addQuery", { query: query.trim() })
              : t("devicePicker.addFallback")}
          </button>
        </div>
      </CommandList>
    </Command>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{t("devicePicker.chooseAria")}</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto px-2 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[var(--radix-popover-trigger-width)] min-w-72 max-w-[calc(100vw-1rem)] p-0"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

function HighlightedName({ name, query }: { name: string; query: string }) {
  const i = query === "" ? -1 : name.toLowerCase().indexOf(query);
  if (i === -1) return <>{name}</>;
  return (
    <>
      {name.slice(0, i)}
      <span className="font-semibold text-foreground">
        {name.slice(i, i + query.length)}
      </span>
      {name.slice(i + query.length)}
    </>
  );
}

function DeviceRow({
  device,
  query = "",
  selected = false,
  onPick,
}: {
  device: Device;
  query?: string;
  selected?: boolean;
  onPick: (slug: string) => void;
}) {
  const { t } = useTranslation("log");
  const personalRow = isPersonalSlug(device.slug);
  return (
    <CommandItem
      value={device.slug}
      keywords={[device.name, ...(device.category ? [device.category] : [])]}
      onSelect={() => onPick(device.slug)}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2"
    >
      {personalRow ? (
        <Leaf className="size-4 shrink-0 text-muted-foreground" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          <HighlightedName name={device.name} query={query} />
        </span>
        <span className="block text-xs text-muted-foreground">
          {personalRow ? t("devicePicker.personal") : t("devicePicker.catalogDevice")}
        </span>
      </span>
      {selected ? <Check className="size-4 shrink-0 text-herb" /> : null}
    </CommandItem>
  );
}
