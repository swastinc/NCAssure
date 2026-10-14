// SignoffHistory.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getAllSignoffs, updateSignoff } from "../api/signoffApi";
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";


function formatDateAny(value) {
  if (!value) return "—";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch { }
  return String(value);
}

function isHttpUrl(v) {
  const s = String(v ?? "").trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isRejectedSignoff(signoff) {
  return signoff?.isApproved === false;
}

function canEditSignoff(signoff, role) {
  return ["ADMIN", "QAMANAGER"].includes(role) && !isRejectedSignoff(signoff);
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeSignoff(x) {
  if (!x || typeof x !== "object") return null;
  const automatedTestCount =
    numOrNull(
      x.automatedTestCount ??
        x.automationTestCases ??
        x.automationTestCasesCount ??
        x.automationTests
    ) ?? 0;

  const automationCoverage =
    numOrNull(
      x.automationCoverage ??
        x.automationCoveragePercent ??
        x.automationCoveragePct ??
        x.automationCoveragePercentage
    ) ?? 0;

  const totalDesignTestCases =
    numOrNull(
      x.totalDesignTestCases ??
        x.totalDesignTestCase ??
        x.totalDesignedTestCases ??
        x.designTestCasesTotal
    ) ?? 0;

  const totalPass =
    numOrNull(x.totalPass ?? x.totalPassed ?? x.passedTestCases ?? x.passCount) ?? 0;

  const totalFail =
    numOrNull(x.totalFail ?? x.totalFailed ?? x.failedTestCases ?? x.failCount) ?? 0;

  return {
    id: x.id || "",
    projectName: x.projectName || x.project || "",
    project: x.project || x.projectName || "",
    buildName: x.buildName || "",
    version: x.version || "",
    dateChanged: x.dateChanged || "",
    completedBy: x.completedBy || "",
    approvedBy: x.approvedBy || "",
    description: x.description || "",
    reason: x.reason || "",
    testEnvironment: x.testEnvironment || "",
    risksAssumptions: x.risksAssumptions || "",
    conclusion: x.conclusion || "",
    isApproved: typeof x.isApproved === "boolean" ? x.isApproved : null,
    automatedTestCount,
    automationCoverage,
    totalDesignTestCases,
    totalPass,
    totalFail,
    pdfPath: x.pdfPath || x.signOffPdfLink || "",
    createdAt: x.createdAt || "",
  };
}

// helpers: pick timestamps safely
function ts(v) {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}
function latestChangeTs(r) {
  // "latest change" = dateChanged if present else createdAt
  return ts(r.dateChanged) || ts(r.createdAt) || 0;
}
function createdAtTs(r) {
  return ts(r.createdAt) || 0;
}

// ✅ Empty state component
function EmptyState({ title, subtitle }) {
  return (
    <div className="py-14 text-center">
      <div className="text-base font-semibold text-gray-800">{title}</div>
      {subtitle ? <div className="mt-1 text-sm text-gray-500">{subtitle}</div> : null}
    </div>
  );
}

function EditSignoffModal({ open, draft, setDraft, onClose, onSave, saving, error }) {
  if (!open) return null;

  const updateField = (name, value) => {
    setDraft((prev) => ({ ...(prev || {}), [name]: value }));
  };

  const pdfLinkValue = String(draft?.signOffPdfLink ?? "").trim();
  const pdfLinkError =
    pdfLinkValue && !isHttpUrl(pdfLinkValue)
      ? "Enter a valid http:// or https:// link."
      : "";

  const approvalValue =
    draft?.approved === ""
      ? ""
      : draft?.approved === true
        ? "true"
        : draft?.approved === false
          ? "false"
          : "";

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl shadow-xl border p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Edit Sign-off</h3>
            <p className="text-sm text-gray-500">Only editable fields are shown</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 cursor-pointer hover:text-gray-800"
            aria-label="Close"
          >
            x
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              rows={2}
              value={draft?.description ?? ""}
              onChange={(e) => updateField("description", e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Reason</label>
            <textarea
              rows={2}
              value={draft?.reason ?? ""}
              onChange={(e) => updateField("reason", e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Test Environment</label>
            <textarea
              rows={2}
              value={draft?.testEnvironment ?? ""}
              onChange={(e) => updateField("testEnvironment", e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Risks &amp; Assumptions</label>
            <textarea
              rows={2}
              value={draft?.risksAssumptions ?? ""}
              onChange={(e) => updateField("risksAssumptions", e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Conclusion</label>
            <textarea
              rows={2}
              value={draft?.conclusion ?? ""}
              onChange={(e) => updateField("conclusion", e.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Total Design Test Case</label>
            <input
              type="text"
              value={draft?.totalDesignTestCases ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) updateField("totalDesignTestCases", v);
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Total Pass</label>
            <input
              type="text"
              value={draft?.totalPass ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) updateField("totalPass", v);
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Total Fail</label>
            <input
              type="text"
              value={draft?.totalFail ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d+$/.test(v)) updateField("totalFail", v);
              }}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              inputMode="numeric"
            />
          </div>


          <div>
            <label className="text-sm font-medium text-gray-700">PDF Link</label>
            <input
              type="text"
              value={draft?.signOffPdfLink ?? ""}
              onChange={(e) => updateField("signOffPdfLink", e.target.value)}
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 ${
                pdfLinkError
                  ? "border-red-300 focus:ring-red-500"
                  : "focus:ring-blue-500"
              }`}
              placeholder="https://..."
              aria-invalid={pdfLinkError ? "true" : "false"}
            />
            {pdfLinkError ? (
              <p className="mt-1 text-xs text-red-600">{pdfLinkError}</p>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Approval Status</label>
            <select
              value={approvalValue}
              onChange={(e) => {
                const v = e.target.value;
                updateField("approved", v === "true" ? true : v === "false" ? false : "");
              }}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">Approve</option>
              <option value="false">Reject</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-sm border cursor-pointer rounded-md hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 cursor-pointer text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || Boolean(pdfLinkError)}
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SignoffHistory() {
  const { email, username, role, isAuthenticated } = useSelector(
    (state) => state.auth
  );

  const PAGE_SIZE = 10;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // ✅ sorting UI state
  const [sortBy, setSortBy] = useState("latestChange"); // "latestChange" | "createdAt"
  const [sortDir, setSortDir] = useState("desc"); // "desc" | "asc"

  // ✅ pagination state
  const [page, setPage] = useState(1);

useEffect(() => {
  async function load() {
    try {
      const data = await getAllSignoffs();

      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      if (isUnauthorizedError(e)) return;
      setErr("Failed to load sign-off history");
    } finally {
      setLoading(false);
    }
  }
  load();
}, []);

  const base = useMemo(() => items.map(normalizeSignoff).filter(Boolean), [items]);

  const filtered = useMemo(() => {
    let list = [...base];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          String(r.id || "").toLowerCase().includes(q) ||
          String(r.projectName || "").toLowerCase().includes(q) ||
          String(r.buildName || "").toLowerCase().includes(q) ||
          String(r.version || "").toLowerCase().includes(q) ||
          String(r.completedBy || "").toLowerCase().includes(q) ||
          String(r.approvedBy || "").toLowerCase().includes(q)
      );
    }

    const getKey = sortBy === "createdAt" ? (r) => createdAtTs(r) : (r) => latestChangeTs(r);

    list.sort((a, b) => {
      const da = getKey(a);
      const db = getKey(b);
      return sortDir === "desc" ? db - da : da - db;
    });

    return list;
  }, [base, search, sortBy, sortDir]);

  // ✅ reset pagination when filters change
  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [search, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // ✅ clamp page when data changes
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const startEdit = (row) => {
    if (!canEditSignoff(row, role)) return;
    const draft = {
      id: row.id,
      project: row.project || row.projectName || "",
      version: row.version || "",
      dateChanged: row.dateChanged || "",
      completedBy: row.completedBy || "",
      approvedBy: row.approvedBy || "",
      description: row.description || "",
      reason: row.reason || "",
      testEnvironment: row.testEnvironment || "",
      risksAssumptions: row.risksAssumptions || "",
      conclusion: row.conclusion || "",
      signOffPdfLink: row.pdfPath || row.signOffPdfLink || "",
      totalDesignTestCases: row.totalDesignTestCases || "",
      totalPass: row.totalPass || "",
      totalFail: row.totalFail || "",
      approved: typeof row.isApproved === "boolean" ? row.isApproved : "",
    };
    setEditDraft(draft);
    setEditError("");
    setEditOpen(true);
  };

  const submitEdit = async () => {
    if (!editDraft?.id) {
      setEditError("Missing sign-off id");
      return;
    }

    const pdfLinkValue = String(editDraft.signOffPdfLink ?? "").trim();
    if (pdfLinkValue && !isHttpUrl(pdfLinkValue)) {
      setEditError("Enter a valid PDF link starting with http:// or https://");
      return;
    }

    const payload = {
      project: editDraft.project,
      version: editDraft.version,
      dateChanged: editDraft.dateChanged,
      completedBy: editDraft.completedBy,
      approvedBy: editDraft.approvedBy,
      description: editDraft.description,
      reason: editDraft.reason,
      testEnvironment: editDraft.testEnvironment,
      risksAssumptions: editDraft.risksAssumptions,
      conclusion: editDraft.conclusion,
      signOffPdfLink: editDraft.signOffPdfLink,
      totalDesignTestCases: editDraft.totalDesignTestCases,
      totalPass: editDraft.totalPass,
      totalFail: editDraft.totalFail,
    };

    if (typeof editDraft.approved === "boolean") {
      payload.isApproved = editDraft.approved;
    }

    setEditSaving(true);
    setEditError("");

    try {
      const updated = await updateSignoff(editDraft.id, payload);
      setItems((prev) =>
        Array.isArray(prev)
          ? prev.map((item) => (item?.id === updated?.id ? { ...item, ...updated } : item))
          : prev
      );
      setSuccess("Sign-off updated successfully.");
      setEditOpen(false);
      setEditDraft(null);
    } catch (e) {
      console.error(e);
      setEditError(e?.message || "Failed to update sign-off");
    } finally {
      setEditSaving(false);
    }
  };

  if (loading)
    return (
      <div className="p-4 bg-white rounded-2xl ring-1 ring-gray-100">Loading sign-offs...</div>
    );

  if (err)
    return (
      <div className="p-4 bg-red-100 text-red-600 rounded-2xl ring-1 ring-red-200">{err}</div>
    );

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-gray-100 overflow-auto">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 border-b pb-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Sign-off History</h3>
          <p className="text-sm text-gray-500">
            Sorted by{" "}
            <span className="font-medium">
              {sortBy === "latestChange" ? "Latest Change" : "Created At"}
            </span>{" "}
            ({sortDir === "desc" ? "Descending" : "Ascending"})
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <input
          title="Search by Project Name, Build Name, Version, Completed By or Approved By"
            placeholder="Project/Build/Version..."
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1 border rounded-md text-sm w-72"
          />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1 border rounded-md text-sm bg-white"
            title="Sort by"
          >
            
            <option value="createdAt">Sort: Approved Date</option>
          </select>

          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
            className="px-3 py-1 text-sm border rounded-md bg-white hover:bg-gray-50"
            title="Toggle order"
          >
            {sortDir === "desc" ? "Descending" : "Ascending"}
          </button>
        </div>
      </div>

      {/* ✅ EMPTY STATE */}
      {success ? (
        <div className="mb-3 flex items-center justify-between rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <span>{success}</span>
          <button
            type="button"
            onClick={() => setSuccess("")}
            className="text-emerald-700 hover:text-emerald-900"
          >
            x
          </button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No sign-off request"
          subtitle="No sign-off history found for the selected filter"
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-auto text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2">Project / Build / Version</th>
                  <th className="py-2">Signoff Status</th>
                  <th className="py-2">Tested By</th>
                  <th className="py-2">Approved By</th>
                  <th className="py-2">Approved Date</th>
                  <th className="py-2">Signoff URL</th>
                  <th className="py-2 text-right">Signoff-Info</th>
                  {["ADMIN", "QAMANAGER"].includes(role) && (
                    <th className="py-2 text-right">Edit</th>
                  )}
                </tr>
              </thead>
 
              <tbody>
                {paged.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="py-3">
                        <div className="font-medium text-gray-800">{r.projectName || "—"}</div>
                        <div className="font-medium text-gray-800">{r.buildName || "—"}</div>
                        <div className="text-xs text-gray-500">{r.version || "—"}</div>
 
                        <div className="mt-1 flex items-center gap-2">
                          
                         
                        </div>
                      </td>
                      <td className="py-3">{r.isApproved === true && (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px]">
                              Approved
                            </span>
                          )}
                          {r.isApproved === false && (
                            <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px]">
                              Rejected
                            </span>
                          )}</td>

                      <td className="py-3">{r.completedBy || "—"}</td>
                      <td className="py-3">{r.approvedBy || "—"}</td>
 
                      <td className="py-3">
                        {/*<div className="text-xs text-gray-700">
                          <span className="text-gray-500">Latest Change:</span>{" "}
                          <span className="font-medium">
                            {formatDateAny(r.dateChanged || r.createdAt)}
                          </span>
                        </div>*/}
                        <div className="text-xs text-gray-600 mt-1">
                         
                          {formatDateAny(r.createdAt)}
                        </div>
                        {/*<div className="text-xs text-gray-600 mt-1">
                          <span className="text-gray-500">Date Changed:</span>{" "}
                          {formatDateAny(r.dateChanged)}
                        </div>*/}
                      </td>
 
                      <td className="py-3">
                        {r.pdfPath ? (
                          isHttpUrl(r.pdfPath) ? (
                            <a
                              className="text-blue-600 hover:underline"
                              href={r.pdfPath}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          ) : (
                            <span className="text-xs text-gray-600">{r.pdfPath}</span>
                          )
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
 
                      <td className="py-3 text-right">
                        <button
                          className="text-sm px-3 py-1.5 rounded-full border border-blue-200 cursor-pointer text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 active:translate-y-[1px] transition"
                          onClick={() => setExpandedId((e) => (e === r.id ? null : r.id))}
                        >
                          {expandedId === r.id ? "Hide" : "Details"}
                        </button>
                      </td>

                      {["ADMIN", "QAMANAGER"].includes(role) && (
                        <td className="py-3 text-right">
                          {canEditSignoff(r, role) && (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 border border-blue-200 rounded-md hover:bg-blue-50"
                            title="Edit sign-off"
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
                        <td colSpan={["ADMIN", "QAMANAGER"].includes(role) ? 7 : 6} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-700">
                            <div>
                              <div className="font-semibold mb-1">Description</div>
                              <div className="whitespace-pre-wrap">{r.description || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Test Environment</div>
                              <div className="whitespace-pre-wrap">{r.testEnvironment || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Risks & Assumptions</div>
                              <div className="whitespace-pr e-wrap">{r.risksAssumptions || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Conclusion</div>
                              <div className="whitespace-pre-wrap">{r.conclusion || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Total Design Test Case</div>
                              <div>{r.totalDesignTestCases || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Total Pass</div>
                              <div>{r.totalPass || "—"}</div>
                            </div>
                            <div>
                              <div className="font-semibold mb-1">Total Fail</div>
                              <div>{r.totalFail || "—"}</div>
                            </div>
                           
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* ✅ Pagination */}
          <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-600">
            <div>
              Showing{" "}
              <span className="font-medium text-gray-800">
                {filtered.length ? (page - 1) * PAGE_SIZE + 1 : 0}
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

      {(role === "ADMIN" || role === "QAMANAGER") && (
        <EditSignoffModal
          open={editOpen}
          draft={editDraft}
          setDraft={setEditDraft}
          onClose={() => setEditOpen(false)}
          onSave={submitEdit}
          saving={editSaving}
          error={editError}
        />
      )}
    </div>
  );
}
