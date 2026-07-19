import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import ProfileIdentity from "@/components/profile/ProfileIdentity";
import ProfileStatsSection from "@/components/profile/ProfileStatsSection";
import ReviewStars from "@/components/profile/ReviewStars";
import { displayDeviceName } from "@/components/profile/profile-utils";
import { signOut } from "@/lib/auth";
import { useDevices } from "@/lib/data";
import {
  deleteAccount,
  deleteDeviceReview,
  fetchProfile,
  fetchProfileExport,
  fetchProfileStats,
  updateProfile,
  upsertDeviceReview,
} from "@/lib/profile";
import type {
  DeviceReview,
  ProfilePatch,
  ProfileSettings,
  ProfileStats,
} from "@/lib/types";

const REVIEW_BODY_MAX_LENGTH = 2000;

/**
 * /profile — the signed-in user's own profile (auth-guarded via AgeGate).
 *
 * Sections, top to bottom: identity (avatar, @handle, member-since, bio),
 * privacy (master switch + per-block flags + public link), private
 * statistics, the device collection (favorite picker), device reviews
 * (upsert dialog + delete confirm) and the data zone (JSON export, account
 * deletion). All copy lives in the "profile" i18n namespace; grams and
 * hours never leave this page.
 */
export default function Profile() {
  const { t } = useTranslation("profile");
  const navigate = useNavigate();

  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [reviews, setReviews] = useState<DeviceReview[]>([]);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [savingBio, setSavingBio] = useState(false);
  const [pendingFlag, setPendingFlag] = useState<string | null>(null);
  const [pendingFavorite, setPendingFavorite] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const [own, ownStats] = await Promise.all([
        fetchProfile(),
        fetchProfileStats(),
      ]);
      setProfile(own.profile);
      setReviews(own.reviews);
      setStats(ownStats);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------------------------------------------------------------- */
  /* Identity                                                          */
  /* ---------------------------------------------------------------- */

  async function handleSaveBio(bio: string): Promise<boolean> {
    if (savingBio) return false;
    setSavingBio(true);
    try {
      const next = await updateProfile({ bio });
      setProfile(next);
      toast.success(t("identity.saved"));
      return true;
    } catch {
      toast.error(t("identity.error"));
      return false;
    } finally {
      setSavingBio(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Privacy flags                                                     */
  /* ---------------------------------------------------------------- */

  async function handleFlagChange(
    key: keyof Pick<
      ProfilePatch,
      "isPublic" | "publicStats" | "publicReviews" | "publicCollection"
    >,
    value: boolean,
  ) {
    if (profile === null || pendingFlag !== null) return;
    const previous = profile;
    setProfile({ ...profile, [key]: value });
    setPendingFlag(key);
    try {
      const next = await updateProfile({ [key]: value });
      setProfile(next);
      toast.success(t("privacy.updated"));
    } catch {
      setProfile(previous);
      toast.error(t("privacy.error"));
    } finally {
      setPendingFlag(null);
    }
  }

  function handleCopyLink() {
    if (profile === null) return;
    const url = `${window.location.origin}/u/${encodeURIComponent(profile.handle)}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Collection (favorite device)                                      */
  /* ---------------------------------------------------------------- */

  async function handleFavorite(slug: string | null) {
    if (profile === null || pendingFavorite !== null) return;
    const previous = profile;
    setProfile({ ...profile, favoriteDeviceSlug: slug });
    setPendingFavorite(slug ?? "remove");
    try {
      const next = await updateProfile({ favoriteDeviceSlug: slug });
      setProfile(next);
    } catch {
      setProfile(previous);
      toast.error(t("privacy.error"));
    } finally {
      setPendingFavorite(null);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Data zone                                                         */
  /* ---------------------------------------------------------------- */

  async function handleExport() {
    if (exporting || profile === null) return;
    setExporting(true);
    try {
      const data = await fetchProfileExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `vaporlog-export-${profile.handle}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("data.export.error"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
      // Leave the guarded route first, then drop the local session —
      // otherwise the auth-change event bounces the user to /welcome
      // instead of the landing page.
      navigate("/");
      signOut();
    } catch {
      setDeleteOpen(false);
      toast.error(t("data.delete.error"));
      setDeleting(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <div
        className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-16 text-center"
        role="status"
      >
        <p className="font-medium">{t("loading.title")}</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {t("loading.subtitle")}
        </p>
      </div>
    );
  }

  if (loadFailed || profile === null || stats === null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground">
          {t("loadError.title")}
        </p>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t("loadError.body")}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void load()}
          className="pressable mt-1"
        >
          {t("loadError.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <ProfileIdentity
        handle={profile.handle}
        memberSince={profile.memberSince}
        bio={profile.bio}
        saving={savingBio}
        onSaveBio={handleSaveBio}
      />

      <PrivacySection
        profile={profile}
        pendingFlag={pendingFlag}
        copied={copied}
        onFlagChange={handleFlagChange}
        onCopyLink={handleCopyLink}
      />

      <ProfileStatsSection stats={stats} />

      <CollectionSection
        stats={stats}
        favoriteSlug={profile.favoriteDeviceSlug}
        pendingFavorite={pendingFavorite}
        onFavorite={handleFavorite}
      />

      <ReviewsSection reviews={reviews} onReviewsChange={setReviews} />

      {/* ------------------------------------------------------------ */}
      {/* Data zone                                                     */}
      {/* ------------------------------------------------------------ */}
      <section aria-labelledby="profile-data-heading" className="space-y-4">
        <h2
          id="profile-data-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {t("data.title")}
        </h2>

        <div className="rounded-xl border border-border/60 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("data.export.label")}
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("data.export.description")}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleExport()}
              disabled={exporting}
              className="pressable shrink-0"
            >
              <Download className="size-4" aria-hidden="true" />
              {exporting ? t("data.export.working") : t("data.export.button")}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-destructive/40 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {t("data.delete.label")}
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {t("data.delete.description")}
              </p>
            </div>
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="pressable shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("data.delete.button")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("data.delete.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("data.delete.confirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={deleting}>
                    {t("data.delete.cancel")}
                  </AlertDialogCancel>
                  {/* preventDefault keeps the dialog open until the delete
                      settles (same pattern as DeleteSessionButton). */}
                  <AlertDialogAction
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDeleteAccount();
                    }}
                    disabled={deleting}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    {deleting
                      ? t("data.delete.working")
                      : t("data.delete.confirmAction")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </section>

      <Toaster position="top-center" />
    </div>
  );
}

/* ==================================================================== */
/* Privacy                                                               */
/* ==================================================================== */

interface PrivacySectionProps {
  profile: ProfileSettings;
  pendingFlag: string | null;
  copied: boolean;
  onFlagChange: (
    key: "isPublic" | "publicStats" | "publicReviews" | "publicCollection",
    value: boolean,
  ) => void;
  onCopyLink: () => void;
}

/**
 * The privacy control room: the is_public master switch, the three
 * per-block flags (meaningful only while the master is on) and — while
 * public — the shareable link with copy feedback. The neverShow and
 * publicSessionsNote lines state the hard privacy rules verbatim.
 */
function PrivacySection({
  profile,
  pendingFlag,
  copied,
  onFlagChange,
  onCopyLink,
}: PrivacySectionProps) {
  const { t } = useTranslation("profile");

  const flags: {
    key: "publicStats" | "publicReviews" | "publicCollection";
    label: string;
    description: string;
  }[] = [
    {
      key: "publicStats",
      label: t("privacy.stats.label"),
      description: t("privacy.stats.description"),
    },
    {
      key: "publicReviews",
      label: t("privacy.reviews.label"),
      description: t("privacy.reviews.description"),
    },
    {
      key: "publicCollection",
      label: t("privacy.collection.label"),
      description: t("privacy.collection.description"),
    },
  ];

  return (
    <section aria-labelledby="profile-privacy-heading" className="space-y-4">
      <h2
        id="profile-privacy-heading"
        className="text-xl font-semibold tracking-tight"
      >
        {t("privacy.title")}
      </h2>

      <div className="rounded-xl border border-border/60 bg-card">
        {/* Master switch */}
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {t("privacy.master.label")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("privacy.master.description")}
            </p>
          </div>
          <Switch
            checked={profile.isPublic}
            onCheckedChange={(value) => onFlagChange("isPublic", value)}
            disabled={pendingFlag !== null}
            aria-label={t("privacy.master.label")}
          />
        </div>

        {/* Public link — only meaningful while the profile is public. */}
        {profile.isPublic && (
          <div className="border-t border-border/60 p-4">
            <p className="text-sm font-medium text-foreground">
              {t("privacy.publicLinkLabel")}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {`/u/${profile.handle}`}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCopyLink}
                className="pressable shrink-0"
              >
                {copied ? (
                  <Check className="size-4 text-herb" aria-hidden="true" />
                ) : (
                  <Copy className="size-4" aria-hidden="true" />
                )}
                {copied ? t("privacy.copied") : t("privacy.copy")}
              </Button>
            </div>
          </div>
        )}

        {/* Per-block flags */}
        {flags.map((flag) => (
          <div
            key={flag.key}
            className="flex items-center justify-between gap-4 border-t border-border/60 p-4"
          >
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {flag.label}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {flag.description}
              </p>
            </div>
            <Switch
              checked={profile[flag.key]}
              onCheckedChange={(value) => onFlagChange(flag.key, value)}
              disabled={pendingFlag !== null || !profile.isPublic}
              aria-label={flag.label}
            />
          </div>
        ))}

        {/* Hard rules, verbatim from the copy deck. */}
        <div className="space-y-1.5 border-t border-border/60 p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("privacy.publicSessionsNote")}
          </p>
          <p className="text-xs font-medium leading-relaxed text-muted-foreground">
            {t("privacy.neverShow")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ==================================================================== */
/* Collection                                                            */
/* ==================================================================== */

interface CollectionSectionProps {
  stats: ProfileStats;
  favoriteSlug: string | null;
  pendingFavorite: string | null;
  onFavorite: (slug: string | null) => void;
}

/**
 * The devices the user actually uses (from the private stats aggregation).
 * Each row carries a star toggle that PATCHes favoriteDeviceSlug; the
 * favorite itself gets the "Favorite" badge. Herb appears only on the
 * favorite star — one accent, like everywhere else on this page.
 */
function CollectionSection({
  stats,
  favoriteSlug,
  pendingFavorite,
  onFavorite,
}: CollectionSectionProps) {
  const { t } = useTranslation("profile");

  return (
    <section aria-labelledby="profile-collection-heading" className="space-y-4">
      <header className="space-y-1">
        <h2
          id="profile-collection-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {t("collection.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("collection.subtitle")}
        </p>
      </header>

      {stats.devices.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("collection.empty.title")}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("collection.empty.body")}
          </p>
          <Button
            asChild
            className="pressable herb-hover mt-1 bg-herb text-herb-foreground"
          >
            <Link to="/log">{t("collection.empty.cta")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
          {stats.devices.map((device) => {
            const name = device.name ?? displayDeviceName(device.slug);
            const isFavorite = device.slug === favoriteSlug;
            return (
              <li
                key={device.slug}
                className="flex items-center gap-3 px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() =>
                    onFavorite(isFavorite ? null : device.slug)
                  }
                  disabled={pendingFavorite !== null}
                  aria-label={
                    isFavorite
                      ? t("collection.removeFavorite")
                      : t("collection.favoriteAria", { device: name })
                  }
                  title={
                    isFavorite
                      ? t("collection.removeFavorite")
                      : t("collection.makeFavorite")
                  }
                  className="pressable flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:text-herb"
                >
                  <Star
                    className={`size-4 ${
                      isFavorite ? "fill-herb text-herb" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {name}
                </span>
                {isFavorite && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-herb/40 font-normal text-herb"
                  >
                    {t("collection.favorite")}
                  </Badge>
                )}
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {t("collection.sessionCount", { count: device.sessions })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ==================================================================== */
/* Reviews                                                               */
/* ==================================================================== */

interface ReviewsSectionProps {
  reviews: DeviceReview[];
  onReviewsChange: (reviews: DeviceReview[]) => void;
}

/** Dialog state: `null` closed; otherwise add-new or edit-existing. */
type ReviewDialogState =
  | { mode: "new" }
  | { mode: "edit"; review: DeviceReview }
  | null;

/**
 * The user's device reviews (one per device). Add/edit share one dialog:
 * device picker (catalog), a 1–5 star input and the body textarea; saving
 * upserts server-side. Delete goes through an AlertDialog confirm.
 */
function ReviewsSection({ reviews, onReviewsChange }: ReviewsSectionProps) {
  const { t } = useTranslation("profile");
  const { devices: catalog } = useDevices();

  const [dialog, setDialog] = useState<ReviewDialogState>(null);
  const [deviceSlug, setDeviceSlug] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Devices the catalog knows about, alphabetical; already-reviewed slugs
  // stay selectable (the upsert simply replaces the review).
  const deviceOptions = useMemo(
    () => [...catalog].sort((a, b) => a.name.localeCompare(b.name)),
    [catalog],
  );

  function openNew() {
    setDeviceSlug("");
    setRating(0);
    setBody("");
    setDialog({ mode: "new" });
  }

  function openEdit(review: DeviceReview) {
    setDeviceSlug(review.deviceSlug);
    setRating(review.rating);
    setBody(review.body);
    setDialog({ mode: "edit", review });
  }

  async function handleSave() {
    if (saving || deviceSlug === "" || rating < 1) return;
    setSaving(true);
    try {
      const saved = await upsertDeviceReview(deviceSlug, {
        rating,
        body: body.trim(),
      });
      onReviewsChange([
        saved,
        ...reviews.filter((r) => r.deviceSlug !== saved.deviceSlug),
      ]);
      setDialog(null);
      toast.success(t("reviews.saved"));
    } catch {
      toast.error(t("reviews.error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(review: DeviceReview) {
    if (pendingDelete !== null) return;
    setPendingDelete(review.deviceSlug);
    try {
      await deleteDeviceReview(review.deviceSlug);
      onReviewsChange(
        reviews.filter((r) => r.deviceSlug !== review.deviceSlug),
      );
      toast.success(t("reviews.deleted"));
    } catch {
      toast.error(t("reviews.deleteError"));
    } finally {
      setPendingDelete(null);
    }
  }

  const dialogDeviceName =
    dialog !== null && deviceSlug !== ""
      ? (deviceOptions.find((d) => d.slug === deviceSlug)?.name ??
        displayDeviceName(deviceSlug))
      : "";

  return (
    <section aria-labelledby="profile-reviews-heading" className="space-y-4">
      <header className="space-y-1">
        <h2
          id="profile-reviews-heading"
          className="text-xl font-semibold tracking-tight"
        >
          {t("reviews.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("reviews.subtitle")}
        </p>
      </header>

      {reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {t("reviews.empty.title")}
          </p>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            {t("reviews.empty.body")}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={openNew}
            className="pressable mt-1"
          >
            <Plus className="size-4" aria-hidden="true" />
            {t("reviews.add")}
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card">
            {reviews.map((review) => {
              const name =
                review.deviceName ?? displayDeviceName(review.deviceSlug);
              return (
                <li key={review.deviceSlug} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate text-sm font-medium text-foreground">
                        {name}
                      </span>
                      <ReviewStars
                        rating={review.rating}
                        label={t("reviews.dialog.ratingAria", {
                          value: review.rating,
                        })}
                      />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEdit(review)}
                        aria-label={t("reviews.edit")}
                        title={t("reviews.edit")}
                        className="pressable text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-4" aria-hidden="true" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("reviews.delete")}
                            title={t("reviews.delete")}
                            className="pressable text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("reviews.deleteConfirm.title")}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("reviews.deleteConfirm.body")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={pendingDelete === review.deviceSlug}
                            >
                              {t("reviews.deleteConfirm.cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(event) => {
                                event.preventDefault();
                                void handleDelete(review);
                              }}
                              disabled={pendingDelete === review.deviceSlug}
                              className="bg-destructive text-white hover:bg-destructive/90"
                            >
                              {t("reviews.deleteConfirm.action")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {review.body !== "" && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {review.body}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={openNew}
              className="pressable"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("reviews.add")}
            </Button>
          </div>
        </>
      )}

      {/* Add / edit dialog */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? t("reviews.dialog.titleEdit", { device: dialogDeviceName })
                : t("reviews.dialog.titleNew", { device: dialogDeviceName })}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Device picker: fixed while editing, catalog Select on add. */}
            {dialog?.mode === "new" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="review-device"
                  className="text-sm font-medium text-foreground"
                >
                  {t("reviews.pickDevice")}
                </label>
                <Select value={deviceSlug} onValueChange={setDeviceSlug}>
                  <SelectTrigger id="review-device" className="w-full">
                    <SelectValue placeholder={t("reviews.pickDevice")} />
                  </SelectTrigger>
                  <SelectContent>
                    {deviceOptions.map((device) => (
                      <SelectItem key={device.slug} value={device.slug}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 1–5 star input */}
            <div className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">
                {t("reviews.dialog.ratingLabel")}
              </span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={t("reviews.dialog.ratingAria", { value })}
                    className="pressable flex size-8 items-center justify-center rounded-md"
                  >
                    <Star
                      className={`size-5 ${
                        value <= rating
                          ? "fill-herb text-herb"
                          : "text-border"
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="review-body"
                className="text-sm font-medium text-foreground"
              >
                {t("reviews.dialog.bodyLabel")}
              </label>
              <Textarea
                id="review-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t("reviews.dialog.bodyPlaceholder")}
                maxLength={REVIEW_BODY_MAX_LENGTH}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog(null)}
              disabled={saving}
              className="pressable"
            >
              {t("reviews.dialog.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || deviceSlug === "" || rating < 1}
              className="pressable herb-hover bg-herb text-herb-foreground"
            >
              {saving ? t("reviews.dialog.saving") : t("reviews.dialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
