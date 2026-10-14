"use client";

import React, { useEffect, useMemo, useState } from "react";
import { isUnauthorizedError } from "../config/unauthorizedSession";
import { useMsal } from "@azure/msal-react";
import { syncAdUsers } from "../api/adSyncApi";
import { getGraphTokenAsync } from "../config/msalConfig";

// ✅ use these API helpers (DB only)
import { getAllUsers, updateUserRole } from "../api/userFromEmail"; // <-- adjust path as per your project

// ✅ allowed roles
const ROLES = ["ADMIN", "QAENGINEER", "DEVENGINEER", "QAMANAGER", "DEVMANAGER", "DEFAULTUSER"];

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getUserIdentity(u) {
  return normalizeText(u?.email) || normalizeText(u?.id);
}

function getKey(u) {
  const identity = getUserIdentity(u);
  if (identity) return identity;

  return [
    normalizeText(u?.name),
    normalizeText(u?.username),
    normalizeText(u?.role),
  ].join("|");
}

function dedupeUsers(list) {
  const map = new Map();

  for (const raw of Array.isArray(list) ? list : []) {
    const user = {
      ...raw,
      role: ROLES.includes(raw?.role) ? raw.role : "DEFAULTUSER",
    };

    const identity = getUserIdentity(user);
    const fallbackKey = [
      normalizeText(user?.name),
      normalizeText(user?.username),
      normalizeText(user?.role),
    ].join("|");

    const dedupeKey = identity || fallbackKey;
    if (!dedupeKey) continue;

    if (!map.has(dedupeKey)) {
      map.set(dedupeKey, user);
    } else {
      const existing = map.get(dedupeKey);

      // Prefer richer record if duplicate comes back from API
      map.set(dedupeKey, {
        ...existing,
        ...user,
        email: user?.email || existing?.email,
        id: user?.id || existing?.id,
        name: user?.name || existing?.name,
        username: user?.username || existing?.username,
        role: ROLES.includes(user?.role) ? user.role : existing?.role || "DEFAULTUSER",
      });
    }
  }

  return Array.from(map.values());
}

