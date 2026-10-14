import React, { useMemo } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  DoughnutController,
  Legend,
  Tooltip,
  Title,
} from "chart.js";
import { Pie } from "react-chartjs-2";

ChartJS.register(
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

const BUG_COLOR_MAP = {
  New: "#FB7185",
  Active: "#818CF8",
  Resolved: "#FBBF24",
  Closed: "#EC4899",
  Unknown: "#9CA3AF",
};

const ISSUE_COLOR_MAP = {
  New: "#FB7185",
  Active: "#818CF8",
  Resolved: "#FBBF24",
  Closed: "#4ADE80",
  Unknown: "#9CA3AF",
};

const TASK_COLOR_MAP = {
  New: "#FB7185",
  Active: "#818CF8",
  Resolved: "#FBBF24",
  Closed: "#4ADE80",
  Done: "#4ADE80",
  Removed: "#9CA3AF",
  Unknown: "#9CA3AF",
};

const TESTCASE_COLOR_MAP = {
  Passed: "#4ADE80",
  Failed: "#F87171",
  Blocked: "#FBBF24",
  NotApplicable: "#9CA3AF",
  Pause: "#F87171",
  Unknown: "#9CA3AF",
};

const SEVERITY_COLOR_MAP = {
  Critical: "#F87171",
  High: "#FB923C",
  Medium: "#FBBF24",
  Low: "#4ADE80",
  Unknown: "#9CA3AF",
};

const COLOR_MAPS = {
  bugs: BUG_COLOR_MAP,
  issues: ISSUE_COLOR_MAP,
  tasks: TASK_COLOR_MAP,
  testcase: TESTCASE_COLOR_MAP,
  severity: SEVERITY_COLOR_MAP,
};

function normalizeLabel(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return "Unknown";
  }

  const normalized = text.toLowerCase();

  if (normalized === "new") return "New";
  if (normalized === "active") return "Active";
  if (normalized === "resolved") return "Resolved";
  if (normalized === "closed") return "Closed";
  if (normalized === "done") return "Done";
  if (normalized === "removed") return "Removed";

  if (normalized === "critical") return "Critical";
  if (normalized === "high") return "High";
  if (normalized === "medium") return "Medium";
  if (normalized === "low") return "Low";

  if (normalized === "passed") return "Passed";
  if (normalized === "failed") return "Failed";
  if (normalized === "blocked") return "Blocked";
  if (normalized === "notapplicable") return "NotApplicable";
  if (normalized === "pause") return "Pause";

  return text;
}

export default function PieChart({
  data = [],
  labels = [],
  title,
  type = "testcase",
  emptyMessage = "No data available",
}) {
  const colorMap = COLOR_MAPS[type] || COLOR_MAPS.testcase;

  const entries = useMemo(() => {
    const safeLabels = Array.isArray(labels) ? labels : [];
    const safeData = Array.isArray(data) ? data : [];

    return safeLabels
      .map((rawLabel, index) => {
        const label = normalizeLabel(rawLabel);
        const numericValue = Number(safeData[index]);

        return {
          label,
          value: Number.isFinite(numericValue) ? numericValue : 0,
          color:
            colorMap[label] ||
            colorMap.Unknown ||
            "#9CA3AF",
        };
      })
      .filter((entry) => entry.value > 0);
  }, [data, labels, colorMap]);

  const hasData = entries.length > 0;

  const chartData = useMemo(
    () => ({
      labels: entries.map((entry) => entry.label),
      datasets: [
        {
          label: title || "Status",
          data: entries.map((entry) => entry.value),
          backgroundColor: entries.map((entry) => entry.color),
          borderColor: "#FFFFFF",
          borderWidth: 2,
          hoverOffset: 4,
        },
      ],
    }),
    [entries, title]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.parsed || 0);

              const total = (context.dataset.data || []).reduce(
                (sum, currentValue) => sum + Number(currentValue || 0),
                0
              );

              const percentage = total
                ? ((value / total) * 100).toFixed(1)
                : "0.0";

              return `${context.label}: ${value} (${percentage}%)`;
            },
          },
        },
      },
      animation: {
        animateRotate: true,
        animateScale: false,
        duration: 350,
      },
    }),
    []
  );

  return (
    <div className="flex h-full min-w-0 flex-col items-center">
      {title && (
        <div className="mb-3 text-center text-base font-semibold text-gray-800">
          {title}
        </div>
      )}

      <div className="flex w-full items-center justify-center">
        {hasData ? (
          <div
            className="relative"
            style={{
              width: "190px",
              height: "190px",
              minWidth: "190px",
              minHeight: "190px",
            }}
          >
            <Pie
              data={chartData}
              options={options}
            />
          </div>
        ) : (
          <div className="flex h-[190px] items-center justify-center text-sm text-gray-400 select-none">
            {emptyMessage}
          </div>
        )}
      </div>

      {hasData && (
        <div className="mt-4 flex w-full flex-wrap justify-center gap-x-4 gap-y-2 text-sm">
          {entries.map((entry) => (
            <div
              key={`${entry.label}-${entry.value}`}
              className="flex items-center gap-1.5"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />

              <span className="text-gray-600">
                {entry.label} ({entry.value})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}