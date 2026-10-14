// src/components/PendingSignoffApprovals.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
  getAllSignoffsPendingApproval,
  approveSignoffById,
  rejectSignoffById,
} from "../api/signoffApi";
import { createNotification } from "../api/notificationsApi";
import { getQAEngineersUsers, markSignoffApprovalsSeen } from "../api/userFromEmail";
import { fetchConfidenceScore } from "../api/fetchConfidenceScore";
import { getBackendApiTokenAsync } from "../config/msalConfig";
import { isUnauthorizedError } from "../config/unauthorizedSession";

import {
  getAllTeamsWithChannels,
  sendSignOffTeamsMessage,
} from "../api/teamsApi";

function formatDate(v) {
  if (!v) return "—";
  try {
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
  } catch {
    return String(v);
  }
}

/**
 * Normalize and validate external URLs.
 * - Trims whitespace
 * - Removes leading/trailing quotes/backticks and trailing commas
 * - Rejects relative URLs ("/home", "home") to avoid SPA routing
 * - Ensures http/https scheme (defaults to https)
 */
function normalizeExternalUrl(raw) {
  if (!raw) return "";

  const cleaned = String(raw)
    .trim()
    .replace(/^[`"']+/, "")
    .replace(/[`"'\s,]+$/, "");

  if (!cleaned) return "";

  if (cleaned.startsWith("/")) return "";
  if (/^[a-z0-9_-]+$/i.test(cleaned)) return "";

  const withScheme = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    return new URL(withScheme).toString();
  } catch {
    return "";
  }
}

function getPdfUrl(s) {
  return normalizeExternalUrl(s?.pdfPath) || normalizeExternalUrl(s?.signOffPdfLink) || "";
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findRequesterEmail(signoff, qaUsers = []) {
  const directCandidates = [
    signoff?.requestedByEmail,
    signoff?.requesterEmail,
    signoff?.completedByEmail,
    signoff?.createdByEmail,
    signoff?.qaEngineerEmail,
    signoff?.qaAssigneeEmail,
    signoff?.userId,
    signoff?.email,
    signoff?.completedBy,
  ];

  for (const candidate of directCandidates) {
    if (isEmailLike(candidate)) return String(candidate).trim();
  }

  const completedBy = normalizeIdentity(signoff?.completedBy);
  if (!completedBy || !Array.isArray(qaUsers) || qaUsers.length === 0) return "";

  const matchedUser = qaUsers.find((user) => {
    const identities = [
      user?.email,
      user?.name,
      user?.username,
    ].map(normalizeIdentity);
    return identities.includes(completedBy);
  });

  return String(matchedUser?.email || "").trim();
}

/**
 * Supports a few possible backend shapes:
 * 1) [{ teamId, teamName, channels: [{ channelId, channelName }] }]
 * 2) Flat list: [{ teamId, teamName, channelId, channelName }]
 * 3) { teams: [...] }
 */
function normalizeTeamsPayload(payload) {
  const raw = payload?.teams ?? payload;
  if (!Array.isArray(raw)) return [];

  // Flat list? (has channelId but no channels array)
  const looksFlat = raw.some((x) => x && x.channelId && !Array.isArray(x.channels));
  if (looksFlat) {
    const map = new Map();
    for (const row of raw) {
      const tId = row.teamId || row.team?.id || row.id;
      if (!tId) continue;

      const tName =
        row.teamName ||
        row.team?.displayName ||
        row.team?.name ||
        row.displayName ||
        row.name ||
        "Team";

      const cId = row.channelId || row.channel?.id;
      const cName =
        row.channelName || row.channel?.displayName || row.channel?.name || "Channel";

      if (!map.has(tId)) {
        map.set(tId, { teamId: tId, teamName: tName, channels: [] });
      }
      if (cId) {
        map.get(tId).channels.push({ channelId: cId, channelName: cName });
      }
    }
    return Array.from(map.values());
  }

  // Nested list
  return raw
    .map((t) => {
      const teamId = t.teamId || t.id || t.team?.id;
      const teamName = t.teamName || t.displayName || t.name || t.team?.displayName || "Team";

      const chRaw = t.channels || t.channelList || [];
      const channels = Array.isArray(chRaw)
        ? chRaw
          .map((c) => ({
            channelId: c.channelId || c.id || c.channel?.id,
            channelName: c.channelName || c.displayName || c.name || "Channel",
          }))
          .filter((c) => c.channelId)
        : [];

      return teamId ? { teamId, teamName, channels } : null;
    })
    .filter(Boolean);
}

export default function PendingSignoffApprovals() {
  const { email, username, role, authToken, token, accessToken } = useSelector((state) => state.auth);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("desc"); // newest first

  // confidence banner state
  const [confidenceScore, setConfidenceScore] = useState(null);
  const [confidenceLoading, setConfidenceLoading] = useState(false);




  // per-row action state
  const [actionId, setActionId] = useState("");
  const [actionType, setActionType] = useState(""); // "approve" | "reject"

  // Teams selection + modal state
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approveItem, setApproveItem] = useState(null);

  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsErr, setTeamsErr] = useState("");

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [teamsRemarks, setTeamsRemarks] = useState("");
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [lowConfidenceConfirmOpen, setLowConfidenceConfirmOpen] = useState(false);
  const [qaUsers, setQaUsers] = useState([]);
  const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";
  const organization = import.meta.env.VITE_ORGANIZATION || "";
  const confidenceVersion = useMemo(() => {
    return String(approveItem?.version || "").trim();
  }, [approveItem]);

  const confidenceProject = useMemo(() => {
    return approveItem?.projectName || approveItem?.project || "";
  }, [approveItem]);

  const confidenceTag = useMemo(() => {
    const normalizedVersion = String(approveItem?.version || "").trim();
    return normalizedVersion && normalizedVersion !== "__NO_BUILDS__"
      ? normalizedVersion
      : "";
  }, [approveItem]);

  const confidenceBuildName = useMemo(() => {
    const normalizedBuildName = String(
      approveItem?.buildName || approveItem?.build || approveItem?.builds || ""
    ).trim();
    return normalizedBuildName && normalizedBuildName !== "__NO_BUILDS__"
      ? normalizedBuildName
      : "";
  }, [approveItem]);


  useEffect(() => {
    const ctrl = new AbortController();
    markSignoffApprovalsSeen().catch((e) => {
      if (!isUnauthorizedError(e)) {
        console.warn("Failed to mark sign-off approvals seen:", e);
      }
    });

    async function load() {
      setLoading(true);
      setErr("");
      try {
        const [data, qaUserList] = await Promise.all([
          getAllSignoffsPendingApproval({ signal: ctrl.signal }),
          getQAEngineersUsers({ signal: ctrl.signal }).catch((qaErr) => {
            console.warn("Failed to load QA engineers for notifications:", qaErr);
            return [];
          }),
        ]);
        if (ctrl.signal.aborted) return;
        setItems(Array.isArray(data) ? data : []);
        setQaUsers(Array.isArray(qaUserList) ? qaUserList : []);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error(e);
        if (isUnauthorizedError(e)) return;
        setErr(e?.message || "Failed to load pending sign-offs");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => ctrl.abort();
  }, []);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const filtered = useMemo(() => {
    let list = Array.isArray(items) ? [...items] : [];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((x) => {
        const project = String(x.projectName ?? x.project ?? "").toLowerCase();
        const version = String(x.version ?? "").toLowerCase();
        const completedBy = String(x.completedBy ?? "").toLowerCase();
        const approvedBy = String(x.approvedBy ?? "").toLowerCase();
        return (
          project.includes(q) ||
          version.includes(q) ||
          completedBy.includes(q) ||
          approvedBy.includes(q) ||
          String(x.id ?? "").toLowerCase().includes(q)
        );
      });
    }

    list.sort((a, b) => {
      const da = new Date(a.createdAt || a.dateChanged || 0).getTime();
      const db = new Date(b.createdAt || b.dateChanged || 0).getTime();
      return sortDir === "desc" ? db - da : da - db;
    });

    return list;
  }, [items, search, sortDir]);



  useEffect(() => {
    let ignore = false;

    async function loadConfidence() {
      if (!approveModalOpen || !organization || !confidenceProject || !confidenceTag) {
        setConfidenceScore(null);
        setConfidenceLoading(false);
        return;
      }

      try {
        setConfidenceLoading(true);
        const backendToken = await getBackendApiTokenAsync();
        if (!backendToken) {
          if (!ignore) {
            setConfidenceScore(null);
          }
          return;
        }

        const score = await fetchConfidenceScore({
          authToken: `Bearer ${backendToken}`,
          organization,
          project: confidenceProject,
          tag: confidenceTag,
          buildName: confidenceBuildName,
        });
        if (!ignore) {
          setConfidenceScore(Number.isFinite(score) ? score : null);
        }
      } catch (e) {
        console.error("Failed to fetch confidence score:", e);
        if (!ignore) {
          setConfidenceScore(null);
        }
      } finally {
        if (!ignore) {
          setConfidenceLoading(false);
        }
      }
    }

    loadConfidence();

    return () => {
      ignore = true;
    };
  }, [approveModalOpen, organization, confidenceProject, confidenceTag, confidenceBuildName]);

  const showConfidenceWarningIcon = useMemo(() => {
    return true;
  }, []);

  const confidenceBannerClassName = useMemo(() => {
  if (confidenceLoading || confidenceScore == null) {
    return "mx-4 mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800";
  }

  if (confidenceScore > 90) {
    return "mx-4 mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800";
  }

  if (confidenceScore < 70) {
    return "mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800";
  }

  return "mx-4 mt-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800";
}, [confidenceLoading, confidenceScore]);

  const refresh = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await getAllSignoffsPendingApproval();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      if (isUnauthorizedError(e)) return;
      setErr(e?.message || "Failed to refresh");
    } finally {
      setLoading(false);
    }
  };

  const removeFromList = (id) => {
    setItems((prev) => (Array.isArray(prev) ? prev.filter((x) => x?.id !== id) : prev));
  };

  async function loadTeamsIfNeeded() {
    if (teamsLoading) return;
    if (teams.length > 0) return;

    setTeamsLoading(true);
    setTeamsErr("");
    try {
      const data = await getAllTeamsWithChannels();
      const normalized = normalizeTeamsPayload(data);
      setTeams(normalized);

      // Preselect first team/channel if empty
      const firstTeam = normalized[0];
      if (firstTeam?.teamId && !selectedTeamId) {
        setSelectedTeamId(firstTeam.teamId);
      }
      const firstCh = firstTeam?.channels?.[0];
      if (firstCh?.channelId && !selectedChannelId) {
        setSelectedChannelId(firstCh.channelId);
      }
    } catch (e) {
      console.error(e);
      setTeamsErr(e?.message || "Failed to load Teams channels");
    } finally {
      setTeamsLoading(false);
    }
  }

  const channelsForSelectedTeam = useMemo(() => {
    const t = teams.find((x) => x.teamId === selectedTeamId);
    return t?.channels || [];
  }, [teams, selectedTeamId]);

  // If team changes (or teams loaded), ensure channel belongs to team
  useEffect(() => {
    if (!approveModalOpen) return;
    if (!selectedTeamId) return;

    const chans = channelsForSelectedTeam;
    if (!Array.isArray(chans) || chans.length === 0) {
      setSelectedChannelId("");
      return;
    }

    const stillValid = chans.some((c) => c.channelId === selectedChannelId);
    if (!stillValid) {
      setSelectedChannelId(chans[0].channelId);
    }
  }, [approveModalOpen, selectedTeamId, channelsForSelectedTeam, selectedChannelId]);

  const openApproveModal = async (signoff) => {
    setApproveItem(signoff);
    setTeamsRemarks("");
    setTeamsErr("");
    setApproveModalOpen(true);

    await loadTeamsIfNeeded();

    if (!selectedTeamId && teams[0]?.teamId) setSelectedTeamId(teams[0].teamId);
    const t = teams.find((x) => x.teamId === (selectedTeamId || teams[0]?.teamId));
    if (!selectedChannelId && t?.channels?.[0]?.channelId) {
      setSelectedChannelId(t.channels[0].channelId);
    }
  };

  const closeApproveModal = () => {
    setApproveModalOpen(false);
    setApproveItem(null);
    setTeamsRemarks("");
    setConfidenceScore(null);
    setConfidenceLoading(false);
    setLowConfidenceConfirmOpen(false);
  };

  const handleApprove = async (signoff) => {
    if (!signoff?.id) return;
    await openApproveModal(signoff);
  };

  const completeApproveAndPost = async () => {
    const s = approveItem;
    if (!s?.id) return;

    if (!teamsErr) {
      if (!selectedTeamId) {
        setTeamsErr("Please select a Team.");
        return;
      }
      if (!selectedChannelId) {
        setTeamsErr("Please select a Channel.");
        return;
      }
    }

    setActionId(s.id);
    setActionType("approve");
    setErr("");

    try {
      const project = s.projectName || s.project || "—";
      const defaultRemarks = `QA sign-off approved for ${project}${s.version ? ` (v${s.version})` : ""}.`;
      const finalRemarks = (teamsRemarks || "").trim() || defaultRemarks;

      await approveSignoffById(s.id, { note: finalRemarks });

      const requesterEmail = findRequesterEmail(s, qaUsers);
      const reviewerLabel = String(username || email || "QA Manager").trim();

      if (requesterEmail) {
        try {
          const projectLabel = s.projectName || s.project || "project";
          const versionLabel = String(s.version || "").trim();

          await createNotification({
            userId: requesterEmail,
            title: "QA Sign-off Approved",
            message: `Your sign-off request for ${projectLabel}${versionLabel ? ` (${versionLabel})` : ""} was approved by ${reviewerLabel}.`,
            type: "QA_SIGNOFF_APPROVED",
            projectId: projectLabel,
            isRead: false,
          });
        } catch (notifyErr) {
          if (!isUnauthorizedError(notifyErr)) {
            console.warn(
              `Failed to send sign-off approval notification to ${requesterEmail}:`,
              notifyErr
            );
          }
        }
      } else {
        console.warn("Could not resolve QA engineer email for approved sign-off", s);
      }

      removeFromList(s.id);

      if (!teamsErr && selectedTeamId && selectedChannelId) {
        const pdf = getPdfUrl(s);
        const project = s.projectName || s.project || "—";

        const defaultRemarks = `QA sign-off approved for ${project}${s.version ? ` (v${s.version})` : ""}.`;
        const finalRemarks = (teamsRemarks || "").trim() || defaultRemarks;

        try {
          await sendSignOffTeamsMessage({
            teamId: selectedTeamId,
            channelId: selectedChannelId,
            project,
            version: s.version || "",
            completedBy: s.completedBy || "",
            dateChanged: s.dateChanged || "",
            signOffPdfLink: pdf || "",
            remarks: finalRemarks,
          });
          setToast("Sign-off approved and posted to Teams.");
        } catch (postErr) {
          console.error(postErr);
          setToast("Sign-off approved (Teams post failed).");
          setErr(postErr?.message || "Approved, but failed to post to Teams");
        }
      } else {
        setToast("Sign-off approved.");
      }

      closeApproveModal();
    } catch (e) {
      console.error(e);
      if (isUnauthorizedError(e)) return;
      setErr(e?.message || "Failed to approve sign-off");
    } finally {
      setActionId("");
      setActionType("");
    }
  };

  const confirmApproveAndPost = async () => {
    if (
      !confidenceLoading &&
      confidenceScore != null &&
      confidenceScore < 90
    ) {
      setLowConfidenceConfirmOpen(true);
      return;
    }

    await completeApproveAndPost();
  };

  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectId, setRejectId] = useState("");

  const rejectBusy = actionType === "reject" && actionId === rejectId;

  const openRejectModal = (id) => {
    setRejectId(id);
    setRejectRemarks("");
    setRejectModalOpen(true);
    setErr("");
  };

  const closeRejectModal = () => {
    setRejectModalOpen(false);
    setRejectId("");
    setRejectRemarks("");
  };

  const handleReject = async () => {
    if (!rejectId) return;

    const rejectedItem = items.find((item) => item?.id === rejectId);
    setActionId(rejectId);
    setActionType("reject");
    setErr("");

    try {
      await rejectSignoffById(rejectId, { note: rejectRemarks });

      const requesterEmail = findRequesterEmail(rejectedItem, qaUsers);
      const reviewerLabel = String(username || email || "QA Manager").trim();

      if (requesterEmail) {
        try {
          const projectLabel =
            rejectedItem?.projectName || rejectedItem?.project || "project";
          const versionLabel = String(rejectedItem?.version || "").trim();

          await createNotification({
            userId: requesterEmail,
            title: "QA Sign-off Rejected",
            message: `Your sign-off request for ${projectLabel}${versionLabel ? ` (${versionLabel})` : ""} was rejected by ${reviewerLabel}. Reason: ${rejectRemarks || "No reason provided"}.`,
            type: "QA_SIGNOFF_REJECTED",
            projectId: projectLabel,
            isRead: false,
          });
        } catch (notifyErr) {
          if (!isUnauthorizedError(notifyErr)) {
            console.warn(
              `Failed to send sign-off rejection notification to ${requesterEmail}:`,
              notifyErr
            );
          }
        }
      } else {
        console.warn("Could not resolve QA engineer email for rejected sign-off", rejectedItem);
      }

      removeFromList(rejectId);
      setToast("Sign-off rejected.");
      closeRejectModal();
    } catch (e) {
      console.error(e);
      if (isUnauthorizedError(e)) return;
      setErr(e?.message || "Failed to reject sign-off");
    } finally {
      setActionId("");
      setActionType("");
    }
  };

  if (loading) {
    return (
      <div className="m-4 bg-white rounded-2xl p-4 shadow-sm ring-1 ring-gray-100">
        Loading pending sign-offs...
      </div>
    );
  }

  if (err) {
    return (
      <div className="m-4 bg-red-50 text-red-700 rounded-2xl p-4 shadow-sm ring-1 ring-red-100">
        {err}
      </div>
    );
  }

  return (
    <div className="mt-4 mr-3 bg-white rounded-2xl p-4 shadow-sm ring-1 ring-gray-100 overflow-hidden">
      {toast ? (
        <div className="mb-3 rounded-xl bg-green-50 text-green-800 ring-1 ring-green-100 px-3 py-2 text-sm">
          {toast}
        </div>
      ) : null}

      {rejectModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeRejectModal}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-lg ring-1 ring-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <div className="text-lg font-semibold text-gray-800">Reject Sign-off</div>
              <p className="text-sm text-gray-600 mt-1">
                Are you sure you want to reject this sign-off request?
              </p>
            </div>
            <div className="px-4 pt-4">
              <label className="block text-xs text-gray-500 mb-1">Reason / Note</label>
              <textarea
                value={rejectRemarks}
                onChange={(e) => setRejectRemarks(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Add a reason for rejection..."
              />
            </div>
            <div className="p-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRejectModal}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejectBusy}
                className={`px-3 py-2 text-sm rounded-lg text-white ${rejectBusy
                  ? "bg-rose-300 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-700"
                  }`}
              >
                {rejectBusy ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approveModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeApproveModal}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-lg ring-1 ring-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <div className="text-lg font-semibold text-gray-800">Approve & Post to Teams</div>
              <div className="text-sm text-gray-500 mt-1">
                {approveItem?.projectName || approveItem?.project || "—"}
                {approveItem?.version ? ` • ${approveItem.version}` : ""}
              </div>
            </div>

            <p className={confidenceBannerClassName}>
              <span className="flex items-center gap-2">
                {showConfidenceWarningIcon ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 3 2.6 19.5A1 1 0 0 0 3.47 21h17.06a1 1 0 0 0 .87-1.5L12 3Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M12 9v4" strokeLinecap="round" />
                    <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                  </svg>
                ) : null}
                <span className="text-[14px]">
                  Disclaimer: The current build confidence score is{" "}
                  <span className="font-semibold">
                    {confidenceLoading
                      ? "loading..."
                      : confidenceScore != null
                        ? `${confidenceScore}%`
                        : "not available"}
                  </span>
                </span>
              </span>
            </p>

            <div className="p-4 space-y-3">
              {teamsErr ? (
                <div className="rounded-xl bg-amber-50 text-amber-800 ring-1 ring-amber-100 px-3 py-2 text-sm">
                  {teamsErr} (You can still approve without posting.)
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Team</label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    disabled={teamsLoading || !!teamsErr}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">{teamsLoading ? "Loading..." : "Select team"}</option>
                    {teams.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Channel</label>
                  <select
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                    disabled={teamsLoading || !!teamsErr || !selectedTeamId}
                    className="w-full px-3 py-2 border rounded-md text-sm bg-white"
                  >
                    <option value="">
                      {teamsLoading
                        ? "Loading..."
                        : !selectedTeamId
                          ? "Select team first"
                          : "Select channel"}
                    </option>
                    {channelsForSelectedTeam.map((c) => (
                      <option key={c.channelId} value={c.channelId}>
                        {c.channelName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Message (optional)</label>
                <textarea
                  value={teamsRemarks}
                  onChange={(e) => setTeamsRemarks(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="Add a short note for the channel..."
                />
              </div>

              <div className="text-xs text-gray-500">
                PDF:{" "}
                {getPdfUrl(approveItem) ? (
                  <a
                    href={getPdfUrl(approveItem)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Open
                  </a>
                ) : (
                  "—"
                )}
              </div>
            </div>

            <div className="p-4 border-t flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeApproveModal}
                className="px-3 py-2 text-sm border rounded-md bg-white hover:bg-gray-50"
                disabled={actionId && actionType === "approve"}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmApproveAndPost}
                className={`px-3 py-2 text-sm border rounded-md ${actionId && actionType === "approve"
                  ? "bg-gray-100 text-gray-400"
                  : "bg-white hover:bg-gray-50"
                  }`}
                disabled={actionId && actionType === "approve"}
              >
                {actionId && actionType === "approve" ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {lowConfidenceConfirmOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!(actionId && actionType === "approve")) {
              setLowConfidenceConfirmOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-lg ring-1 ring-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <div className="text-lg font-semibold text-gray-800">Confirm Approval</div>
              <p className="text-sm text-gray-600 mt-1">
                Confidence score is below 90%. Would you like to proceed?
              </p>
            </div>

            <div className="p-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLowConfidenceConfirmOpen(false)}
                disabled={actionId && actionType === "approve"}
                className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeApproveAndPost}
                disabled={actionId && actionType === "approve"}
                className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionId && actionType === "approve" ? "Approving..." : "Proceed"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Pending Sign-off Approvals</h3>
          <p className="text-sm text-gray-500">
            {filtered.length} pending request{filtered.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project / version / user"
            className="px-3 py-1.5 border rounded-md text-sm w-56"
          />

          <button
            type="button"
            onClick={refresh}
            className="px-3 py-1.5 text-sm border rounded-md bg-white hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-6 text-sm text-gray-500">No pending sign-offs found.</div>
      ) : (
        <>
          <div className="hidden md:block mt-4">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2">Project</th>
                  <th className="py-2">Version</th>
                  <th className="py-2">Completed By</th>
                  <th className="py-2">Request Date</th>
                  <th className="py-2">PDF</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((s) => {
                  const href = getPdfUrl(s);
                  const busy = actionId === s.id;

                  return (
                    <tr key={s.id} className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <div className="font-medium text-gray-800">
                          {s.projectName || s.project || "—"}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-1">ID: {s.id}</div>
                      </td>
                      <td className="py-3">{s.version || "—"}</td>
                      <td className="py-3">{s.completedBy || "—"}</td>
                      <td className="py-3">{formatDate(s.dateChanged)}</td>
                      

                      <td className="py-3">
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-blue-600 hover:underline"
                            title={href}
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(s)}
                            disabled={busy}
                            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${busy && actionType === "approve"
                              ? "bg-gray-100 text-gray-400 border-gray-200"
                              : "bg-green-100 text-green-700 border-green-200 hover:bg-green-200"
                              }`}
                          >
                            {busy && actionType === "approve" ? "Approving..." : "Approve"}
                          </button>

                          <button
                            type="button"
                            onClick={() => openRejectModal(s.id)}
                            disabled={busy}
                            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${busy && actionType === "reject"
                              ? "bg-gray-100 text-gray-400 border-gray-200"
                              : "bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                              }`}
                          >
                            {busy && actionType === "reject" ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden mt-4 space-y-3">
            {filtered.map((s) => {
              const href = getPdfUrl(s);
              const busy = actionId === s.id;

              return (
                <div key={s.id} className="p-4 rounded-xl border bg-gray-50">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-800">
                        {s.projectName || s.project || "—"}
                      </div>
                      <div className="text-xs text-gray-500">{s.version || "—"}</div>
                      <div className="text-[11px] text-gray-400 mt-1">ID: {s.id}</div>
                    </div>

                    {href && (
                      <a
                        className="text-sm text-blue-600 hover:underline"
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={href}
                      >
                        PDF
                      </a>
                    )}
                  </div>

                  <div className="mt-3 text-xs text-gray-600 space-y-1">
                    <div>
                      <span className="text-gray-500">Date:</span> {formatDate(s.dateChanged)}
                    </div>
                    <div>
                      <span className="text-gray-500">Completed By:</span>{" "}
                      {s.completedBy || "—"}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(s)}
                      disabled={busy}
                      className={`flex-1 px-3 py-2 rounded-md text-sm border ${busy && actionType === "approve"
                        ? "bg-gray-100 text-gray-400"
                        : "bg-white hover:bg-gray-50"
                        }`}
                    >
                      {busy && actionType === "approve" ? "Approving..." : "Approve"}
                    </button>

                    <button
                      type="button"
                      onClick={() => openRejectModal(s.id)}
                      disabled={busy}
                      className={`flex-1 px-3 py-2 rounded-md text-sm border ${busy && actionType === "reject"
                        ? "bg-gray-100 text-gray-400"
                        : "bg-white hover:bg-gray-50"
                        }`}
                    >
                      {busy && actionType === "reject" ? "Rejecting..." : "Reject"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
