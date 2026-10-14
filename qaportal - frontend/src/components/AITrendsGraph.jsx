// AITrendsGraphs.jsx
import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Filter, Loader2 } from "lucide-react";
import {
  createUnauthorizedSessionError,
  getFreshBackendApiToken,
  isUnauthorizedPayloadMessage,
  resolveBackendApiToken,
} from "../api/backendAuth";
/* --------------------------
   Helpers
-------------------------- */
function niceNumber(n) {
  if (!n) return "0";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function colorForIndex(i) {
  const palette = ["#111827", "#1f2937", "#374151", "#4b5563", "#6b7280"];
  return palette[i % palette.length];
}

const normalizeKey = (s) => String(s ?? "").trim().toLowerCase();

// Hide scrollbar but still allow scroll inside that container
const NO_SCROLLBAR =
  "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

function LoadingOverlay({ label = "Loading…" }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
      <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/* --------------------------
   Insights formatting
-------------------------- */
function asText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  // objects -> ignore (prevents [object Object])
  return "";
}

function formatInsightsObject(obj) {
  const o = obj?.aiInsights || obj?.insights || obj?.aiSummary || obj?.summary || obj;
  if (!o) return "";
  if (typeof o === "string") return o.trim();

  const exec = asText(o["Executive Summary"] || o.executiveSummary);
  const dist = asText(o["Distribution Pattern"] || o.distributionPattern);
  const outlier = asText(o["Outlier Analysis"] || o.outlierAnalysis);
  const risk = asText(o["Release Risk Assessment"] || o.releaseRiskAssessment);

  const highRisk = o["High Risk Features"] || o.highRiskFeatures || [];
  const actions = o["Recommended Actions"] || o.recommendedActions || [];

  const parts = [];
  if (exec) parts.push(exec);

  if (Array.isArray(highRisk) && highRisk.length) {
    const hr = highRisk
      .map((x) => {
        if (!x) return null;
        if (typeof x !== "object") return asText(x);

        const f = asText(x.feature ?? x.name);
        const c = x.bug_count ?? x.bugCount ?? x.count;
        const pct = x.percentage ?? x.percent;

        if (f && c != null && pct != null) return `${f} (${c}, ${pct}%)`;
        if (f && c != null) return `${f} (${c})`;
        if (f) return f;
        return null;
      })
      .filter(Boolean)
      .join(", ");

    if (hr) parts.push(`High-risk features: ${hr}.`);
  }

  if (dist) parts.push(dist);
  if (outlier) parts.push(outlier);
  if (risk) parts.push(risk);

  if (Array.isArray(actions) && actions.length) {
    const a = actions
      .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
      .filter(Boolean);
    if (a.length) parts.push(`Recommended actions: ${a.join(" ")}`);
  }

  return parts.filter(Boolean).join("\n\n");
}

function normalizeSummaryText(input) {
  if (!input) return "";

  if (typeof input === "object") return formatInsightsObject(input);

  let t = String(input).trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();

  if (t.startsWith("{") && t.endsWith("}")) {
    try {
      return formatInsightsObject(JSON.parse(t));
    } catch {
      // fall through
    }
  }

  t = t.replace(/^\s*"(aiSummary|summary|aiInsights|insights)"\s*:\s*/i, "");
  t = t.replace(/^\s*(aiSummary|summary|aiInsights|insights)\s*:\s*/i, "");
  t = t.replace(/^"+|"+$/g, "").trim();

  return t;
}

/* --------------------------
   Bold only numeric part
-------------------------- */
function SummaryWithBoldCounts({ text }) {
  const s = normalizeSummaryText(text);
  if (!s) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h4 className="mb-2 mt-3 text-base font-semibold text-gray-900 first:mt-0">
            {children}
          </h4>
        ),
        h2: ({ children }) => (
          <h4 className="mb-2 mt-3 text-base font-semibold text-gray-900 first:mt-0">
            {children}
          </h4>
        ),
        h3: ({ children }) => (
          <h5 className="mb-2 mt-3 text-sm font-semibold text-gray-900 first:mt-0">
            {children}
          </h5>
        ),
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
      }}
    >
      {s}
    </ReactMarkdown>
  );
}
/* --------------------------
   Tooltip with Top Bugs
-------------------------- */
function TopFeaturesTooltip({
  active,
  payload,
  label,
  totalBugs = 0,
  topFeaturesOverall = [],
  topBugsByFeature = {},
  topBugsKeyIndex = {},
  rankByFeature = {},
}) {
  if (!active || !payload?.length) return null;

  const featureFromLabel = label ?? "";
  const featureFromPayload = payload?.[0]?.payload?.feature ?? "";
  const feature = featureFromPayload || featureFromLabel;

  const count = Number(payload?.[0]?.value ?? payload?.[0]?.payload?.count ?? 0);
  const rank = rankByFeature?.[feature];
  const pct = totalBugs > 0 ? ((count / totalBugs) * 100).toFixed(1) : null;

  const realKey = topBugsKeyIndex[normalizeKey(feature)] || feature;
  const bugs = Array.isArray(topBugsByFeature?.[realKey])
    ? topBugsByFeature[realKey].slice(0, 5)
    : [];

  const topList = topFeaturesOverall
    .slice(0, 3)
    .map((x) => `${x.feature} (${x.count})`)
    .join(", ");

  return (
    <div className="max-w-[520px] rounded-xl border bg-white px-3 py-2 text-xs shadow-sm">
      <div className="text-sm font-semibold text-gray-900">
        {feature}
        {Number.isFinite(rank) ? (
          <span className="ml-2 text-xs font-medium text-gray-500">• Rank #{rank}</span>
        ) : null}
      </div>

      <div className="mt-1 text-gray-700">
        Bugs: <strong className="font-semibold text-gray-900">{count}</strong>
        {pct ? <span className="text-gray-500"> • {pct}%</span> : null}
      </div>



      {bugs.length ? (
        <div className="mt-2">
          <div className="font-semibold text-gray-900">Top bugs in {realKey}</div>
          <ul className="mt-1 space-y-1 text-gray-700">
            {bugs.map((b) => (
              <li key={`${b.workItemId}-${b.title}`} className="break-words">
                <strong className="font-semibold text-gray-900">#{b.workItemId}</strong>{" "}
                {String(b.title ?? "").trim()}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-2 text-gray-500">No top bugs found for this feature.</div>
      )}
    </div>
  );
}

/* --------------------------
   Main Component
-------------------------- */
export default function AITrendsGraph({
  summary = null,
  title = "AI Trends",
  defaultTopFeatures = 10,
  apiBaseUrl =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL
    ? import.meta.env.VITE_API_BASE_URL
    : "",
  organization,
  project,
  buildName,
  tag,
  projectOptions = [],
  buildNameOptions = [],
  versionOptions = [],
  onProjectChange = null,
  onBuildNameChange = null,
  onVersionChange = null,

  // ✅ NEW: control height without full-screen takeover
  heightClassName = "h-full", // change this from parent if needed
  className = "h-full", // outer wrapper extra classes
}) {
  const [topFeatures, setTopFeatures] = useState(defaultTopFeatures);
  const [apiSummary, setApiSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const base = useMemo(() => (apiBaseUrl || "").replace(/\/+$/, ""), [apiBaseUrl]);
  const data = summary ?? apiSummary;

  const fetchKey = useMemo(
    () => `${base}|${organization || ""}|${project || ""}|${buildName || ""}|${tag || ""}`,
    [base, organization, project, buildName, tag]
  );

  useEffect(() => {
    if (summary) return;
    if (!organization || !project || !buildName || !tag) {
      setApiSummary(null);
      setApiError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function run() {
      try {
        if (!active) return;
        setLoading(true);
        setApiError("");

        const qs = new URLSearchParams();
        qs.set("organization", organization);
        qs.set("project", project);
        qs.set("buildName", buildName);
        if (tag) qs.set("tag", tag);
        const url = `${base}/api/bugs/ai-trends?${qs.toString()}`;
        async function requestWithToken(activeToken, retried = false) {
          const res = await fetch(url, {
            method: "GET",
            signal: controller.signal,
            credentials: "include",
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${activeToken}`,
            },
          });

          if (res.status === 401) {
            const txt = await res.text().catch(() => "");
            if (!retried) {
              const freshToken = await getFreshBackendApiToken();
              if (freshToken) {
                return requestWithToken(freshToken, true);
              }
            }
            throw createUnauthorizedSessionError(
              txt || "Unauthorized. Please sign in again.",
              "ai-trends"
            );
          }

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            if (!retried && isUnauthorizedPayloadMessage(txt)) {
              const freshToken = await getFreshBackendApiToken();
              if (freshToken) {
                return requestWithToken(freshToken, true);
              }
              throw createUnauthorizedSessionError(
                txt || "Unauthorized. Please sign in again.",
                "ai-trends"
              );
            }

            const error = new Error(txt || `AI Trends request failed (${res.status})`);
            error.status = res.status;
            throw error;
          }

          return res.json();
        }

        const token = await resolveBackendApiToken(null, "ai-trends");
        const json = await requestWithToken(token);

        if (!active) return;
        setApiSummary(json);
      } catch (e) {
        if (e?.name === "AbortError") return;
        if (!active) return;
        setApiError(e?.message || "Failed to fetch AI trends");
        setApiSummary(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [summary, fetchKey, base, organization, project, buildName, tag]);

  const isInitialLoading = loading && !data && !apiError;
  const isRefreshing = loading && !!data;

  const featureData = useMemo(() => {
    const arr = data?.featureCounts || [];
    const sorted = [...arr].sort((a, b) => (b.count || 0) - (a.count || 0));
    const top = sorted.slice(0, clamp(topFeatures, 1, 25));
    const other = top.filter((x) => (x.feature || "").toLowerCase() === "other");
    const rest = top.filter((x) => (x.feature || "").toLowerCase() !== "other");
    return [...rest, ...other].map((x) => ({
      feature: x.feature,
      count: Number(x.count || 0),
    }));
  }, [data, topFeatures]);

  const totalBugs = data?.totalBugs ?? 0;

  const allFeatureSorted = useMemo(() => {
    const arr = data?.featureCounts || [];
    return [...arr]
      .map((x) => ({ feature: x.feature, count: Number(x.count || 0) }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const rankByFeature = useMemo(() => {
    const m = {};
    allFeatureSorted.forEach((x, i) => (m[x.feature] = i + 1));
    return m;
  }, [allFeatureSorted]);

  const topFeaturesOverall = useMemo(() => allFeatureSorted.slice(0, 3), [allFeatureSorted]);

  const topBugsByFeature = data?.topBugsByFeature || {};
  const topBugsKeyIndex = useMemo(() => {
    const idx = {};
    Object.keys(topBugsByFeature || {}).forEach((k) => (idx[normalizeKey(k)] = k));
    return idx;
  }, [topBugsByFeature]);

  const aiSummaryRaw = data?.aiSummary ?? data?.summary ?? "";
  const insightsText = useMemo(() => normalizeSummaryText(aiSummaryRaw), [aiSummaryRaw]);

  return (
    <div className={`mt-4 overflow-hidden ${NO_SCROLLBAR}`}>
      <div className="rounded-2xl border bg-white shadow-sm flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex flex-col gap-3 border-b p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border bg-gray-50 p-2">
              <TrendingUp className="h-5 w-5" />
            </div>

            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                {title}
                {loading && (
                  <span className="inline-flex items-center gap-1 rounded-full border bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {isRefreshing ? "Refreshing" : "Loading"}
                  </span>
                )}
              </div>

              <div className="text-sm text-gray-500">Feature-wise bug counts (AI)</div>

              { }
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600"><b>Project:</b></span>
              <select
                className="min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                value={project || ""}
                onChange={(e) => onProjectChange?.(e.target.value)}
                disabled={!onProjectChange}
                title="Project"
              >
                {projectOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>

              <span className="text-sm text-gray-600"><b>Build:</b></span>
              <select
                className="min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                value={buildName || ""}
                onChange={(e) => onBuildNameChange?.(e.target.value)}
                disabled={!onBuildNameChange || !project}
                title="Build Name"
              >
                {buildNameOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>

              <span className="text-sm text-gray-600"><b>Version:</b></span>
              <select
                className="min-w-[140px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
                value={tag || ""}
                onChange={(e) => onVersionChange?.(e.target.value)}
                disabled={!onVersionChange || !buildName || buildName === "__NO_BUILDS__"}
                title="Build Version"
              >
                {versionOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="inline-flex items-center gap-2 rounded-xl border bg-gray-50 px-3 py-2 text-sm">
              <Filter className="h-4 w-4 text-gray-600" />
              <select
                className="bg-transparent outline-none disabled:opacity-60"
                value={topFeatures}
                onChange={(e) => setTopFeatures(Number(e.target.value))}
                disabled={isInitialLoading}
              >
                {[5, 10, 15, 20, 25].map((n) => (
                  <option key={n} value={n}>
                    Top {n} features
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* API error */}
        {apiError && (
          <div className="shrink-0 border-b bg-red-50 px-5 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-h-0 p-5 pt-4 flex flex-col gap-4">
          {/* Summary cards */}
          <div className="shrink-0 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-500">Total bugs</div>
              {isInitialLoading ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="mt-1 text-2xl font-semibold text-gray-900">{niceNumber(totalBugs)}</div>
              )}
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-500">Top Error Prone Feature</div>
              {isInitialLoading ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <>
                  <div className="mt-1 text-xl font-semibold text-gray-900">
                    {featureData?.[0]?.feature ?? "—"}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    <strong className="font-semibold text-gray-900">{featureData?.[0]?.count ?? 0}</strong>{" "}
                    bugs
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-500">Features shown</div>
              {isInitialLoading ? (
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="mt-1 text-2xl font-semibold text-gray-900">{niceNumber(featureData.length)}</div>
              )}
            </div>
          </div>

          {/* Chart + Insights */}
          <div className="mt-4 flex-1 min-h-0 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Chart (overflow-visible to not clip tooltip) */}
            <div className="lg:col-span-2 relative rounded-2xl border bg-white p-4 flex flex-col min-h-[360px] overflow-visible">
              <div className="shrink-0 mb-2">
                <div className="text-sm font-semibold text-gray-900">Bugs by Feature (AI)</div>
                <div className="text-xs text-gray-500">Hover a feature to see top bugs</div>
              </div>

              <div className="flex-1 min-h-[320px] w-full">
                {isInitialLoading ? (
                  <div className="flex h-full w-full items-center justify-center rounded-2xl border bg-gray-50 text-sm text-gray-600">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading chart…
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={featureData} margin={{ top: 10, right: 14, bottom: 80, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="feature"
                        tick={{ fontSize: 12 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={90}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        wrapperStyle={{ zIndex: 9999 }}
                        allowEscapeViewBox={{ x: true, y: true }}
                        content={(props) => (
                          <TopFeaturesTooltip
                            {...props}
                            totalBugs={totalBugs}
                            topFeaturesOverall={topFeaturesOverall}
                            topBugsByFeature={topBugsByFeature}
                            topBugsKeyIndex={topBugsKeyIndex}
                            rankByFeature={rankByFeature}
                          />
                        )}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="count"
                        name="Bugs"
                        stroke={colorForIndex(0)}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {isRefreshing && <LoadingOverlay label="Refreshing chart…" />}
            </div>

            {/* AI Insights (show all text; scroll inside but scrollbar hidden) */}
            <div className="rounded-2xl border bg-gray-50 p-4 flex flex-col min-h-[280px] overflow-hidden">
              <div className="shrink-0 text-lg font-bold text-gray-500">AI Insights</div>

              <div className={`mt-2 flex-1 min-h-[200px] overflow-auto ${NO_SCROLLBAR}`}>
                {isInitialLoading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading insights…
                  </div>
                ) : insightsText ? (
                  <div className="text-sm leading-relaxed text-gray-800 break-words">
                    <SummaryWithBoldCounts text={insightsText} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No AI insights available.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        {!organization || !project ? (
          <div className="shrink-0 border-t px-5 py-4 text-sm text-gray-500">
            Provide <span className="font-semibold">organization</span> and{" "}
            <span className="font-semibold">project</span> props to fetch data.
          </div>
        ) : null}
      </div>
    </div>
  );
}
