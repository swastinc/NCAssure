import React, { useEffect, useMemo, useState } from "react";
import { assignQaEngineer, fetchAllFinalBuilds, updateBuild } from "../api/fetchBuildsApi";
import { createNotification } from "../api/notificationsApi";
import { getQAEngineersUsers } from "../api/userFromEmail";
import SignoffHistory from "./SignoffHistory"; // ✅ adjust path if needed
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";



/* --------------------------------------------------------
   Helpers
---------------------------------------------------------*/
function initials(name) {
  const value =
    typeof name === "string"
      ? name
      : typeof name === "object" && name !== null && typeof name.name === "string"
        ? name.name
        : "";

  if (!value || value.trim() === "- NA -") return "";

  return value
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatDate(value) {
  if (!value) return "-";

  let date;

  // If value looks like epoch seconds (10 digits or decimal)
  if (typeof value === "number") {
    date = new Date(value * 1000); // ✅ convert seconds → ms
  } else {
    date = new Date(value); // ISO / string fallback
  }

  if (isNaN(date.getTime())) return "Not Completed Yet";

  const pad2 = (n) => String(n).padStart(2, "0");
  const day = pad2(date.getDate());
  const month = date.toLocaleString("en-IN", { month: "short" });
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const minutes = pad2(date.getMinutes());
  const hours12 = hours24 % 12 || 12;
  const ampm = hours24 >= 12 ? "pm" : "am";

  return `${day} ${month} ${year}, ${hours12.toString().padStart(2, "0")}:${minutes} ${ampm}`;
}


function csvEscape(text = "") {
  return String(text).replace(/"/g, '""');
}

function renderTestStatus(status, completionDate) {
  const label = status || "—";
  const key = String(status || "").toLowerCase();

  const map = {
    "not started": "bg-gray-200 text-gray-800",
    "in progress": "bg-blue-100 text-blue-800",
    "on hold": "bg-orange-100 text-orange-800",
    completed: "bg-green-100 text-green-800",
  };

  const cls = map[key] || "bg-gray-100 text-gray-700";

  if (key === "completed" && completionDate) {
    return (
      <div className="inline-flex flex-col items-start">
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
        >
          {label}
        </span>
        <span className="mt-1 text-xs font-medium text-gray-900">
          ({formatDate(completionDate)})
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function renderApprovalStatus(status) {
  if (status === null) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border border-red-700 text-red-800 bg-red-100">
        Rejected
      </span>
    );
  }

  if (status === false) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border border-green-700 text-green-800 bg-green-100">
        Approved
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border border-amber-600 text-amber-800 bg-amber-100">
      Pending
    </span>
  );
}

function isCompletedTestingStatus(status) {
  return normalizeIdentity(status).replace(/[\s_-]+/g, "") === "completed";
}

function toOffsetDateTimeOrNull(value, fallbackToNow = false) {
  const raw = String(value || "").trim();

  if (!raw) {
    return fallbackToNow ? new Date().toISOString() : null;
  }

  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00.000Z`)
    : new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isRejectedBuild(build) {
  return build?.isPendingApproval === null;
}

function canEditBuild(build, role) {
  return ["ADMIN", "DEVMANAGER", "QAMANAGER"].includes(role) && !isRejectedBuild(build);
}

function exportToCSV(rows = [], filename = "build_history.csv") {
  if (!rows || !rows.length) return;
  const headers = [
    "Project ID",
    "Build Version",
    "Released By",
    "Date",
    "Tester",
    "Build Assign Date",
    "Dev Test Result URL",
    "Test Status",
    "Build Info",
    "Artifact URL",
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      [
        `"${csvEscape(r.id ?? "")}"`,
        `"${csvEscape(r.version ?? "")}"`,
        `"${csvEscape(r.releasedBy?.name ?? "")}"`,
        `"${csvEscape(formatDate(r.date ?? ""))}"`,
        `"${csvEscape(r.qaAssignee ?? "")}"`,
        `"${csvEscape(formatDate(r.testCompletionDate ?? ""))}"`,
        `"${csvEscape(r.devTestedResultUrl ?? "")}"`,
        `"${csvEscape(r.testingStatus ?? "")}"`,
        `"${csvEscape(r.notes ?? "")}"`,
        `"${csvEscape(r.artifactUrl ?? "")}"`,
      ].join(",")
    ),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------
   Normalize backend BuildDto → UI Release Object
---------------------------------------------------------*/
function normalizeItem(x) {
  if (!x || typeof x !== "object") return null;

  const email =
    x.qaAssignee ||
    x.qa_assignee ||
    x.qaAssigneeEmail ||
    x.testerEmail ||
    x.assignedToEmail ||
    (isEmailLike(x.tester) ? x.tester : "") ||
    (isEmailLike(x.assignedTo) ? x.assignedTo : "") ||
    "";
  const qaAssigneeName =
    x.qaAssigneeName ||
    x.qaAssigneeFullName ||
    x.testerName ||
    x.assignedToName ||
    (!isEmailLike(x.tester) ? x.tester : "") ||
    (!isEmailLike(x.assignedTo) ? x.assignedTo : "") ||
    (typeof email === "string" && email.includes("@") ? formatNameFromEmail(email) : email);

  const id =
    x.projectId ||
    (x.projectName && x.buildVersion
      ? `${x.projectName}-${x.buildVersion}`
      : fallbackId());

  return {
    // ---------- Identity ----------
    id,
    projectId: x.projectId || id,

    // ---------- Build Info ----------
    projectName: x.projectName || "—",
    buildName: x.builds || "—",
    version: x.buildVersion || "",
    buildType: x.buildType || "—",
    description: x.description || "-",
    testerHistory: x.testerHistory || x.tester_history || x.testerHistoryText || "-",
    // ---------- QA / Status ----------
    qaAssignee: qaAssigneeName || "- NA -",
    qaAssigneeEmail: email || "",
    testingStatus: x.testingStatus || "Not Started",
    testPriority: x.testPriority || "—",
    testCompletionDate: x.testCompletionDate || "- NA -",
    devTestedResultUrl: x.devTestedResultUrl || x.devTestResultUrl || "- NA -",
    buildAssignDate: x.buildAssignDate || null,
    // ---------- Release Info ----------
    releasedBy:
      typeof x.releasedBy === "object" && x.releasedBy !== null
        ? {
          name: x.releasedBy.name || x.releasedBy.fullName || x.releasedBy.email || "—",
          email: x.releasedBy.email || "",
        }
        : {
          name: x.releasedBy || "—",
          email: x.email || "",
        },
    approvedBy: x.approvedBy || "—",

    // ---------- Dates ----------
    date: x.uploadTime || null,          // release/upload date
    uploadTime: x.uploadTime || null,

    // ---------- Links ----------
    artifactUrl: x.buildUrl || "",
    releaseNoteUrl: x.releaseNoteUrl || "",

    // ---------- Meta ----------
    notes: x.notes || "",
    isPendingApproval:
      x.isPendingApproval === null
        ? null
        : x.isPendingApproval === false
          ? false
          : Boolean(x.isPendingApproval),
    pendingApproval:
      x.pendingApproval === null
        ? null
        : x.pendingApproval === false
          ? false
          : Boolean(x.pendingApproval),

    // ---------- Optional / Future ----------
    commit: null,
  };
}


function fallbackId() {
  try {
    return `REL-${crypto.randomUUID()}`;
  } catch {
    return `REL-${Math.random().toString(36).slice(2)}`;
  }
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function isValidHttpUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return true;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
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

function isPlaceholderAssignee(value) {
  const normalized = normalizeIdentity(value).replace(/\s*-\s*/g, "-");
  return !normalized || normalized === "-na-" || normalized === "na" || normalized === "-";
}

// Convert emails like "jane.doe@example.com" -> "Jane Doe"
function formatNameFromEmail(email = "") {
  const user = String(email).split("@")[0] || "";
  if (!user) return email;
  return user
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}
function EmptyState({ title, subtitle }) {
  return (
    <div className="py-14 text-center">
      <div className="text-base font-semibold text-gray-800">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-gray-500">{subtitle}</div> : null}
    </div>
  );
}

const formatDisplayDate = (value) => {
  if (!value) return "-";

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();

  return `${month}/${day}/${year}`;
};


function EditBuildModal({
  open,
  data,
  draft,
  qaEngineerOptions = [],
  setDraft,
  onClose,
  editSaving,
  editError,
  submitEdit,
  role,
}) {
  if (!open || !data) return null;

  const BUILD_TYPES = [
    { value: "WEB_APP", label: "Web App" },
    { value: "MOBILE_APP", label: "Mobile App" },
    { value: "SCRIPTS", label: "Scripts" },
    { value: "SERVICES", label: "Services" },
    { value: "AUTOMATED_FLOW", label: "Automated Flow" },
    { value: "DOCUMENTS", label: "Documents" },
    { value: "APIS", label: "APIs" },
    { value: "AI_MODEL", label: "AI Model" },
    { value: "AI_AGENT", label: "AI Agent" },
  ];

  const TEST_PRIORITIES = ["High", "Medium", "Low"];
  const TESTING_STATUSES = ["Not Started", "In Progress", "On Hold", "Completed"];
  const CHAR_LIMIT = 500;

  const qaOptions = useMemo(() => {
    const currentEmail = String(draft?.qaAssigneeEmail ?? "").trim();
    const currentName = String(draft?.qaAssignee ?? "").trim();
    const currentValue = currentEmail || currentName;
    const currentIdentity = normalizeIdentity(currentEmail || currentName);

    if (!currentValue || isPlaceholderAssignee(currentValue)) {
      return qaEngineerOptions;
    }

    const exists = qaEngineerOptions.some((opt) => {
      const optionValue = String(opt?.value || "").trim();
      const optionName = String(opt?.qaName || opt?.label || "").trim();
      return (
        optionValue.toLowerCase() === currentValue.toLowerCase() ||
        normalizeIdentity(optionValue) === currentIdentity ||
        normalizeIdentity(optionName) === currentIdentity
      );
    });

    if (exists) return qaEngineerOptions;

    return [
      {
        value: currentValue,
        label:
          currentName &&
            currentEmail &&
            currentName.toLowerCase() !== currentEmail.toLowerCase()
            ? `${currentName} (${currentEmail})`
            : currentName || currentEmail,
        qaName: currentName || formatNameFromEmail(currentEmail),
        qaEmail: currentEmail,
      },
      ...qaEngineerOptions,
    ];
  }, [draft?.qaAssignee, draft?.qaAssigneeEmail, qaEngineerOptions]);

  const selectedQaValue = useMemo(() => {
    const currentEmail = String(draft?.qaAssigneeEmail ?? "").trim();
    const currentName = String(draft?.qaAssignee ?? "").trim();
    const currentIdentity = normalizeIdentity(currentEmail || currentName);

    if (!currentIdentity || isPlaceholderAssignee(currentEmail || currentName)) {
      return "";
    }

    const matched = qaOptions.find((opt) => {
      const optionValue = String(opt?.value || "").trim();
      const optionEmail = String(opt?.qaEmail || "").trim();
      const optionName = String(opt?.qaName || opt?.label || "").trim();

      return (
        normalizeIdentity(optionValue) === currentIdentity ||
        normalizeIdentity(optionEmail) === currentIdentity ||
        normalizeIdentity(optionName) === currentIdentity
      );
    });

    return matched?.value || currentEmail || currentName;
  }, [draft?.qaAssignee, draft?.qaAssigneeEmail, qaOptions]);

  const isDevManager = role === "DEVMANAGER";
  const isQaManager = role === "QAMANAGER";
  const isAdmin = role === "ADMIN";

  const canEdit = {
    projectName: false,
    buildVersion: isDevManager || isAdmin,
    builds: isDevManager || isAdmin,
    buildType: isDevManager || isAdmin,
    testPriority: isDevManager || isQaManager || isAdmin,
    qaAssignee: isQaManager || isAdmin,
    testingStatus: isQaManager,
    buildUrl: isDevManager || isAdmin,
    releaseNoteUrl: isDevManager || isAdmin,
    description: isDevManager || isAdmin,
  };

  const canView = {
    projectName: isDevManager || isQaManager || isAdmin,
    buildVersion: isDevManager || isQaManager || isAdmin,
    builds: isDevManager || isQaManager || isAdmin,
    buildType: isDevManager || isQaManager || isAdmin,
    testPriority: isDevManager || isQaManager || isAdmin,
    qaAssignee: isQaManager || isAdmin,
    testingStatus: isQaManager || isAdmin,
    buildUrl: isDevManager || isQaManager || isAdmin,
    releaseNoteUrl: isDevManager || isQaManager || isAdmin,
    description: isDevManager || isQaManager || isAdmin,
  };

  const updateField = (name, value) => {
    if (!canEdit[name]) return;

    setDraft((prev) => ({
      ...(prev || {}),
      [name]: value,
    }));
  };

  const renderInput = (label, name, type = "text", extraProps = {}) => {
    if (!canView[name]) return null;

    return (
      <div>
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <input
          type={type}
          value={draft?.[name] ?? ""}
          onChange={(e) => updateField(name, e.target.value)}
          disabled={extraProps.disabled ?? !canEdit[name]}
          className={`mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 ${(extraProps.disabled ?? !canEdit[name]) ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
            }`}
          {...extraProps}
        />
      </div>
    );
  };

  const renderSelect = (label, name, options, extraProps = {}) => {
    if (!canView[name]) return null;

    return (
      <div>
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <select
          value={draft?.[name] ?? ""}
          onChange={(e) => updateField(name, e.target.value)}
          disabled={extraProps.disabled ?? !canEdit[name]}
          className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 ${(extraProps.disabled ?? !canEdit[name]) ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
            }`}
          {...extraProps}
        >
          <option value="">- Select -</option>
          {options.map((opt) =>
            typeof opt === "string" ? (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ) : (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            )
          )}
        </select>
      </div>
    );
  };

  const handleQaAssigneeChange = (value) => {
    if (!canEdit.qaAssignee) return;

    const selected = qaOptions.find((opt) => String(opt?.value || "") === String(value || ""));
    const nextEmail = selected?.qaEmail || (isEmailLike(value) ? value : "");
    const currentEmail = String(draft?.qaAssigneeEmail || "").trim().toLowerCase();
    const nextEmailKey = String(nextEmail || "").trim().toLowerCase();
    const assigneeChanged = nextEmailKey && nextEmailKey !== currentEmail;

    setDraft((prev) => ({
      ...(prev || {}),
      qaAssignee: selected?.qaName || selected?.label || "",
      qaAssigneeEmail: nextEmail,
      buildAssignDate: assigneeChanged
        ? new Date().toISOString()
        : prev?.buildAssignDate || null,
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4 py-8 md:py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[calc(100vh-5rem)] overflow-y-auto bg-white rounded-xl shadow-xl border p-5 md:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Edit Build</h3>
            <p className="text-sm text-gray-500">
              Update build details and save changes.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={editSaving}
            className="px-4 py-2 text-sm border cursor-pointer rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {editError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 mb-4">
            <p className="text-sm font-medium text-red-800">{editError}</p>
            <p className="text-xs text-red-700 mt-0.5">
              Please fix the issue and try again.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderInput("Project", "projectName", "text", { disabled: true })}
          {renderInput("Version", "buildVersion", "text")}
          {renderInput("Build Name", "builds")}
          {renderSelect("Build Type", "buildType", BUILD_TYPES)}

          {canView.qaAssignee && (
            <div>
              <label className="text-sm font-medium text-gray-700">QA Assignee</label>
              <select
                value={selectedQaValue}
                onChange={(e) => handleQaAssigneeChange(e.target.value)}
                disabled={!canEdit.qaAssignee}
                className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 ${!canEdit.qaAssignee ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
                  }`}
              >
                <option value="">- Select -</option>
                {qaOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {renderSelect("Testing Status", "testingStatus", TESTING_STATUSES)}
          {renderSelect("Test Priority", "testPriority", TEST_PRIORITIES)}
          {renderInput("Build URL", "buildUrl")}
          {renderInput("Release Note URL", "releaseNoteUrl")}
        </div>

        {canView.description && (
          <div className="mt-4">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={draft?.description ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              rows={4}
              maxLength={CHAR_LIMIT}
              placeholder="Enter build notes or description"
              disabled={!canEdit.description}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 ${!canEdit.description ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""
                }`}
            />
            <div className="text-xs text-gray-500 text-right mt-1">
              {(draft?.description ?? "").length}/{CHAR_LIMIT}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={editSaving}
            className="px-4 py-2 text-sm border cursor-pointer rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={submitEdit}
            disabled={editSaving}
            className="px-4 py-2 text-sm rounded-md cursor-pointer bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {editSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
/* --------------------------------------------------------
   MAIN COMPONENT
---------------------------------------------------------*/
export default function BuildHistory() {
  // ✅ SIMPLE toggle: "builds" | "signoffs"
  const [view, setView] = useState("builds");

  const { email, username, role, isAuthenticated } = useSelector(
    (state) => state.auth
  );
  // ✅ Build history state (hooks must ALWAYS run)
  const [backendBuilds, setBackendBuilds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ✅ UI state for builds
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [success, setSuccess] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [qaEngineerOptions, setQaEngineerOptions] = useState([]);

  const PAGE_SIZE = 10;
  const EDIT_SAVE_TIMEOUT_MS = 30000;

  // ✅ Load builds ONLY when view === "builds"
  useEffect(() => {
    if (view !== "builds") return;

    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const data = await fetchAllFinalBuilds();
         if (!alive) return;
        setBackendBuilds(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (!alive) return;
        if (isUnauthorizedError(e)) return;
        setErr("Failed to load approved builds");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [view]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const users = await getQAEngineersUsers();
        if (!alive) return;

        const optionMap = new Map();

        for (const user of Array.isArray(users) ? users : []) {
          const emailValue = String(user?.email || "").trim();
          const nameValue = String(user?.name || user?.username || user?.email || "").trim();

          if (!nameValue || !isEmailLike(emailValue)) continue;

          const identityKey = normalizeIdentity(nameValue);
          if (!identityKey || optionMap.has(identityKey)) continue;

          optionMap.set(identityKey, {
            value: emailValue,
            label: `${nameValue} (${emailValue})`,
            qaName: nameValue,
            qaEmail: emailValue,
          });
        }

        const options = Array.from(optionMap.values());

        setQaEngineerOptions(options);
      } catch (e) {
        console.error("Failed to load QA engineers", e);
        if (!alive) return;
        setQaEngineerOptions([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Normalize backend data
  const base = useMemo(() => backendBuilds.map(normalizeItem).filter(Boolean), [backendBuilds]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = [...base];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.version && r.version.toLowerCase().includes(q)) ||
          (r.releasedBy?.name && r.releasedBy.name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortDir === "desc" ? db - da : da - db;
    });

    return list;
  }, [base, search, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toDateInput = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
  };

  const formatDisplayDate = (value) => {
    if (!value) return "-";

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
  };

  const withSaveTimeout = (promise) =>
    new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        const error = new Error("Build update is taking too long. Please try again.");
        error.name = "AbortError";
        reject(error);
      }, EDIT_SAVE_TIMEOUT_MS);

      Promise.resolve(promise)
        .then(resolve, reject)
        .finally(() => window.clearTimeout(timeout));
    });

  const startEdit = (build) => {
    if (!canEditBuild(build, role)) return;

    // var date = build.testCompletionDate;
    const existingQaName =
      build.qaAssignee ??
      build.tester ??
      build.assignedTo ??
      "";
    const existingQaEmail =
      build.qaAssigneeEmail ??
      build.testerEmail ??
      build.assignedToEmail ??
      (isEmailLike(existingQaName) ? existingQaName : "");

    const draft = {
      projectId: build.projectId,
      projectName: build.projectName,
      buildVersion: build.buildVersion ?? build.version ?? "",
      builds: build.builds ?? build.buildName ?? "",
      buildType: build.buildType ?? "",
      qaAssignee: isEmailLike(existingQaName) ? "" : existingQaName,
      qaAssigneeEmail: existingQaEmail,
      testingStatus: build.testingStatus ?? "",
      testPriority: build.testPriority ?? "",
      testCompletionDate: toDateInput(build.testCompletionDate),
      devTestedResultUrl: build.devTestedResultUrl ?? "",
      buildAssignDate: build.buildAssignDate ?? null,
      buildUrl: build.buildUrl ?? build.artifactUrl ?? "",
      releaseNoteUrl: build.releaseNoteUrl ?? "",
      description: build.description ?? "",
    };

    setEditData(draft);
    setEditDraft(draft);
    setSuccess("");
    setEditError("");
    setEditOpen(true);
  };

  const submitEdit = async () => {
  if (!editData) return;

  const current = editDraft || {};
  const projectPath = current.projectId;

  if (!projectPath) {
    setEditError("Missing projectId for update");
    return;
  }

  if (!isValidHttpUrl(current.buildUrl)) {
    setEditError("Build URL must be a valid http/https URL.");
    return;
  }

  if (!isValidHttpUrl(current.releaseNoteUrl)) {
    setEditError("Release Note URL must be a valid http/https URL.");
    return;
  }

  const canUpdateTestingStatus = role === "QAMANAGER" || role === "ADMIN";
  const nextTestingStatus = String(current.testingStatus || "").trim();
  const nextTestCompletionDate = isCompletedTestingStatus(nextTestingStatus)
    ? toOffsetDateTimeOrNull(current.testCompletionDate, true)
    : null;


  setEditSaving(true);
  setEditError("");

  const saveController = new AbortController();
  const saveTimeout = window.setTimeout(
    () => saveController.abort(),
    EDIT_SAVE_TIMEOUT_MS
  );

  try {
    const payload = {
      projectId: current.projectId,
      builds: current.builds,
      buildVersion: current.buildVersion,
      buildType: current.buildType,
      qaAssignee: String(current.qaAssignee || "").trim(),
      qaAssigneeEmail: String(current.qaAssigneeEmail || "").trim(),
      testingStatus: nextTestingStatus,
      testPriority: current.testPriority,
      testCompletionDate: nextTestCompletionDate,
      devTestedResultUrl: String(current.devTestedResultUrl || "").trim(),
      buildAssignDate: current.buildAssignDate,
      buildUrl: String(current.buildUrl || "").trim(),
      releaseNoteUrl: String(current.releaseNoteUrl || "").trim(),
      description: current.description,
    };

    if (!canUpdateTestingStatus) {
      delete payload.testingStatus;
    }

    const previousQaEmail = String(editData?.qaAssigneeEmail || "")
      .trim()
      .toLowerCase();

    const nextQaEmail = String(payload.qaAssigneeEmail || "")
      .trim()
      .toLowerCase();

    const qaAssigneeChanged = nextQaEmail && nextQaEmail !== previousQaEmail;

    let updated;

    if (qaAssigneeChanged) {
      updated = await withSaveTimeout(
        assignQaEngineer(projectPath, payload.qaAssigneeEmail, {
          signal: saveController.signal,
        })
      );

      createNotification({
        userId: payload.qaAssigneeEmail,
        title: `QA Assignment for ${payload.projectId}`,
        message: `Build ${payload.projectId}${
          payload.buildVersion ? ` (${payload.buildVersion})` : ""
        } is assigned to you for testing.`,
        type: "QA_ASSIGNMENT",
        projectId: payload.projectId,
        isRead: false,
      }).catch((notifyErr) => {
        if (!isUnauthorizedError(notifyErr)) {
          console.warn(
            `Failed to send QA assignment notification to ${payload.qaAssigneeEmail}:`,
            notifyErr
          );
        }
      });
    } else {
      updated = await withSaveTimeout(
        updateBuild(projectPath, payload, {
          signal: saveController.signal,
        })
      );
    }

    setBackendBuilds((prev) =>
      prev.map((b) =>
        b.projectId === projectPath
          ? {
              ...b,
              ...payload,
              ...(updated || {}),
            }
          : b
      )
    );

    setSuccess("Build updated successfully.");
    setEditOpen(false);
    setEditData(null);
  } catch (err) {
    console.error("Build update failed:", err);

    if (isUnauthorizedError(err)) return;

    const message =
      err?.name === "AbortError"
        ? "Build update is taking too long. Please try again."
        : err?.message || "Failed to update build";

    setEditError(message);
  } finally {
    window.clearTimeout(saveTimeout);
    setEditSaving(false);
  }
};


  function BuildDetailsModal({ open, build, onClose }) {
    const closeBtnRef = React.useRef(null);

    React.useEffect(() => {
      if (!open) return;

      const onKeyDown = (e) => {
        if (e.key === "Escape") onClose?.();
      };

      document.addEventListener("keydown", onKeyDown);
      setTimeout(() => closeBtnRef.current?.focus(), 0);

      return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, onClose]);

    if (!open || !build) return null;

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
            <Field label="Description">{build.description}</Field>

            {/* ✅ hyperlinks */}
            <Field label="Build URL">
              <Link href={build.buildUrl} text="View Build" />
            </Field>

            <Field label="Release Notes URL">
              <Link href={build.releaseNoteUrl} text="View Release Note" />
            </Field>

            {/* <Field label="Commit SHA">{build.commit?.sha}</Field> */}
          </div>
        </div>
      </div>
    );
  }

  function EmptyState({ title, subtitle }) {
    return (
      <div className="py-14 text-center">
        <div className="text-base font-semibold text-gray-800">
          {title || "No builds"}
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm text-gray-500">
            {subtitle || "No build history found for the selected filters."}
          </div>
        ) : null}
      </div>
    );
  }


  return (
    <>
      <div className="m-4">
        {/* ✅ Simple header + toggle (no extra component) */}
        <div className=" bg-white rounded-2xl p-4 shadow-sm overflow-hidden ring-1 ring-gray-100 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">History</h3>
              <p className="text-sm text-gray-500">Build History and Sign-off History</p>
            </div>

            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setView("builds")}
                className={classNames(
                  "px-3 py-1.5 text-sm rounded-lg transition",
                  view === "builds"
                    ? "bg-blue-100 shadow-sm text-gray-900 border cursor-pointer border-gray-800"
                    : "text-gray-600 hover:text-gray-900 cursor-pointer"
                )}
              >
                Build History
              </button>

              <button
                type="button"
                onClick={() => setView("signoffs")}
                className={classNames(
                  "px-3 py-1.5 text-sm rounded-lg transition",
                  view === "signoffs"
                    ? "bg-blue-100 text-gray-900 border border-gray-800 cursor-pointer"
                    : "text-gray-600 hover:text-gray-900 cursor-pointer"
                )}
              >
                Sign-off History
              </button>
            </div>
          </div>
        </div>

        {view === "signoffs" ? (
          <SignoffHistory />
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm overflow-hidden ring-1 ring-gray-100">
            {/* Build header actions */}
            <div className="flex flex-col items-center justify-between px-4 py-3 border-b sm:flex-row gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Build History & Releases</h3>
                <p className="text-sm text-gray-500">All builds</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  aria-label="Search releases"
                  title="Search by Project Name, Build Name, Version, or Released By"
                  placeholder="Project/Build/Version..."
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="px-3 py-1 border rounded-md text-sm w-44"
                />
                

                <button
                  type="button"
                  onClick={() => setSortDir((s) => (s === "desc" ? "asc" : "desc"))}
                  title="Toggle sort by date"
                  className="px-3 py-1 text-sm border rounded-md cursor-pointer"
                >
                  Sort: {sortDir === "desc" ? "Newest" : "Oldest"}
                </button>


              </div>
            </div>

            {success && (
              <div className="mb-3 flex items-center justify-between px-4 py-2 rounded-md bg-emerald-50 text-emerald-700 text-sm">
                <span>{success}</span>
                <button
                  type="button"
                  onClick={() => setSuccess("")}
                  className="ml-3 flex h-5 w-5 items-center justify-center rounded hover:bg-emerald-100"
                  aria-label="Close success message"
                >
                  ×
                </button>
              </div>
            )}

            {/* Loading / Error / Empty / Content */}
            {loading ? (
              <div className="p-4">Loading approved builds...</div>
            ) : err ? (
              <div className="p-4 bg-red-100 text-red-600 rounded-lg">{err}</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No build available"
                subtitle="No approved builds found for the selected filters."
              />
            ) : (
              <>
                {/* TABLE (desktop) */}
                <div className="hidden md:block w-full max-w-full min-w-0 overflow-x-auto">
                  <table className="w-full min-w-[900px] table-auto text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="py-2">Project / Build / Version</th>
                        <th className="py-2">Build Status</th>
                        <th className="py-2">Released By</th>
                        <th className="py-2">Release Date</th>
                        <th className="py-2">Tester</th>
                        <th className="py-2">Test Status</th>
                        <th className="py-2">QA Assign Date</th>
                        <th className="py-2">Artifact</th>
                        <th className="py-2">Build-Info</th>
                        {(role === "ADMIN" || role === "DEVMANAGER" || role === "QAMANAGER") && (
                          <th className="py-2 text-right">Edit</th>)}

                      </tr>
                    </thead>

                    <tbody>
                      {paged.map((r) => (
                        <React.Fragment key={r.id}>
                          <tr className="border-b hover:bg-gray-50">
                            <td className="py-3">
                              <div className="font-medium text-gray-800">{r.projectName}</div>
                              <div className="font-small text-gray-800">{r.buildName}</div>
                              <div className="text-xs text-gray-500">{r.version}</div>
                            </td>
                            <td className="py-3">
                              {renderApprovalStatus(r.isPendingApproval)}

                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-gray-100 grid place-items-center text-xs font-medium text-gray-700">
                                  {initials(r.releasedBy?.name)}
                                </div>
                                <div>
                                  <div className="font-medium text-gray-700">
                                    {r.releasedBy?.name || "—"}
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3">{formatDate(r.date)}</td>
                            <td className="py-3">
                              <div className="flex items-center gap-2">
                                {r.qaAssignee && r.qaAssignee !== "- NA -" && (
                                  <div className="h-8 w-8 rounded-full bg-gray-100 grid place-items-center text-xs font-medium text-gray-700">
                                    {initials(r.qaAssignee)}
                                  </div>
                                )}

                                <div>
                                  <div className="font-medium text-gray-700">
                                    {r.qaAssignee === "-NA-" ? "—" : r.qaAssignee || "—"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3">
                              {renderTestStatus(r.testingStatus)}
                            </td>
                            <td className="py-3"> {r.buildAssignDate ? formatDate(r.buildAssignDate) : "Not Assigned Yet"}</td>
                            <td className="py-3">
                              {r.artifactUrl ? (
                                <a
                                  className="text-sm text-blue-600 hover:underline"
                                  href={r.artifactUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Download
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>

                            <td className="py-3">

                              <button
                                type="button"
                                className="text-sm px-3 py-1.5 rounded-full cursor-pointer border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 active:translate-y-[1px] transition"
                                onClick={() => setExpandedId((e) => (e === r.id ? null : r.id))}
                              >
                                {expandedId === r.id ? "Hide" : "Details"}
                              </button>
                            </td>

                            {["ADMIN", "DEVMANAGER", "QAMANAGER"].includes(role) && (
                              <td className="py-3 text-right">
                                {canEditBuild(r, role) && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(r)}
                                  className="inline-flex items-center gap-1 px-2 cursor-pointer py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50"
                                  title="Edit build"
                                >
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.62 9.62-3.712.53.53-3.712 9.62-9.62Z"
                                    />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-2-2" />
                                  </svg>
                                  Edit
                                </button>
                                )}
                              </td>
                            )}


                          </tr>

                          {expandedId === r.id && (
                            <tr className="bg-gray-50">
                              <td colSpan={["ADMIN", "DEVMANAGER", "QAMANAGER"].includes(role) ? 10 : 9} className="p-4 text-sm text-gray-700">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <div className="font-semibold mb-1">Description</div>
                                    <div className="text-xs text-gray-600">{r.description || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Test Priority</div>
                                    <div className="text-xs text-gray-600">{r.testPriority || "—"}</div>
                                  </div>

                                  <div>
                                    <div className="font-semibold mb-1">Tester History</div>
                                    <div className="text-xs text-gray-600 whitespace-pre-wrap break-words">{r.testerHistory || "-"}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Build Type</div>
                                    <div className="text-xs text-gray-600">{r.buildType || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Reason</div>
                                    <div className="text-xs text-gray-600">{r.notes || "—"}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Test Completion Date</div>
                                    <div className="text-xs text-gray-600">{formatDate(r.testCompletionDate)}</div>
                                  </div>
                                  <div>
                                    <div className="font-semibold mb-1">Dev Test Result URL</div>
                                    <div className="text-xs text-gray-600">
                                      {r.devTestedResultUrl &&
                                        r.devTestedResultUrl !== "- NA -" ? (
                                        <a
                                          href={r.devTestedResultUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline break-all"
                                        >
                                          View Result
                                        </a>
                                      ) : (
                                        "—"
                                      )}
                                    </div>
                                  </div>
                                  <div />
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-4 md:hidden">
                  {paged.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 break-words">
                            {r.projectName}
                          </div>
                          <div className="mt-1 text-sm text-gray-700 break-words">
                            {r.buildName}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Version: {r.version || "—"}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {renderApprovalStatus(r.isPendingApproval)}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Released By
                          </div>
                          <div className="mt-1 font-medium text-gray-800">
                            {r.releasedBy?.name || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Release Date
                          </div>
                          <div className="mt-1 text-gray-800">{formatDate(r.date)}</div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Tester
                          </div>
                          <div className="mt-1 text-gray-800">
                            {r.qaAssignee === "-NA-" ? "—" : r.qaAssignee || "—"}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Test Status
                          </div>
                          <div className="mt-1">{renderTestStatus(r.testingStatus)}</div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Build Assign Date
                          </div>
                          <div className="mt-1 text-gray-800">
                            {formatDate(r.buildAssignDate)}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-gray-500">
                            Artifact
                          </div>
                          <div className="mt-1">
                            {r.artifactUrl ? (
                              <a
                                className="text-sm text-blue-600 hover:underline break-all"
                                href={r.artifactUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-sm px-3 py-1.5 rounded-full cursor-pointer border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 active:translate-y-[1px] transition"
                          onClick={() => setExpandedId((e) => (e === r.id ? null : r.id))}
                        >
                          {expandedId === r.id ? "Hide Details" : "Details"}
                        </button>

                        {canEditBuild(r, role) && (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50"
                            title="Edit build"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.62 9.62-3.712.53.53-3.712 9.62-9.62Z"
                              />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-2-2" />
                            </svg>
                            Edit
                          </button>
                        )}
                      </div>

                      {expandedId === r.id && (
                        <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                          <div className="grid grid-cols-1 gap-3">
                            <div>
                              <div className="font-semibold mb-1">Description</div>
                              <div className="text-xs text-gray-600">{r.description || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Test Priority</div>
                              <div className="text-xs text-gray-600">{r.testPriority || "—"}</div>
                            </div>

                            <div>
                              <div className="font-semibold mb-1">Tester History</div>
                              <div className="text-xs text-gray-600 whitespace-pre-wrap break-words">{r.testerHistory || "-"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Build Type</div>
                              <div className="text-xs text-gray-600">{r.buildType || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Reason</div>
                              <div className="text-xs text-gray-600">{r.notes || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Test Completion Date</div>
                              <div className="text-xs text-gray-600">{formatDate(r.testCompletionDate)}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Dev Test Result URL</div>
                              <div className="text-xs text-gray-600">
                                {r.devTestedResultUrl &&
                                  r.devTestedResultUrl !== "- NA -" ? (
                                  <a
                                    href={r.devTestedResultUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline break-all"
                                  >
                                    View Result
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Pagination (only when results exist) */}
                <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-600">
                  <div className="text-center">
                    Showing{" "}
                    <span className="font-medium text-gray-800">
                      {(page - 1) * PAGE_SIZE + 1}
                    </span>
                    {" - "}
                    <span className="font-medium text-gray-800">
                      {Math.min(filtered.length, page * PAGE_SIZE)}
                    </span>{" "}
                    of <span className="font-medium text-gray-800">{filtered.length}</span> results
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="px-2 py-1 border rounded disabled:opacity-50"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Prev
                    </button>
                    <div className="px-3 py-1 border rounded">{page}</div>
                    <button
                      type="button"
                      className="px-2 py-1 border rounded disabled:opacity-50"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {(role === "ADMIN" || role === "DEVMANAGER" || role === "QAMANAGER") && (
        <EditBuildModal
          open={editOpen}
          data={editData}
          draft={editDraft}
          qaEngineerOptions={qaEngineerOptions}
          setDraft={setEditDraft}
          editSaving={editSaving}
          editError={editError}
          submitEdit={submitEdit}
          role={role}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
