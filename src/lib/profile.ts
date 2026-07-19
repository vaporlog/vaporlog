/**
 * vaporlog — profile API client.
 *
 * Thin typed wrappers over lib/api.ts for the profile endpoints
 * (server/src/routes/profile.js). Unlike lib/data.ts there is no global
 * cache here on purpose: the profile page fetches on mount and owns its
 * state, and the public profile page is a one-shot read. Payload shapes
 * live in lib/types.ts (ProfileSettings, ProfileStats, DeviceReview,
 * PublicProfile).
 *
 * Privacy contract (mirrors the server): everything is private by default;
 * the public profile exists only while isPublic is on; grams and hours
 * never appear in any public payload.
 */
import { apiFetch } from "@/lib/api";
import type {
  DeviceReview,
  ProfilePatch,
  ProfileSettings,
  ProfileStats,
  PublicProfile,
  SessionLog,
} from "@/lib/types";

/** Payload of GET /api/profile — settings plus the user's reviews. */
export interface OwnProfile {
  profile: ProfileSettings;
  reviews: DeviceReview[];
}

/** Payload of GET /api/profile/export — everything stored about the user. */
export interface ProfileExport {
  exportedAt: string;
  profile: ProfileSettings;
  sessions: SessionLog[];
  reviews: DeviceReview[];
}

/** The signed-in user's full profile + reviews. Rejects when signed out. */
export async function fetchProfile(): Promise<OwnProfile> {
  const data = await apiFetch<OwnProfile>("/profile", { auth: true });
  if (!data?.profile) {
    throw new Error("Could not load your profile.");
  }
  return { profile: data.profile, reviews: data.reviews ?? [] };
}

/**
 * Applies a partial profile update (bio, privacy flags, favorite device)
 * and returns the server's authoritative settings. Server messages pass
 * through verbatim (e.g. "Unknown device.").
 */
export async function updateProfile(
  patch: ProfilePatch,
): Promise<ProfileSettings> {
  const data = await apiFetch<{ profile: ProfileSettings }>("/profile", {
    method: "PATCH",
    body: patch,
    auth: true,
  });
  if (!data?.profile) {
    throw new Error("Could not update your profile.");
  }
  return data.profile;
}

/** Private statistics computed from the user's sessions. */
export async function fetchProfileStats(): Promise<ProfileStats> {
  const data = await apiFetch<{ stats: ProfileStats }>("/profile/stats", {
    auth: true,
  });
  if (!data?.stats) {
    throw new Error("Could not load your statistics.");
  }
  return data.stats;
}

/**
 * Creates or replaces the user's review of one device (upsert).
 * `rating` is a whole number 1–5; `body` is capped server-side at 2,000
 * characters.
 */
export async function upsertDeviceReview(
  deviceSlug: string,
  input: { rating: number; body: string },
): Promise<DeviceReview> {
  const data = await apiFetch<{ review: DeviceReview }>(
    `/profile/reviews/${encodeURIComponent(deviceSlug)}`,
    { method: "PUT", body: input, auth: true },
  );
  if (!data?.review) {
    throw new Error("Could not save the review.");
  }
  return data.review;
}

/** Deletes the user's review of one device. Resolves silently on 204. */
export async function deleteDeviceReview(deviceSlug: string): Promise<void> {
  await apiFetch(`/profile/reviews/${encodeURIComponent(deviceSlug)}`, {
    method: "DELETE",
    auth: true,
  });
}

/** Everything stored about the user (profile + sessions + reviews). */
export async function fetchProfileExport(): Promise<ProfileExport> {
  const data = await apiFetch<ProfileExport>("/profile/export", {
    auth: true,
  });
  if (!data?.profile) {
    throw new Error("Could not export your data.");
  }
  return data;
}

/**
 * Permanently deletes the account (sessions, reviews and tokens cascade
 * server-side). The caller signs out locally afterwards.
 */
export async function deleteAccount(): Promise<void> {
  await apiFetch("/profile", { method: "DELETE", auth: true });
}

/**
 * The public profile for a handle (open endpoint, no auth). Rejects with
 * `error.status === 404` when the profile is private or unknown — the
 * server deliberately returns the identical response for both.
 */
export async function fetchPublicProfile(
  handle: string,
): Promise<PublicProfile> {
  const data = await apiFetch<PublicProfile>(
    `/u/${encodeURIComponent(handle)}`,
  );
  if (!data?.handle) {
    throw new Error("Could not load this profile.");
  }
  return data;
}
