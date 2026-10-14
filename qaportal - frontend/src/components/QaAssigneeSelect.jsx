import React, { useState } from "react";
import { assignQaEngineer } from "../api/fetchBuildsApi";
import { createNotification } from "../api/notificationsApi";
import { isUnauthorizedError } from "../config/unauthorizedSession";

const ASSIGNMENT_TIMEOUT_MS = 30000;

function withAssignmentTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      const error = new Error("QA assignment is taking too long. Please try again.");
      error.name = "AbortError";
      reject(error);
    }, ASSIGNMENT_TIMEOUT_MS);

    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => window.clearTimeout(timeout));
  });
}

export default function QaAssigneeSelect({
  value,
  onChange, // still update parent state
  options = [], // [{ value, label }]
  enabled = true,
  placeholder = "Select Tester",
  // ✅ NEW (required for API)
  projectId,

  // ✅ optional callbacks
  onSaved,
  onError,
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });

  // if not enabled, show plain text only
  if (!enabled) {
    const selected = options.find((o) => o.value === value);
    return (
      <div className="m-2 px-2 py-1 text-sm text-gray-900">
        {selected?.label || value || "—"}
      </div>
    );
  }

  const handleChange = async (e) => {
    const next = e.target.value;

    onChange?.(next);
    setStatus({ type: "", message: "" });

    if (!projectId) {
      const err = new Error("projectId is required to assign QA");
      onError?.(err);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), ASSIGNMENT_TIMEOUT_MS);

    try {
      setSaving(true);
      await withAssignmentTimeout(assignQaEngineer(projectId, next, { signal: controller.signal }));

      const payload = {
        userId: next,
        title: "QA Assignment",
        message: `Build ${projectId} is assigned to you for testing.`,
        type: "QA_ASSIGNMENT",
        isRead: false,
      };

      createNotification(payload).catch((notifyErr) => {
        if (!isUnauthorizedError(notifyErr)) {
          console.warn(`Failed to send QA assignment notification to ${next}:`, notifyErr);
        }
      });

      setStatus({ type: "success", message: "QA assigned. Notification is being sent." });
      Promise.resolve(onSaved?.(next)).catch((savedErr) => {
        console.warn("QA assignment saved, but refresh callback failed:", savedErr);
      });
    } catch (err) {
      if (isUnauthorizedError(err)) return;
      const message = err?.name === "AbortError"
        ? "QA assignment is taking too long. Please try again."
        : err?.message || "Failed to assign QA";
      setStatus({ type: "error", message });
      onError?.(err);
    } finally {
      window.clearTimeout(timeout);
      setSaving(false);
    }
  };

  return (
    <div className="m-2">
      <select
        value={value || ""}
        onChange={handleChange}
        disabled={saving}
        className="block w-48 px-2 py-1 border rounded-md bg-white pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
      >
        <option value="" disabled>
          {placeholder}
        </option>

        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {saving && (
        <div className="mt-1 text-xs text-gray-500">Saving...</div>
      )}
      {!saving && status.type === "success" && (
        <div className="mt-1 text-xs text-emerald-600">{status.message}</div>
      )}
      {!saving && status.type === "error" && (
        <div className="mt-1 text-xs text-rose-600">{status.message}</div>
      )}
    </div>
  );
}
