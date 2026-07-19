/**
 * vaporlog — admin dashboard API client.
 *
 * Wraps the read-only /api/admin/* endpoints used by the admin dashboard.
 * All calls require an admin Bearer token; the server returns 403 otherwise.
 */
import { apiFetch } from "@/lib/api";
import type {
  AdminStats,
  AdminSystem,
  AdminUsersResponse,
} from "@/lib/types";

export async function fetchAdminStats(): Promise<AdminStats> {
  const data = await apiFetch<{ stats: AdminStats }>("/admin/stats", {
    auth: true,
  });
  if (!data?.stats) throw new Error("Could not load admin stats.");
  return data.stats;
}

export async function fetchAdminUsers(
  limit = 50,
  offset = 0,
): Promise<AdminUsersResponse> {
  const data = await apiFetch<AdminUsersResponse>(
    `/admin/users?limit=${limit}&offset=${offset}`,
    { auth: true },
  );
  if (!data?.users) throw new Error("Could not load admin users.");
  return data;
}

export async function fetchAdminSystem(): Promise<AdminSystem> {
  const data = await apiFetch<{ system: AdminSystem }>("/admin/system", {
    auth: true,
  });
  if (!data?.system) throw new Error("Could not load admin system info.");
  return data.system;
}
