import { useEffect, useState } from "react";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
export const RECENT_BUILD_RELEASE_EVENT = "qa-portal:recent-build-release";

export default function AzureDevOpsUpdateNotifier({ className = "" }) {
  const [hasUpdates, setHasUpdates] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(
      `${API_BASE_URL}/api/webhooks/azure-devops/stream`
    );
 

    eventSource.addEventListener("azure-devops-workitem", function (event) {
      try {
        JSON.parse(event.data);
        setHasUpdates(true);
      } catch (error) {
        console.error("Failed to parse Azure DevOps SSE event:", error);
      }
    });

    eventSource.addEventListener("recent-build-release", function (event) {
      try {
        const payload = JSON.parse(event.data);
        const builds = Array.isArray(payload?.builds)
          ? payload.builds
          : payload?.builds
            ? [payload.builds]
            : [];

        if (!builds.length) return;

        window.dispatchEvent(
          new CustomEvent(RECENT_BUILD_RELEASE_EVENT, {
            detail: {
              ...payload,
              builds,
            },
          })
        );
      } catch (error) {
        console.error("Failed to parse recent build release SSE event:", error);
      }
    });

    eventSource.onerror = function (error) {
      console.error("SSE connection error:", error);
    };

    return function () {
      eventSource.close();
    };
  }, []);

  if (!hasUpdates) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className={[
        "inline-flex h-10 items-center justify-center whitespace-nowrap rounded-full",
        "border border-blue-200 bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm",
        "transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300",
        className,
      ].join(" ")}
      title="Refresh to load latest Azure DevOps changes"
    >
      Refresh now
    </button>
  );
}
