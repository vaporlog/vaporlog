import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { getDevices, getProfile, getStrains, getVocab, saveSession, useStrains } from "@/lib/data";
import type { SessionLog } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import Section from "@/components/log/Section";
import StrainPicker from "@/components/log/StrainPicker";
import DevicePicker from "@/components/log/DevicePicker";
import TemperatureSlider from "@/components/log/TemperatureSlider";
import ChipGroup from "@/components/log/ChipGroup";
import RatingScale from "@/components/log/RatingScale";
import {
  clearDraft,
  EMPTY_DRAFT,
  getPersonalDevices,
  getPersonalStrains,
  loadDraft,
  saveDraft,
  type LogDraft,
} from "@/components/log/personal";

function toggleInList(list: string[], tag: string): string[] {
  return list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag];
}

/**
 * Log Session — the core flow.
 *
 * One well-sectioned page instead of a wizard: logging happens mid-session,
 * on a couch, with one thumb. A single scroll has zero navigation latency,
 * every optional field is skippable by simply scrolling past it, and the
 * sticky save bar always shows what's left to do. The draft autosaves on
 * every keystroke, so an interrupted session loses nothing.
 */
export default function LogSession() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const vocab = getVocab();
  // Lazy catalog: prefill validation and the sticky-bar name resolve once it lands.
  const { strains: catalog, loading: catalogLoading } = useStrains();

  // Restore the draft first; only a fresh form takes query-param prefill
  // (an in-progress draft is the user's own work — never clobber it).
  // A catalog strain in ?strain= can only be verified once the lazy catalog
  // is in memory — until then it is kept as `pendingStrain` and resolved by
  // the effect below (personal strains and warm-cache hits apply at once).
  const [initial] = useState(() => {
    const restored = loadDraft();
    if (restored) return { draft: restored, pendingStrain: null as string | null };

    const next = { ...EMPTY_DRAFT };
    let pendingStrain: string | null = null;
    const strainParam = searchParams.get("strain");
    const deviceParam = searchParams.get("device");
    if (strainParam) {
      const knownNow =
        getStrains().some((s) => s.slug === strainParam) ||
        getPersonalStrains().some((s) => s.slug === strainParam);
      if (knownNow) next.strainSlug = strainParam;
      else pendingStrain = strainParam; // maybe a catalog strain — recheck on load
    }
    if (deviceParam) {
      const known =
        getDevices().some((d) => d.slug === deviceParam) ||
        getPersonalDevices().some((d) => d.slug === deviceParam);
      if (known) next.deviceSlug = deviceParam;
    }
    return { draft: next, pendingStrain };
  });
  const [draft, setDraft] = useState<LogDraft>(initial.draft);
  const [pendingStrain, setPendingStrain] = useState<string | null>(
    initial.pendingStrain,
  );

  // Resolve a ?strain= prefill that the sync cache could not verify yet.
  // Never clobbers a strain the user picked (or typed a draft for) meanwhile.
  useEffect(() => {
    if (pendingStrain === null || catalogLoading) return;
    if (catalog.some((s) => s.slug === pendingStrain)) {
      setDraft((d) =>
        d.strainSlug ? d : { ...d, strainSlug: pendingStrain },
      );
    }
    setPendingStrain(null);
  }, [pendingStrain, catalogLoading, catalog]);

  const [triedSave, setTriedSave] = useState(false);
  const strainRef = useRef<HTMLDivElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const ratingRef = useRef<HTMLDivElement>(null);

  // Autosave on every change.
  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  // Announce a restored draft once — reassurance, not noise.
  const announcedRestore = useRef(false);
  useEffect(() => {
    if (announcedRestore.current) return;
    announcedRestore.current = true;
    if (
      draft.strainSlug ||
      draft.deviceSlug ||
      draft.notes ||
      draft.rating !== null
    ) {
      toast("Draft restored", {
        description: "You can pick up right where you left off.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof LogDraft>(key: K, value: LogDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const missingStrain = triedSave && !draft.strainSlug;
  const missingDevice = triedSave && !draft.deviceSlug;
  const missingRating = triedSave && draft.rating === null;

  // Names for the sticky-bar summary (catalog + personal entries).
  const strainName = useMemo(() => {
    if (!draft.strainSlug) return null;
    return (
      catalog.find((s) => s.slug === draft.strainSlug)?.name ??
      getPersonalStrains().find((s) => s.slug === draft.strainSlug)?.name ??
      null
    );
  }, [draft.strainSlug, catalog]);

  const deviceName = useMemo(() => {
    if (!draft.deviceSlug) return null;
    return (
      getDevices().find((d) => d.slug === draft.deviceSlug)?.name ??
      getPersonalDevices().find((d) => d.slug === draft.deviceSlug)?.name ??
      null
    );
  }, [draft.deviceSlug]);

  function handleSave() {
    if (!draft.strainSlug || !draft.deviceSlug || draft.rating === null) {
      setTriedSave(true);
      // Wayfinding: jump to the first missing piece.
      const target = !draft.strainSlug
        ? strainRef.current
        : !draft.deviceSlug
          ? deviceRef.current
          : ratingRef.current;
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const session: SessionLog = {
      id: "", // saveSession assigns a UUID
      strainSlug: draft.strainSlug,
      deviceSlug: draft.deviceSlug,
      temperatureC: draft.temperatureC,
      durationMin: draft.durationMin,
      amountG: draft.amountG,
      rating: draft.rating,
      aromas: draft.aromas,
      flavors: draft.flavors,
      moods: draft.moods,
      activities: draft.activities,
      notes: draft.notes.trim(),
      isPublic: draft.isPublic,
      author: getProfile()?.username ?? "anonymous",
      createdAt: "", // saveSession stamps the current time
    };

    saveSession(session);
    clearDraft();
    toast.success("Session saved", {
      description: `${strainName ?? "Your session"} · ${draft.rating}/10 — added to your diary.`,
    });
    navigate("/diary");
  }

  return (
    <div className="flex flex-col pb-32">
      <Toaster position="top-center" />

      <header className="flex flex-col gap-1.5 py-6">
        <h1 className="text-3xl font-semibold tracking-tight">
          Log a session
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Strain and device are all you need. Everything else is optional —
          and every keystroke is autosaved.
        </p>
      </header>

      <div className="flex flex-col gap-9">
        <div ref={strainRef}>
          <Section step={1} title="Strain">
            <StrainPicker
              value={draft.strainSlug}
              onChange={(slug) => update("strainSlug", slug)}
              invalid={missingStrain}
            />
            {missingStrain ? (
              <p className="text-sm font-medium text-destructive">
                Pick a strain — or add your own.
              </p>
            ) : null}
          </Section>
        </div>

        <div ref={deviceRef}>
          <Section step={2} title="Device">
            <DevicePicker
              value={draft.deviceSlug}
              onChange={(slug) => update("deviceSlug", slug)}
              invalid={missingDevice}
            />
            {missingDevice ? (
              <p className="text-sm font-medium text-destructive">
                Which vaporizer did you use?
              </p>
            ) : null}
          </Section>
        </div>

        <Section step={3} title="Temperature" hint="Optional">
          <TemperatureSlider
            value={draft.temperatureC}
            onChange={(c) => update("temperatureC", c)}
          />
        </Section>

        <Section step={4} title="Details" hint="Optional">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="duration" className="text-xs text-muted-foreground">
                Duration (min)
              </Label>
              <Input
                id="duration"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="15"
                value={draft.durationMin ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return update("durationMin", null);
                  const n = Number(raw);
                  if (Number.isFinite(n) && n >= 0)
                    update("durationMin", Math.round(n));
                }}
                className="h-12 text-base tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount" className="text-xs text-muted-foreground">
                Amount (g)
              </Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.05}
                placeholder="0.15"
                value={draft.amountG ?? ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") return update("amountG", null);
                  const n = Number(raw);
                  if (Number.isFinite(n) && n >= 0)
                    update("amountG", Math.round(n * 100) / 100);
                }}
                className="h-12 text-base tabular-nums"
              />
            </div>
          </div>
        </Section>

        <Section step={5} title="Experience" hint="Optional">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Aromas</h3>
              <ChipGroup
                options={vocab.aromas}
                selected={draft.aromas}
                custom={draft.customAromas}
                onToggle={(t) => update("aromas", toggleInList(draft.aromas, t))}
                onAddCustom={(t) =>
                  setDraft((d) => ({
                    ...d,
                    customAromas: [...d.customAromas, t],
                    aromas: [...d.aromas, t],
                  }))
                }
                addLabel="Add your own aroma"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Flavors</h3>
              <ChipGroup
                options={vocab.flavors}
                selected={draft.flavors}
                custom={draft.customFlavors}
                onToggle={(t) => update("flavors", toggleInList(draft.flavors, t))}
                onAddCustom={(t) =>
                  setDraft((d) => ({
                    ...d,
                    customFlavors: [...d.customFlavors, t],
                    flavors: [...d.flavors, t],
                  }))
                }
                addLabel="Add your own flavor"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Mood</h3>
              <ChipGroup
                options={vocab.moods}
                selected={draft.moods}
                custom={draft.customMoods}
                onToggle={(t) => update("moods", toggleInList(draft.moods, t))}
                onAddCustom={(t) =>
                  setDraft((d) => ({
                    ...d,
                    customMoods: [...d.customMoods, t],
                    moods: [...d.moods, t],
                  }))
                }
                addLabel="Add your own mood"
              />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Activities</h3>
              <ChipGroup
                options={vocab.activities}
                selected={draft.activities}
                custom={draft.customActivities}
                onToggle={(t) =>
                  update("activities", toggleInList(draft.activities, t))
                }
                onAddCustom={(t) =>
                  setDraft((d) => ({
                    ...d,
                    customActivities: [...d.customActivities, t],
                    activities: [...d.activities, t],
                  }))
                }
                addLabel="Add your own activity"
              />
            </div>
          </div>
        </Section>

        <div ref={ratingRef}>
          <Section step={6} title="Rating">
            <RatingScale
              value={draft.rating}
              onChange={(r) => update("rating", r)}
              invalid={missingRating}
            />
          </Section>
        </div>

        <Section step={7} title="Notes" hint="Optional">
          <Textarea
            value={draft.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="How was it? Terps, effects, context, what you'd do differently…"
            rows={4}
            className="min-h-28 resize-none text-base leading-relaxed"
          />
        </Section>

        <Section step={8} title="Publish">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold">
                {draft.isPublic ? "Public" : "Private"}
              </span>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Private by default. Public sessions appear as cards others can
                learn from — only your pseudonym shows.
              </p>
            </div>
            <Switch
              checked={draft.isPublic}
              onCheckedChange={(checked) => update("isPublic", checked)}
              aria-label="Make this session public"
              className="shrink-0 scale-125"
            />
          </div>
        </Section>
      </div>

      {/* Sticky save bar — always one thumb-stretch away. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <p className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
            {strainName || deviceName
              ? [strainName, deviceName, draft.temperatureC !== null ? `${draft.temperatureC}°C` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "Your draft autosaves as you go."}
          </p>
          {triedSave && (!draft.strainSlug || !draft.deviceSlug || draft.rating === null) ? (
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-destructive sm:hidden">
              {!draft.strainSlug
                ? "Pick a strain"
                : !draft.deviceSlug
                  ? "Pick a device"
                  : "Pick a rating"}
            </p>
          ) : null}
          <button
            type="button"
            onClick={handleSave}
            className={cn(
              "pressable herb-hover min-h-12 flex-1 rounded-xl bg-herb text-base font-semibold text-herb-foreground sm:flex-none sm:px-8",
            )}
          >
            Save session
          </button>
        </div>
      </div>
    </div>
  );
}