export default function AdminControlPanel() {
  const { instance, accounts } = useMsal();
  const [syncingAd, setSyncingAd] = useState(false);
  // --------------------
  // Toast
  // --------------------
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;

    const duration =
      toast.type === "ok"
        ? 8000
        : 12000;

    const t = setTimeout(() => {
      setToast(null);
    }, duration);

    return () => clearTimeout(t);
  }, [toast]);

  // --------------------
  // Users (DB)
  // --------------------
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Search
  const [userQuery, setUserQuery] = useState("");

  // Draft role changes (NOT saved until button click)
  const [roleDraft, setRoleDraft] = useState({}); // { [key]: role }
  const [roleSavingIds, setRoleSavingIds] = useState({}); // { [key]: boolean }

  // Pagination
  const [pageSize] = useState(10);
  const [page, setPage] = useState(1);

  const canSearch = userQuery.trim().length === 0 || userQuery.trim().length >= 2;

  function getDisplayRole(u) {
    const key = getKey(u);
    return roleDraft[key] ?? u.role ?? "DEFAULTUSER";
  }

  function isDirty(u) {
    const key = getKey(u);
    return !!roleDraft[key] && roleDraft[key] !== (u.role ?? "DEFAULTUSER");
  }

  function clearDraftFor(key) {
    setRoleDraft((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
  }

  const dirtyRoleCount = useMemo(() => {
    let c = 0;
    for (const u of allUsers) {
      const key = getKey(u);
      if (key && roleDraft[key] && roleDraft[key] !== (u.role ?? "DEFAULTUSER")) c++;
    }
    return c;
  }, [roleDraft, allUsers]);

  async function loadUsersFromDb() {
    setUsersLoading(true);
    try {
      const list = await getAllUsers();
      const cleaned = dedupeUsers(list);

      setAllUsers(cleaned);
      setPage(1);

      // Remove stale drafts for users no longer present
      setRoleDraft((prev) => {
        const next = {};
        for (const u of cleaned) {
          const key = getKey(u);
          if (key && prev[key]) {
            next[key] = prev[key];
          }
        }
        return next;
      });

    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setToast({ type: "err", msg: e?.message || "Failed to load users" });
      setAllUsers([]);
      setPage(1);
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleAdSync() {
    try {
      setSyncingAd(true);

      const graphToken = await getGraphTokenAsync();

      if (!graphToken) {
        throw new Error("Unable to acquire Microsoft Graph token");
      }

      const result = await syncAdUsers(graphToken);

      setToast({
        type: "ok",
        msg: `AD Sync Complete. Total: ${result.totalUsersFetched}, Created: ${result.newUsersCreated}, Updated: ${result.existingUsersUpdated}`,
      });

      await loadUsersFromDb();
    } catch (e) {
      console.error("AD Sync Error:", e);

      setToast({
        type: "err",
        msg:
          e?.response?.data?.message ||
          e?.message ||
          "Failed to sync users from AD",
      });
    } finally {
      setSyncingAd(false);
    }
  }

  useEffect(() => {
    loadUsersFromDb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------------------
  // Filtered + Pagination
  // --------------------
  const usersResult = useMemo(() => {
    if (!canSearch) return [];

    const deduped = dedupeUsers(allUsers);
    const term = userQuery.trim().toLowerCase();

    if (!term) return deduped;

    return deduped.filter((u) => {
      const name = String(u?.name || "").toLowerCase();
      const email = String(u?.email || "").toLowerCase();
      const role = String(u?.role || "").toLowerCase();
      return name.includes(term) || email.includes(term) || role.includes(term);
    });
  }, [allUsers, userQuery, canSearch]);

  useEffect(() => {
    setPage(1);
  }, [userQuery]);

  const totalPages = Math.max(1, Math.ceil((usersResult?.length || 0) / pageSize));

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const pagedUsers = useMemo(() => {
    const start = (page - 1) * pageSize;
    return usersResult.slice(start, start + pageSize);
  }, [usersResult, page, pageSize]);

  // --------------------
  // Save role (DB)
  // --------------------
  async function saveRole(u) {
    const key = getKey(u);
    const newRole = roleDraft[key];

    if (!key) return setToast({ type: "err", msg: "User key missing (id/email)" });
    if (!newRole) return;

    const email = String(u?.email || "").trim();
    if (!email) return setToast({ type: "err", msg: "User email not found" });

    setRoleSavingIds((p) => ({ ...p, [key]: true }));
    try {
      await updateUserRole(email, newRole);

      // update UI
      setAllUsers((prev) =>
        prev.map((x) =>
          normalizeText(x.email) === normalizeText(email) ? { ...x, role: newRole } : x
        )
      );
      clearDraftFor(key);

      setToast({ type: "ok", msg: "Role saved" });
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setToast({ type: "err", msg: e?.message || "Failed to save role" });
    } finally {
      setRoleSavingIds((p) => ({ ...p, [key]: false }));
    }
  }

  // --------------------
  // UI
  // --------------------
  return (
    <div className="min-h-screen bg-gray-50">
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 rounded-lg px-4 py-3 shadow-md border min-w-[350px]",
            toast.type === "ok"
              ? "bg-white border-green-200 text-green-700"
              : "bg-white border-red-200 text-red-700"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm">{toast.msg}</div>

            <button
              onClick={() => setToast(null)}
              className="font-bold cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Admin Controls
            </h1>
          </div>

          <button
            onClick={handleAdSync}
            disabled={syncingAd}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium border",
              syncingAd
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 cursor-pointer"
            )}
          >
            {syncingAd ? "Syncing..." : "Sync Users From AD"}
          </button>
        </div>

        <section className="rounded-xl bg-white border border-gray-200 shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Role Management</h2>
                <p className="text-sm text-gray-600">Select roles, then click Save.</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-gray-600">
                  Unsaved role changes:{" "}
                  <span className="font-semibold text-gray-900">{dirtyRoleCount}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="Search by name, email, role"
                  className="w-full md:w-[420px] rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-200"
                />

                <button
                  onClick={loadUsersFromDb}
                  disabled={usersLoading}
                  className={cn(
                    "rounded-lg px-4 py-2 text-sm font-medium border",
                    usersLoading
                      ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                      : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 cursor-pointer"
                  )}
                >
                  {usersLoading ? "Loading..." : "Refresh"}
                </button>

                {!canSearch && (
                  <div className="text-xs text-amber-700">Type at least 2 characters to search.</div>
                )}
              </div>
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {pagedUsers.length === 0 ? (
                    <tr>
                      <td className="py-4 text-gray-500" colSpan={5}>
                        {usersLoading ? "Loading..." : !canSearch ? "—" : "No users found."}
                      </td>
                    </tr>
                  ) : (
                    pagedUsers.map((u) => {
                      const key = getKey(u);
                      const dirty = isDirty(u);
                      const saving = !!roleSavingIds[key];

                      return (
                        <tr key={key} className="border-b last:border-b-0">
                          <td className="py-3 pr-3 font-medium text-gray-900">{u?.name || "—"}</td>
                          <td className="py-3 pr-3 text-gray-700">{u?.email || "—"}</td>

                          <td className="py-3 pr-3">
                            <select
                              value={getDisplayRole(u)}
                              onChange={(e) =>
                                setRoleDraft((p) => ({
                                  ...p,
                                  [key]: e.target.value,
                                }))
                              }
                              className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-gray-200 cursor-pointer"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 pr-3">
                            {dirty ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                Unsaved
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-800">
                                Saved
                              </span>
                            )}
                          </td>

                          <td className="py-3 pr-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveRole(u)}
                                disabled={!dirty || saving}
                                className={cn(
                                  "rounded-lg px-3 py-1.5 text-sm font-medium border",
                                  !dirty || saving
                                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                                    : "bg-gray-900 text-white border-gray-900 hover:bg-gray-800 cursor-pointer"
                                )}
                              >
                                {saving ? "Saving..." : "Save"}
                              </button>

                              {dirty && (
                                <button
                                  onClick={() => clearDraftFor(key)}
                                  className="rounded-lg px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="mt-4 flex flex-col items-center justify-center gap-3">
              <div className="text-xs text-gray-600 text-center">
                Showing{" "}
                <span className="font-semibold text-gray-900">
                  {usersResult.length ? (page - 1) * pageSize + 1 : 0}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-gray-900">
                  {Math.min(page * pageSize, usersResult.length || 0)}
                </span>{" "}
                of <span className="font-semibold text-gray-900">{usersResult.length || 0}</span> users
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium border",
                    page <= 1
                      ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                      : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 cursor-pointer"
                  )}
                >
                  Prev
                </button>

                <div className="text-sm text-gray-700">
                  Page <span className="font-semibold text-gray-900">{page}</span> /{" "}
                  <span className="font-semibold text-gray-900">{totalPages}</span>
                </div>

                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium border",
                    page >= totalPages
                      ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                      : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50 cursor-pointer"
                  )}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
