"use client";

import React, { useMemo, useState, useEffect } from "react";
import { fetchBuildLogs } from "../api/fetchLogs";
import { isUnauthorizedError } from "../config/unauthorizedSession";

/* ------------------------------
   Format timestamp + action + user
--------------------------------*/
function formatLogLine(log) {
  if (!log) return "-";

  const ts = log.timestamp ? new Date(log.timestamp) : null;

  const date =
    ts?.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }) || "-";

  const time =
    ts?.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }) || "-";

  const action = log.actionType || "";
  const user = log.performedBy || "";

  return `${date} ${time} ${action} ${user}`.trim();
}

function getActionBadgeClass(source = "") {
  const value = source.toLowerCase();

  if (value.includes("create")) {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  }
  if (value.includes("update")) {
    return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
  }
  if (value.includes("delete")) {
    return "bg-rose-100 text-rose-700 ring-1 ring-rose-200";
  }
  if (value.includes("approve")) {
    return "bg-sky-100 text-sky-700 ring-1 ring-sky-200";
  }

  return "bg-violet-100 text-violet-700 ring-1 ring-violet-200";
}

function formatTimestamp(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function getRawDetails(log) {
  return String(log?.raw?.details || log?.details || "");
}

function parseUpdatedFields(log) {
  const details = getRawDetails(log);
  const match = details.match(/Updated Fields:\s*([\s\S]*?)(?:\s*\|\s*By:|$)/i);

  if (!match?.[1]) return [];

  const text = match[1].trim();
  if (!text || /^No field value changed$/i.test(text)) return [];

  return text
    .split(/;\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parsed = entry.match(/^([^:]+):\s*([\s\S]*?)\s*->\s*([\s\S]*)$/);

      if (!parsed) {
        return { field: entry, oldValue: "-", newValue: "-" };
      }

      return {
        field: parsed[1].trim(),
        oldValue: parsed[2].trim() || "-",
        newValue: parsed[3].trim() || "-",
      };
    });
}

/* ------------------------------
   Component
--------------------------------*/
export default function Logs() {
  const [query, setQuery] = useState("");
  const [apiLogs, setApiLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch logs
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const result = await fetchBuildLogs();
        if (result) setApiLogs(result);
      } catch (error) {
        if (isUnauthorizedError(error)) return;
        console.error("Failed to load logs", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Map backend logs
  const sourceLogs = apiLogs.map((l) => ({
    id: l.id,
    message: formatLogLine(l),
    details: l.details || "No extra details provided.",
    source: l.actionType || "system",
    url: null,
    ts: l.timestamp ? new Date(l.timestamp).getTime() : null,
    raw: l,
  }));

  // Sort logs
  const sorted = useMemo(() => {
    return [...sourceLogs].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }, [sourceLogs]);

  // Filter search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;

    return sorted.filter((l) => {
      return (
        l.message.toLowerCase().includes(q) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        String(l.id || "").toLowerCase().includes(q)
      );
    });
  }, [sorted, query]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  // Keep pagination stable when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [itemsPerPage]);

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);

  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  const selectedLogUpdatedFields = selectedLog ? parseUpdatedFields(selectedLog) : [];

  return (
    <div className="mt-4 mr-3 rounded-2xl bg-gradient-to-br from-white via-slate-50 to-indigo-50 shadow-md ring-1 ring-slate-200 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur-sm px-5 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-800">
              Activity Logs
              <span className="ml-2 inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                {sorted.length} entries
              </span>
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Recent build activity and actions
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search logs..."
              className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={() => {
                setQuery("");
              }}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-200"
            >
              Reset
            </button>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              aria-label="Rows per page"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log List */}
      <div className="p-4">
        {loading ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 text-sm text-slate-600">
            <span
              className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"
              aria-hidden="true"
            />
            <span className="mt-3 font-medium text-slate-700">Loading logs…</span>
            <span className="mt-1 text-xs text-slate-500">Fetching activity history, please wait.</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
            No logs found.
          </div>
        ) : (
          <ul className="space-y-3">
            {paginatedLogs.map((l) => (
              <li
                key={l.id}
                className="flex cursor-pointer items-center justify-between px-4 py-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 transition"
                onClick={() => setSelectedLog(l)}
              >
                {/* Left: message */}
                <div className="text-sm text-slate-800 truncate">
                  {l.details || l.message}
                </div>

                {/* Right: action + id */}
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <span className="px-2 py-[2px] rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                    {l.source}
                  </span>

                  <span className="text-slate-300">•</span>

                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-[2px] rounded-md">
                    {String(l.id)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex flex-col items-center gap-2 text-sm text-gray-600">
          <div className="text-center">
            Showing{" "}
            <span className="font-medium text-gray-800">
              {(currentPage - 1) * itemsPerPage + 1}
            </span>
            {" - "}
            <span className="font-medium text-gray-800">
              {Math.min(filtered.length, currentPage * itemsPerPage)}
            </span>{" "}
            of <span className="font-medium text-gray-800">{filtered.length}</span> results
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>

            <div className="px-3 py-1 border rounded">{currentPage}</div>

            <button
              type="button"
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-details-title"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <h4 id="log-details-title" className="text-lg font-semibold text-slate-900">
                  Activity Log Details
                </h4>
                <p className="mt-1 text-sm text-slate-500">
                  Full activity information for log #{selectedLog.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Action
                  </div>
                  <div className="mt-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getActionBadgeClass(selectedLog.source)}`}>
                      {selectedLog.source}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Timestamp
                  </div>
                  <div className="mt-2 text-sm text-slate-900">
                    {formatTimestamp(selectedLog.raw?.timestamp)}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Performed By
                  </div>
                  <div className="mt-2 text-sm text-slate-900">
                    {selectedLog.raw?.performedBy || "-"}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Log Id
                  </div>
                  <div className="mt-2 text-sm text-slate-900">
                    {selectedLog.id}
                  </div>
                </div>
              </div>

              {selectedLogUpdatedFields.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="text-xs font-medium uppercase tracking-wide text-amber-700">
                    Updated Fields
                  </div>
                  <div className="mt-3 overflow-hidden rounded-lg border border-amber-200 bg-white">
                    <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-800">
                      <div>Field</div>
                      <div>Old Value</div>
                      <div>New Value</div>
                    </div>
                    <div className="divide-y divide-amber-100">
                      {selectedLogUpdatedFields.map((item, index) => (
                        <div
                          key={`${item.field}-${index}`}
                          className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-3 py-2 text-sm text-slate-900"
                        >
                          <div className="font-medium text-slate-800">{item.field}</div>
                          <div className="whitespace-pre-wrap break-words text-slate-600">{item.oldValue}</div>
                          <div className="whitespace-pre-wrap break-words text-slate-900">{item.newValue}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Details
                </div>
                <div className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-900">
                  {selectedLog.details || "No extra details provided."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
