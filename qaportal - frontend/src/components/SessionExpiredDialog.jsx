import React, { useEffect, useState } from "react";
import { clearClientSessionForFreshLogin } from "../config/msalConfig";

export default function SessionExpiredDialog({
  open,
  message = "Your session has expired. Please sign in again.",
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError("");
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSignInAgain = async () => {
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      await clearClientSessionForFreshLogin();
      window.location.assign("/login?reason=session_expired");
    } catch (err) {
      console.error("Failed to navigate to login page:", err);
      setError(err?.message || "Unable to open login page. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 8v5m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.72 3h16.92a2 2 0 0 0 1.72-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h2 id="session-expired-title" className="text-lg font-semibold text-gray-900">
              Sign in again
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {message}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Please sign in again to continue.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleSignInAgain}
            disabled={submitting}
            className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
              submitting
                ? "cursor-not-allowed bg-blue-300 text-white"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {submitting ? "Redirecting..." : "Sign in again"}
          </button>
        </div>
      </div>
    </div>
  );
}
