// RecentBuildsRowSingleRow.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import { getQAEngineersUsers } from "../api/userFromEmail";
import { User } from "lucide-react";
import { assignQaEngineer, getLatestBuilds } from "../api/fetchBuildsApi";
import { createNotification } from "../api/notificationsApi";
import { isUnauthorizedError } from "../config/unauthorizedSession";
import { loadCache, saveCache } from "../config/storage";
import { RECENT_BUILD_RELEASE_EVENT } from "./AzureDevOpsUpdateNotifier";

const ASSIGNMENT_TIMEOUT_MS = 30000;

function withAssignmentTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const error = new Error("Tester assignment is taking too long. Please try again.");
      error.name = "AbortError";
      reject(error);
    }, ASSIGNMENT_TIMEOUT_MS);

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

/**
 * Changes done:
 * ✅ Removed "Open Build" + "Release Notes" links (card + modal)
 * ✅ Show 3 items in a row (responsive grid)
 * ✅ Click card -> opens small modal with build details
 */

function statusStyles(status) {
  const s = status?.toLowerCase?.();
  switch (s) {
    case "success":
    case "passed":
      return { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200" };
    case "failed":
    case "error":
      return { bg: "bg-rose-100", text: "text-rose-800", ring: "ring-rose-200" };
    case "running":
    case "in_progress":
      return { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200" };
    case "queued":
    default:
      return { bg: "bg-slate-100", text: "text-slate-700", ring: "ring-slate-200" };
  }
}

function safeDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function fallbackId() {
  try {
    return `REL-${crypto.randomUUID()}`;
  } catch {
    return `REL-${Math.random().toString(36).slice(2)}`;
  }
}

const RECENT_RELEASES_CACHE_KEY = "dashboard:recent-releases";

function getBuildIdentity(build) {
  const explicitId = String(build?._id ?? build?.id ?? "").trim();
  if (explicitId) return explicitId;

  return [
    build?.projectId ?? build?.projectName,
    build?.builds ?? build?.buildName,
    build?.buildVersion ?? build?.version,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|");
}

function mergeRecentBuilds(incoming, existing) {
  const merged = [];
  const seen = new Set();

  [...incoming, ...existing].forEach((build) => {
    if (!build || typeof build !== "object") return;

    const identity = getBuildIdentity(build);
    if (identity && seen.has(identity)) return;
    if (identity) seen.add(identity);
    merged.push(build);
  });

  return merged.slice(0, 50);
}

/**
 * Normalize any build shape into one unified object for UI + modal.
 * Supports backend dto fields + your card fields.
 */
function normalizeBuild(x) {
  if (!x || typeof x !== "object") return null;

  const projectId = x.projectId ?? x.project ?? x.projectKey ?? "";
  const projectName = x.projectName ?? "";
  const buildName = x.buildName ?? x.builds ?? x.name ?? x.title ?? "";

  const version = x.buildVersion ?? x.version ?? "";
  const releasedByName = x.releasedBy ?? x.author ?? x.createdBy ?? "";

  const date = x.uploadTime ?? x.createdAt ?? x.date ?? "";
  const notes = x.description ?? x.message ?? x.notes ?? "";

  const source = x.source ?? x.sourceType ?? "";
  const buildType = x.buildType ?? "";
  const testingStatus = x.testingStatus ?? x.testStatus ?? "";
  const testPriority = x.testPriority ?? "";

  const commitSha = x.commit?.sha ?? x.commitSha ?? x.commitSHA ?? "";

  // ✅ add urls
  const buildUrl = x.buildUrl ?? x.artifactUrl ?? x.url ?? "";
  const releaseNoteUrl = x.releaseNoteUrl ?? x.releaseNotesUrl ?? "";

  const id =
    x.id ??
    (projectId && version ? `${projectId}-${version}-${date || ""}` : "") ??
    fallbackId();

  return {
    id: String(id || fallbackId()),
    projectId: String(projectId || ""),
    projectName: String(projectName || ""),
    buildName: String(buildName || ""),
    version: String(version || ""),
    status: x.status ?? x.state ?? "",
    releasedBy: {
      name: String(releasedByName || ""),
      email: "",
    },
    date: date || "",
    notes: String(notes || ""),
    source: String(source || ""),
    buildType: String(buildType || ""),
    commit: commitSha ? { sha: String(commitSha) } : null,

    // ✅ new fields
    buildUrl: String(buildUrl || ""),
    releaseNoteUrl: String(releaseNoteUrl || ""),

    testingStatus: String(testingStatus || ""),
    testPriority: String(testPriority || ""),

    _raw: x,
  };
}

function buildAssignmentId(build) {
  const projectKey =
    build?._raw?.projectId ||
    build?.projectId ||
    build?._raw?.projectName ||
    build?.projectName ||
    "";

  const version =
    build?.version ||
    build?._raw?.buildVersion ||
    "";

  if (projectKey && version) {
    // avoid duplicating version when already embedded in projectKey
    if (projectKey.includes(version)) return projectKey;
    return `${projectKey}`;
  }
  return projectKey || version;
}

function BuildDetailsModal({ open, build, onClose, role, onAssignmentSaved }) {
  const closeBtnRef = React.useRef(null);
  const [qaOptions, setQaOptions] = useState([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState("");
  const [qaSavedMessage, setQaSavedMessage] = useState("");
  const [selectedQa, setSelectedQa] = useState("");
  const [initialQa, setInitialQa] = useState("");
  const [qaSaving, setQaSaving] = useState(false);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    setTimeout(() => closeBtnRef.current?.focus(), 0);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // always show current QA/tTester in state for display
  useEffect(() => {
    if (!open) return;
    const currentQa =
      build?.qaEngineer || build?.qaAssignee || build?.assignedTo || build?.tester || "";
    setSelectedQa(currentQa);
    setInitialQa(currentQa);
    setQaSavedMessage("");
  }, [open, build]);

  // only fetch options when role permits assignment
  useEffect(() => {
    if (!open || !["QAMANAGER", "ADMIN"].includes(role)) return;
    let cancelled = false;
    setQaLoading(true);
    setQaError("");

    (async () => {
      try {
        const users = await getQAEngineersUsers();

        if (cancelled) return;

        const options = Array.isArray(users)
          ? users
            .filter((u) => String(u?.role || "").toUpperCase() === "QAENGINEER")
            .map((u) => ({
              value: u.email,
              label: u.name || u.email,
            }))
          : [];

        setQaOptions(options);
      } catch (err) {
        if (!cancelled) setQaError(err?.message || "Failed to load Testers");
      } finally {
        if (!cancelled) setQaLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, role]);

  if (!open || !build) return null;

  const qaChanged = selectedQa !== initialQa;

  const saveTester = async () => {
    if (!qaChanged || !selectedQa) return;
    const projectId = buildAssignmentId(build);

    if (!projectId) {
      setQaError("Missing project id");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ASSIGNMENT_TIMEOUT_MS);

    try {
      setQaSaving(true);
      setQaError("");
      await withAssignmentTimeout(assignQaEngineer(projectId, selectedQa, { signal: controller.signal }));

      createNotification({
        userId: selectedQa,
        title: "QA Assignment",
        message: `Build ${projectId} is assigned to you for testing.`,
        type: "QA_ASSIGNMENT",
        isRead: false,
      }).catch((notifyErr) => {
        if (!isUnauthorizedError(notifyErr)) {
          console.warn(`Failed to send QA assignment notification to ${selectedQa}:`, notifyErr);
        }
      });

      setInitialQa(selectedQa);
      setQaSavedMessage("Tester has been successfully assigned. Notification is being sent.");
      Promise.resolve(onAssignmentSaved?.()).catch((refreshErr) => {
        console.warn("Tester assigned, but latest builds refresh failed:", refreshErr);
      });
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      const message = e?.name === "AbortError"
        ? "Tester assignment is taking too long. Please try again."
        : e?.message || "Failed";
      setQaError(message);
    } finally {
      window.clearTimeout(timeout);
      setQaSaving(false);
    }
  };

  const Field = ({ label, children }) => (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="col-span-2 text-sm text-gray-800 break-words">
        {children || "—"}
      </div>
    </div>
  );

  const Link = ({ href, text }) => {
    const url = (href || "").trim();
    if (!url) return <span className="text-gray-400">—</span>;

    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 hover:underline break-all"
        onClick={(e) => e.stopPropagation()}
        title={url}
      >
        {text || url}
      </a>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-4"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-details-title"
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-gray-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h4 id="build-details-title" className="text-base font-semibold text-gray-900">
              Build Details
            </h4>
            <p className="text-xs text-gray-500">
              {/* {(build.projectName || build.projectId) ? `${build.projectName || build.projectId} • ` : ""}
              {build.buildName || build.id || ""} */}
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-4">
          <Field label="Project">{build.projectName || build.projectId}</Field>
          <Field label="Build Name">{build.buildName}</Field>
          <Field label="Version">{build.version}</Field>
          <Field label="Released By">{build.releasedBy?.name}</Field>
          <Field label="Date">{build.date ? new Date(build.date).toLocaleString() : "—"}</Field>
          {/* <Field label="Source">{build.source}</Field> */}
          <Field label="Build Type">{build.buildType}</Field>
          <Field label="Description">{build.notes}</Field>

          {/* ✅ hyperlinks */}
          <Field label="Build URL">
            <Link href={build.buildUrl} text="View Build" />
          </Field>

          <Field label="Release Notes URL">
            <Link href={build.releaseNoteUrl} text="View Release Note" />
          </Field>

          {["QAMANAGER", "ADMIN"].includes(role) && (
            <Field label="Tester">
              {qaLoading ? (
                <span className="text-sm text-gray-500">Loading ...</span>
              ) : (
                <div className="flex items-center gap-2 m-2">
                  <select
                    value={selectedQa || ""}
                    onChange={(e) => {
                      setSelectedQa(e.target.value);
                      setQaSavedMessage("");
                      setQaError("");
                    }}
                    disabled={qaSaving}
                    className="block w-48 px-2 py-1 border rounded-md bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
                  >
                    <option value="" disabled>Select Tester</option>
                    {qaOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={saveTester}
                    disabled={!qaChanged || qaSaving || !selectedQa}
                    className="px-3 py-1 rounded-md bg-blue-600 text-white text-sm font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {qaSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
              {qaSavedMessage && ["QAMANAGER", "ADMIN"].includes(role) && (
                <p className="mt-1 text-xs text-emerald-600">{qaSavedMessage}</p>
              )}
              {qaError && ["QAMANAGER", "ADMIN"].includes(role) && (
                <p className="mt-1 text-xs text-rose-600">{qaError}</p>
              )}
            </Field>
          )}

          {/* <Field label="Commit SHA">{build.commit?.sha}</Field> */}
        </div>
      </div>
    </div>
  );
}


export default function RecentBuildsRowSingleRow({

  loading = false,
  onShowAll = () => { },
  role = "",
}) {
  const [copyingId, setCopyingId] = useState(null);
  const [toast, setToast] = useState("");
  const liveReleaseReceivedRef = useRef(false);

  // modal state
  const [selectedBuild, setSelectedBuild] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [builds, setBuilds] = useState(() => {
    const cached = loadCache(RECENT_RELEASES_CACHE_KEY);
    return Array.isArray(cached?.builds) ? cached.builds : [];
  });

  const loadLatestBuilds = async () => {
    try {
      const latestBuilds = await getLatestBuilds();
      const nextBuilds = Array.isArray(latestBuilds) ? latestBuilds : [];
      setBuilds((currentBuilds) => {
        const updatedBuilds = liveReleaseReceivedRef.current
          ? mergeRecentBuilds(currentBuilds, nextBuilds)
          : nextBuilds;

        saveCache(RECENT_RELEASES_CACHE_KEY, {
          builds: updatedBuilds,
        });
        return updatedBuilds;
      });
    } catch (error) {
      if (isUnauthorizedError(error)) return;
      console.error(error);
    }
  };


  const openDetails = (b) => {
    const norm = normalizeBuild(b);
    if (!norm) return;
    setSelectedBuild(norm);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setSelectedBuild(null);
  };

  const visible = useMemo(() => {
    const slice = Array.isArray(builds) ? builds.slice(0, 50) : [];
    return slice
      .map((raw) => ({ raw, norm: normalizeBuild(raw) }))
      .filter((x) => x.norm);
  }, [builds]);

  const handleCopy = async (text) => {
    if (!navigator?.clipboard || !text) return;
    try {
      setCopyingId(text);
      await navigator.clipboard.writeText(String(text));
      setTimeout(() => setCopyingId(null), 900);
    } catch {
      setCopyingId(null);
    }
  };

  useEffect(() => {
    loadLatestBuilds();
  }, []);

  useEffect(() => {
    const showRecentReleases = (event) => {
      const releasedBuilds = event?.detail?.builds;
      if (!Array.isArray(releasedBuilds) || releasedBuilds.length === 0) return;

      liveReleaseReceivedRef.current = true;
      setBuilds((currentBuilds) => {
        const updatedBuilds = mergeRecentBuilds(releasedBuilds, currentBuilds);
        saveCache(RECENT_RELEASES_CACHE_KEY, {
          builds: updatedBuilds,
          eventId: event?.detail?.eventId || "",
        });
        return updatedBuilds;
      });
    };

    window.addEventListener(RECENT_BUILD_RELEASE_EVENT, showRecentReleases);
    return () => {
      window.removeEventListener(RECENT_BUILD_RELEASE_EVENT, showRecentReleases);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);


  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Recent Releases</h3>
          <div className="text-sm text-slate-500">Loading latest builds…</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white border border-gray-100 rounded-lg p-4">
              <div className="h-20 rounded bg-slate-100" />
              <div className="mt-3 h-4 rounded bg-slate-100 w-3/4" />
              <div className="mt-2 h-3 rounded bg-slate-100 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!visible.length) {
    return (
      <div className="w-full py-8">
        <div className="text-center text-slate-500">
          <div className="font-medium">No recent builds</div>
          <div className="text-sm mt-1">No builds available at this time.</div>
        </div>
      </div>
    );
  }

  return (
    // ✅ if this component is inside a parent grid, keep `col-span-full`
    <div className="w-full col-span-full">
      {toast ? (
        <div className="mb-3 rounded-xl bg-green-50 text-green-800 ring-1 ring-green-100 px-3 py-2 text-sm">
          {toast}
        </div>
      ) : null}

      <BuildDetailsModal
        open={detailsOpen}
        build={selectedBuild}
        onClose={closeDetails}
        role={role}
        onAssignmentSaved={async () => {
          await loadLatestBuilds();
          
        }}
      />

      <div className="mb-3 w-full flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">Recent QA Releases</h3>

        <button
          type="button"
          onClick={onShowAll}
          className="text-sm font-semibold text-slate-600  cursor-pointer hover:text-blue-600 inline-flex items-center gap-1"
        >
          Show All
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* ✅ Full width grid */}
      <div
        className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        role="list"
        aria-label="Recent build releases"
      >
        {visible.map(({ raw, norm }) => {
          const s = statusStyles(norm.status);

          return (
            <article
              role="listitem"
              key={norm.id}
              className="w-full bg-blue-50 border border-blue-900 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-150 cursor-pointer"
              tabIndex={0}
              aria-label={`Build ${norm.version || norm.id}`}
              onClick={() => openDetails(raw)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openDetails(raw);
              }}
            >
              {/* Header */}
              <div className="flex w-full items-start justify-between gap-3">
                <div className="min-w-0 ">
                  <div
                    className="text-sm font-medium text-slate-800 truncate"
                    title={norm.projectName || norm.projectId}
                  >
                    {norm.projectName || norm.projectId || "—"}
                  </div>



                  {norm.buildName ? (
                    <div className="text-xs text-slate-500 truncate mt-0.5" title={norm.buildName}>
                      {norm.buildName}
                    </div>
                  ) : null}

                  <div className="text-xs text-slate-600">
                    Version: <span className="font-semibold">{norm.version || "—"}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                  {/* Date */}
                  <div className="text-xs text-slate-400">
                    {safeDate(norm.date)}
                  </div>

                  <button
                    type="button"
                    className="text-slate-500 hover:text-slate-700"
                    title="Copy Build ID"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(norm.id);
                    }}
                  >
                    {/* {copyingId === norm.id ? (
                    <span className="text-xs">Copied</span>
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )} */}
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="mt-3 w-full text-sm text-slate-600 flex items-start justify-between gap-3">
                {/* Left: Released By */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-slate-600 text-sm shrink-0">
                    {(norm.releasedBy?.name || "?")[0]?.toUpperCase?.() || "?"}
                  </div>

                  <div className="min-w-0">
                    <div
                      className="text-sm font-medium text-slate-800 truncate"
                      title={norm.releasedBy?.name}
                    >
                      {norm.releasedBy?.name || "Unknown"}
                    </div>

                    <div
                      className="text-xs text-slate-500 truncate"
                      title={norm.buildType || "No Build Type"}
                    >
                      {norm.buildType || "No Build Type"}
                    </div>
                  </div>

                </div>

                {/* Right: Test Status & Priority */}
                {/* Right: Test Status & Priority */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* Status badge */}
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-300">
                    <span className="text-[8px] font-medium uppercase tracking-wide text-slate-500">
                      Status
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {norm.testingStatus || "—"}
                    </span>
                  </div>

                  {/* Priority badge */}
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-300">
                    <span className="text-[8px] font-medium uppercase tracking-wide text-slate-500">
                      Priority
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {norm.testPriority || "—"}
                    </span>
                  </div>
                </div>


              </div>


              {/* Footer removed */}
            </article>
          );
        })}
      </div>
    </div>
  );

}
