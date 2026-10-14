// DevManagerWithFetch.js (or DevManager.jsx)
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { fetchPendingBuilds, getBuildById } from "../api/fetchBuildsApi.js";
import { approveBuildRpc, rejectBuildRpc } from "../api/devManagerApi.js";
import { createNotification } from "../api/notificationsApi.js";
import { markBuildApprovalsSeen } from "../api/userFromEmail.js";
import { sendTeamsMessage, getAllTeamsWithChannels } from "../api/teamsApi.js";
import { isUnauthorizedError } from "../config/unauthorizedSession";



/* ---------- helpers ---------- */
function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function toTime(value) {
  if (!value) return 0;
  const d = new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

function truncateDescription(value, maxLength = 40) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function statusBadge(status) {
  const st = (status || "pending").toLowerCase();
  if (st === "approved")
    return (
      <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        Approved
      </span>
    );
  if (st === "rejected")
    return (
      <span className="px-2 py-0.5 text-xs rounded-full bg-rose-50 text-rose-700 border border-rose-200">
        Rejected
      </span>
    );
  return (
    <span className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      Pending
    </span>
  );
}

function getBuildApprovalStatus(build) {
  const rawStatus = String(
    build?.approvalStatus ??
      build?.status ??
      build?.buildApprovalStatus ??
      ""
  )
    .trim()
    .toLowerCase();

  if (rawStatus.includes("reject")) return "rejected";
  if (rawStatus.includes("approve") || rawStatus === "final") return "approved";
  if (rawStatus.includes("pending")) return "pending";

  const hasIsPendingApproval = Object.prototype.hasOwnProperty.call(
    build ?? {},
    "isPendingApproval"
  );
  const hasPendingApproval = Object.prototype.hasOwnProperty.call(
    build ?? {},
    "pendingApproval"
  );
  const pendingFlag = hasIsPendingApproval
    ? build.isPendingApproval
    : hasPendingApproval
      ? build.pendingApproval
      : undefined;

  if (pendingFlag === null) return "rejected";
  if (pendingFlag === false) return "approved";
  if (pendingFlag === true) return "pending";
  return rawStatus || "pending";
}

/**
 * ✅ Normalize any backend/Graph format to:
 * [
 *   { teamId, teamName, channels: [{ channelId, channelName }] }
 * ]
 */
function normalizeTeamsData(input) {
  const arr = Array.isArray(input) ? input : [];
  return arr
    .map((t) => {
      const teamId = t?.teamId ?? t?.id ?? t?.groupId ?? "";
      const teamName = t?.teamName ?? t?.displayName ?? t?.name ?? teamId ?? "";
      const channelsRaw = t?.channels ?? t?.channelList ?? [];

      const channels = (Array.isArray(channelsRaw) ? channelsRaw : [])
        .map((c) => {
          const channelId = c?.channelId ?? c?.id ?? "";
          const channelName =
            c?.channelName ?? c?.displayName ?? c?.name ?? channelId ?? "";
          return { channelId, channelName };
        })
        .filter((c) => c.channelId);

      return { teamId, teamName, channels };
    })
    .filter((t) => t.teamId);
}

/* ---------- component ---------- */
export default function DevManager({
  managerName = "Dev Manager",
  defaultLimit = 10,
  projects = [],
}) {
  const { email, username } = useSelector((state) => state.auth);
  const [builds, setBuilds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(defaultLimit);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState("approve");
  const [modalNote, setModalNote] = useState("");
  const [activeBuild, setActiveBuild] = useState(null);
  const [actionDialogMessage, setActionDialogMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  // Teams dropdown data
  const [teamsData, setTeamsData] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsErr, setTeamsErr] = useState("");

  // ✅ Separate state for ID + Name (Team)
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeamName, setSelectedTeamName] = useState("");

  // ✅ Separate state for ID + Name (Channel)
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [selectedChannelName, setSelectedChannelName] = useState("");
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

  useEffect(() => {
    let mounted = true;
    markBuildApprovalsSeen().catch(() => {});

      (async () => {
        setTeamsLoading(true);
        setTeamsErr("");
        try {
          const raw = await getAllTeamsWithChannels();
          if (!mounted) return;
          const normalized = normalizeTeamsData(raw);
          setTeamsData(normalized);
        } catch (e) {
          if (!mounted) return;
          setTeamsErr(e?.message || "Failed to load Teams/channels");
          setTeamsData([]);
        } finally {
          if (!mounted) return;
          setTeamsLoading(false);
        }
      })();
    return () => {
      mounted = false;
    };
  }, []);

  // Selected team object + its channels
  const selectedTeamObj = useMemo(() => {
    return teamsData.find((t) => String(t.teamId) === String(selectedTeamId));
  }, [teamsData, selectedTeamId]);

  const channelsForTeam = selectedTeamObj?.channels || [];

  // Keep names consistent if teamsData loads after IDs already set
  useEffect(() => {
    if (!teamsData.length) return;

    const team = teamsData.find((t) => String(t.teamId) === String(selectedTeamId));
    if (team && !selectedTeamName) setSelectedTeamName(team.teamName || team.teamId);

    const ch = (team?.channels || []).find(
      (c) => String(c.channelId) === String(selectedChannelId)
    );
    if (ch && !selectedChannelName) setSelectedChannelName(ch.channelName || ch.channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamsData]);

  // When approve modal opens: pick defaults if empty/invalid
  useEffect(() => {
    if (!modalOpen) return;
    if (modalType !== "approve") return;
    if (!teamsData.length) return;

    // If no team selected -> first team + first channel
    if (!selectedTeamId) {
      const t0 = teamsData[0];
      const c0 = t0?.channels?.[0];

      setSelectedTeamId(t0?.teamId || "");
      setSelectedTeamName(t0?.teamName || t0?.teamId || "");

      setSelectedChannelId(c0?.channelId || "");
      setSelectedChannelName(c0?.channelName || c0?.channelId || "");
      return;
    }

    // If channel missing/invalid for selected team -> first channel
    const team = teamsData.find((t) => String(t.teamId) === String(selectedTeamId));
    const teamChannels = team?.channels || [];
    const has = teamChannels.some((c) => String(c.channelId) === String(selectedChannelId));

    if (!has) {
      const c0 = teamChannels[0];
      setSelectedChannelId(c0?.channelId || "");
      setSelectedChannelName(c0?.channelName || c0?.channelId || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, modalType, teamsData, selectedTeamId, selectedChannelId]);

  // Load pending builds
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const data = await fetchPendingBuilds(projectFilter || "", email || "", { limit });
        const array = Array.isArray(data) ? data : [];

        const normalized = array.map((b) => {
          const id =
            b.id ??
            b.buildId ??
            b.projectId ??
            `${b.projectName || ""}${b.buildVersion || ""}`;

          return {
            ...b,
            id,
            approvalStatus:
              b.approvalStatus ??
              (b.isPendingApproval === false ? "approved" : "pending"),
          };
        });

        if (!mounted) return;
        setBuilds(
          normalized.length
            ? normalized
            : []
        );
      } catch (e) {
        if (!mounted) return;
        if (isUnauthorizedError(e)) return;
        setErr(
          `Failed to load builds from API — using sample data (${e?.message || "network error"
          })`
        );
        // setBuilds(sampleBuilds.filter((s) => s.approvalStatus === "pending"));
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [limit, projectFilter, email]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return builds;
    return builds.filter((b) =>
      [b.builds, b.buildVersion, b.projectName, b.developerName, b.description]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [builds, search]);

  const sortedBuilds = useMemo(() => {
    // Latest first by Request Date (includes time)
    return [...filtered].sort((a, b) => {
      const ta = toTime(a.uploadTime || a.createdAt || a.requestDate || a.requestedAt);
      const tb = toTime(b.uploadTime || b.createdAt || b.requestDate || b.requestedAt);
      return tb - ta;
    });
  }, [filtered]);

  // Reset pagination when filters/search change
  useEffect(() => {
    setPage(1);
  }, [projectFilter, search, limit]);

  const totalPages = Math.max(1, Math.ceil(sortedBuilds.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const pagedBuilds = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedBuilds.slice(start, start + pageSize);
  }, [sortedBuilds, currentPage]);

  const openModal = (type, build) => {
    setErr("");
    setModalType(type);
    setActiveBuild(build);
    setModalNote(build?.approvalNote || "");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setActiveBuild(null);
    setModalNote("");
    setSaving(false);
  };

  const closeActionDialog = () => {
    setActionDialogMessage("");
  };

  const toggleDescription = (buildId) => {
    setExpandedDescriptions((prev) => ({
      ...prev,
      [buildId]: !prev[buildId],
    }));
  };

  // ✅ Team selection updates BOTH: teamId + teamName AND sets first channel
  const onTeamChange = (e) => {
    const newTeamId = e.target.value;
    const newTeamName = e.target.selectedOptions?.[0]?.text || "";

    setSelectedTeamId(newTeamId);
    setSelectedTeamName(newTeamName);

    const team = teamsData.find((t) => String(t.teamId) === String(newTeamId));
    const c0 = team?.channels?.[0];

    setSelectedChannelId(c0?.channelId || "");
    setSelectedChannelName(c0?.channelName || c0?.channelId || "");
  };

  // ✅ Channel selection updates BOTH: channelId + channelName (from selected option text)
  const onChannelChange = (e) => {
    const newChannelId = e.target.value;
    const newChannelName = e.target.selectedOptions?.[0]?.text || "";

    setSelectedChannelId(newChannelId);
    setSelectedChannelName(newChannelName);
  };

  const doAction = async () => {
    if (!activeBuild) return;

    // if (modalType === "approve" && (!selectedTeamId || !selectedChannelId)) {
    //   setErr("Please select a Teams team and channel to post the message.");
    //   return;
    // }

    setSaving(true);
    try {
      const action = modalType === "approve" ? approveBuildRpc : rejectBuildRpc;
      const key = activeBuild.id;
      const actorEmail = email || managerName;
      const actionTarget =
        activeBuild.projectId || activeBuild.id;

      const latestResponse = await getBuildById(actionTarget);
      const latestBuild = latestResponse?.data ?? latestResponse;
      const latestStatus = getBuildApprovalStatus(latestBuild);

      if (latestStatus !== "pending") {
        setBuilds((curr) => curr.filter((b) => b.id !== key));
        closeModal();
        setActionDialogMessage(
          latestStatus === "approved"
            ? "This build is already approved and was removed from pending approvals."
            : "This build is already rejected and was removed from pending approvals."
        );
        return;
      }

      await action(
        actionTarget,
        modalType === "approve"
          ? { notes: modalNote }
          : { approvedBy: actorEmail, note: modalNote }
      );

      const projectIdToSend = activeBuild.projectId ?? activeBuild.id;
      const devEngineerEmail = String(activeBuild.releaseByEmail || "").trim();
      const approverLabel = String(username || managerName || actorEmail).trim();

      if (devEngineerEmail) {
        try {
          await createNotification({
            userId: devEngineerEmail,
            title: modalType === "approve" ? "Build Approved" : "Build Rejected",
            message:
              modalType === "approve"
                ? `Build ${projectIdToSend}${activeBuild.buildVersion ? ` (${activeBuild.buildVersion})` : ""
                } was approved by ${approverLabel}.`
                : `Build ${projectIdToSend}${activeBuild.buildVersion ? ` (${activeBuild.buildVersion})` : ""
                } was rejected by ${approverLabel}, Reason: ${modalNote || "Not specified"}.`,
            type: modalType === "approve" ? "BUILD_APPROVED" : "BUILD_REJECTED",
            projectId: projectIdToSend,
            isRead: false,
          });
        } catch {
          // Notification failures should not surface as console errors from this view.
        }
      }

      if (modalType === "approve") {

        // await sendTeamsMessage({
        //   teamId: selectedTeamId,
        //   channelId: selectedChannelId,
        //   projectId: projectIdToSend,
        //   remarks: (modalNote || "").trim() || `Approved by ${managerName}`,
        // }).catch((e) => console.warn("Teams message failed:", e?.message || e));
      }

      setBuilds((curr) => curr.filter((b) => b.id !== key));
      closeModal();
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setErr(e?.message || "Action failed");
      setSaving(false);
    }
  };

  return (
    <section className="w-full max-w-full h-full min-h-0 mt-4 mr-3 bg-white rounded-2xl p-5 shadow-sm ring-1 ring-gray-100 overflow-x-hidden overflow-y-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            Pending Build Approvals
          </h2>
          <p className="text-sm text-gray-500">
            Showing builds with <strong>pending</strong> approval. Approving removes them
            from this list.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {projects?.length > 0 && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="px-3 py-2 text-sm border rounded-md bg-white"
              title="Filter by project"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search builds…"
            className="px-3 py-2 text-sm border rounded-md"
          />

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-3 py-2 text-sm border rounded-md bg-white"
            title="How many to load"
          >
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </header>

      {err && <div className="mb-3 text-sm text-rose-600">{err}</div>}

      <div className="w-full max-w-full overflow-x-auto">
        <table className="min-w-full w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="py-2 pr-4">Project</th>
              <th className="py-2 pr-4">Build / Version</th>
              {/*<th className="py-2 pr-4">Status</th>*/}
              <th className="py-2 pr-4">Requested By</th>
              <th className="py-2 pr-4">Request Date</th>
              <th className="py-2 pr-4">Links</th>
              <th className="py-2 pr-4 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="inline-flex items-center gap-3 text-gray-600">
                    <div
                      className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900"
                      aria-hidden="true"
                    />
                    <span>Loading pending builds...</span>
                  </div>
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-gray-500">
                  No pending builds found.
                </td>
              </tr>
            ) : (
              pagedBuilds.map((b) => (
                <tr key={b.id} className="border-b align-top">
                  <td className="py-3 pr-4">
                    <div className="text-gray-800">{b.projectName || "—"}</div>
                   
                  </td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-gray-900">{b.builds || "—"}</div>
                    <div className="text-gray-500">v{b.buildVersion || "—"}</div>
                    {b.description && (
                      <button
                        type="button"
                        onClick={() => toggleDescription(b.id)}
                        className={`mt-1 text-left text-gray-500 hover:text-gray-700 max-w-[22rem] ${
                          expandedDescriptions[b.id] ? "whitespace-normal break-words" : "truncate"
                        }`}
                        title={expandedDescriptions[b.id] ? "Show less" : "Show full description"}
                      >
                        {expandedDescriptions[b.id]
                          ? b.description
                          : truncateDescription(b.description, 40)}
                      </button>
                    )}
                  </td>

                  {/*<td className="py-3 pr-4">{statusBadge(b.approvalStatus)}</td>*/}

                  

                  
                  <td className="py-3 pr-4">
                   <div className="text-gray-700 text-sm font-semibold">{b.releasedBy || "—"}</div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="text-gray-800">{fmtDate(b.uploadTime || b.createdAt)}</div>
                  </td>

                  <td className="py-3 pr-4">
                    <div className="flex flex-col gap-1">
                      {b.buildUrl && (
                        <a
                          className="text-blue-600 hover:underline break-all"
                          href={b.buildUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Artifact
                        </a>
                      )}
                      {b.releaseNoteUrl && (
                        <a
                          className="text-blue-600 hover:underline break-all"
                          href={b.releaseNoteUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Release Notes
                        </a>
                      )}
                    </div>
                  </td>

                  <td className="py-3 pl-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        disabled={saving}
                        onClick={() => openModal("approve", b)}
                        className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors bg-green-100 text-green-700 border-green-200 hover:bg-green-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
                      >
                        Approve
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => openModal("reject", b)}
                        className="px-3 py-1.5 rounded-md text-sm font-medium border transition-colors bg-red-100 text-red-700 border-red-200 hover:bg-red-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200"
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && sortedBuilds.length > pageSize && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 text-sm font-medium border rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>

          <div className="text-sm text-gray-600">
            Page <span className="font-medium text-gray-900">{currentPage}</span> of{" "}
            <span className="font-medium text-gray-900">{totalPages}</span>
          </div>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="px-3 py-1.5 text-sm font-medium border rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      {actionDialogMessage && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/30" onClick={closeActionDialog} />
          <div
            className="relative bg-white w-full max-w-md rounded-xl shadow-xl p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="build-action-dialog-title"
          >
            <h3 id="build-action-dialog-title" className="text-lg font-semibold text-gray-900 mb-2">
              Build status updated
            </h3>
            <p className="text-sm text-gray-700">{actionDialogMessage}</p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeActionDialog}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-black"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && activeBuild && (
        <div className="fixed inset-0 z-50 grid place-items-center">
          <div className="absolute inset-0 bg-black/30" onClick={closeModal} />

          <div className="relative bg-white w-full max-w-lg rounded-xl shadow-xl p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {modalType === "approve" ? "Approve build" : "Reject build"}
            </h3>

            <p className="text-sm text-gray-600 mb-4">
              {activeBuild.projectId}
            </p>

            <label className="text-sm text-gray-700">Remarks / Note</label>
            <textarea
              value={modalNote}
              onChange={(e) => setModalNote(e.target.value)}
              rows={4}
              className="mt-1 w-full border rounded-md p-2 text-sm"
              placeholder="Add a remark…"
            />

            {modalType === "approve" && (
              <div className="mt-4">
                <div className="flex items-center justify-between">
                  {/* <label className="text-sm text-gray-700 font-medium">
                    Post release message to Teams
                  </label>
                  {teamsLoading && <span className="text-xs text-gray-500">Loading…</span>} */}
                </div>

                {/* {teamsErr && <div className="mt-1 text-xs text-rose-600">{teamsErr}</div>} */}

                {/* <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-600">Team</label>
                    <select
                      value={selectedTeamId}
                      onChange={onTeamChange}
                      disabled={saving || teamsLoading || teamsData.length === 0}
                      className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-white"
                    >
                      <option value="">Select team</option>
                      {teamsData.map((t) => (
                        <option key={t.teamId} value={t.teamId}>
                          {t.teamName || t.teamId}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-600">Channel</label>
                    <select
                      value={selectedChannelId}
                      onChange={onChannelChange}
                      disabled={saving || teamsLoading || !selectedTeamId}
                      className="mt-1 w-full px-3 py-2 text-sm border rounded-md bg-white"
                    >
                      <option value="">Select channel</option>
                      {channelsForTeam.map((c) => (
                        <option key={c.channelId} value={c.channelId}>
                          {c.channelName || c.channelId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div> */}

                {/* ✅ This WILL update correctly now */}
                {selectedTeamId && selectedChannelId && (
                  <div className="mt-2 text-xs text-gray-600">
                    Posting to:{" "}
                    <span className="font-medium text-gray-900">
                      {selectedTeamName || "—"}
                    </span>
                    {" / "}
                    <span className="font-medium text-gray-900">
                      {selectedChannelName || "—"}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={closeModal}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                onClick={doAction}
                disabled={saving}
                className={classNames(
                  "px-3 py-1.5 text-sm font-medium text-white rounded-md",
                  modalType === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                )}
              >
                {saving ? "Saving..." : modalType === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
