import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const sampleData = [
  { name: "2025-09-01", raised: 0, resolved: 5, closed: 2 },
  { name: "2025-09-02", raised: 8, resolved: 0, closed: 1 },
  { name: "2025-09-03", raised: 15, resolved: 6, closed: 3 },
  { name: "2025-09-04", raised: 6, resolved: 4, closed: 2 },
  { name: "2025-09-05", raised: 12, resolved: 7, closed: 5 },
  { name: "2025-09-06", raised: 9, resolved: 3, closed: 1 },
  { name: "2025-09-07", raised: 14, resolved: 9, closed: 4 },
];

export default function BarGraph(props) {
  const {
    data = sampleData,
    title = "Bugs per day",
    height = 320,
    colors = ["#ef4444", "#10B981", "#6B7280"],
    stacked = true,
    showGrid = true,
    gradient = false,
    ariaLabel = "Bar chart",
    valueFormatter,
    raisedKey = "raised",
    resolvedKey = "resolved",
    closedKey = "closed",
    raisedName = "Raised",
    resolvedName = "Resolved",
    closedName = "Closed",
  } = props;

  const gradientId0 = "barGradient0";
  const gradientId1 = "barGradient1";
  const gradientId2 = "barGradient2";

  // ✅ detect empty or all-zero data
  const hasValidData =
    Array.isArray(data) &&
    data.length > 0 &&
    data.some(
      (d) =>
        Number(d?.[raisedKey] || 0) > 0 ||
        Number(d?.[resolvedKey] || 0) > 0 ||
        Number(d?.[closedKey] || 0) > 0
    );

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;

    const raisedEntry = payload.find((p) => p.dataKey === raisedKey);
    const resolvedEntry = payload.find((p) => p.dataKey === resolvedKey);
    const closedEntry = payload.find((p) => p.dataKey === closedKey);

    return (
      <div className="bg-white/95 border border-gray-200 p-3 text-sm shadow">
        <div className="font-medium mb-1">{label}</div>

        {raisedEntry && (
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 10,
                height: 10,
                background: raisedEntry.fill || colors[0],
              }}
            />
            <span>
              {raisedName}:{" "}
              <b>
                {valueFormatter
                  ? valueFormatter(raisedEntry.value)
                  : raisedEntry.value}
              </b>
            </span>
          </div>
        )}

        {resolvedEntry && (
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 10,
                height: 10,
                background: resolvedEntry.fill || colors[1],
              }}
            />
            <span>
              {resolvedName}:{" "}
              <b>
                {valueFormatter
                  ? valueFormatter(resolvedEntry.value)
                  : resolvedEntry.value}
              </b>
            </span>
          </div>
        )}

        {closedEntry && (
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 10,
                height: 10,
                background: closedEntry.fill || colors[2],
              }}
            />
            <span>
              {closedName}:{" "}
              <b>
                {valueFormatter
                  ? valueFormatter(closedEntry.value)
                  : closedEntry.value}
              </b>
            </span>
          </div>
        )}

        {stacked && (raisedEntry || resolvedEntry || closedEntry) && (
          <div className="mt-1 text-xs text-gray-500">
            Total:{" "}
            <b>
              {valueFormatter
                ? valueFormatter(
                    Number(raisedEntry?.value || 0) +
                      Number(resolvedEntry?.value || 0) +
                      Number(closedEntry?.value || 0)
                  )
                : Number(raisedEntry?.value || 0) +
                  Number(resolvedEntry?.value || 0) +
                  Number(closedEntry?.value || 0)}
            </b>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full border border-gray-100 bg-white p-4 shadow-lg rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      </div>

      <div style={{ height }} aria-label={ariaLabel} role="region">
        {!hasValidData ? (
          // ✅ No data UI
          <div className="flex h-full items-center justify-center text-gray-400 text-sm">
            No data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 12, left: 0, bottom: 6 }}
              barCategoryGap={stacked ? "20%" : "10%"}
            >
              {gradient && (
                <defs>
                  <linearGradient id={gradientId0} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[0]} stopOpacity={0.9} />
                    <stop
                      offset="100%"
                      stopColor={colors[0]}
                      stopOpacity={0.6}
                    />
                  </linearGradient>
                  <linearGradient id={gradientId1} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[1]} stopOpacity={0.9} />
                    <stop
                      offset="100%"
                      stopColor={colors[1]}
                      stopOpacity={0.6}
                    />
                  </linearGradient>
                  <linearGradient id={gradientId2} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors[2]} stopOpacity={0.9} />
                    <stop
                      offset="100%"
                      stopColor={colors[2]}
                      stopOpacity={0.6}
                    />
                  </linearGradient>
                </defs>
              )}

              {showGrid && (
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e6e6" />
              )}

              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v) =>
                  valueFormatter ? valueFormatter(Number(v)) : String(v)
                }
              />

              <Tooltip content={<CustomTooltip />} />
              <Legend />

              <Bar
                dataKey={raisedKey}
                name={raisedName}
                stackId={stacked ? "stack" : undefined}
                fill={gradient ? `url(#${gradientId0})` : colors[0]}
                isAnimationActive
                animationDuration={700}
              />

              <Bar
                dataKey={resolvedKey}
                name={resolvedName}
                stackId={stacked ? "stack" : undefined}
                fill={gradient ? `url(#${gradientId1})` : colors[1]}
                isAnimationActive
                animationDuration={700}
              />

              <Bar
                dataKey={closedKey}
                name={closedName}
                stackId={stacked ? "stack" : undefined}
                fill={gradient ? `url(#${gradientId2})` : colors[2]}
                isAnimationActive
                animationDuration={700}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Tip: hover a bar to see exact values
      </div>
    </div>
  );
}
