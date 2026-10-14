// src/components/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import PieChart from "./PieChart";
import BarGraph from "./BarGraph";
import TestProgress from "./TestProgress";
import AIScoreCircle from "./AIScoreCircle";
import CentralRepository from "./CentralRepository";
import RecentBuildsRow from "./RecentBuildsRow";

import { fetchBugStats } from "../api/fetchBugs";
import { fetchIssues } from "../api/fetchIssues";
import { fetchTasks } from "../api/fetchTasks";
import { fetchBugSeverity } from "../api/fetchBugSeverity";
import { fetchTestProgress } from "../api/fetchTestProgress";
import { fetchConfidenceScore } from "../api/fetchConfidenceScore";
import { fetchDailyBugStats } from "../api/fetchDailyBugStatsApi";
import { fetchRecentBugs } from "../api/recentActivityApi";
import { fetchDashboardMetrics } from "../api/pdfApi";
import {
  loadCache,
  saveCache,
  removeCache,
  removeByPrefix,
} from "../config/storage";
import { isUnauthorizedError } from "../config/unauthorizedSession";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const ORGANIZATION = import.meta.env.VITE_ORGANIZATION;

const DEFAULT_STATS = [
  { title: "New", value: 0, sub: "", icon: "🔆", ring: "ring-blue-100" },
  { title: "Resolved", value: 0, sub: "", icon: "✅", ring: "ring-green-100" },
  { title: "Active", value: 0, sub: "", icon: "🕒", ring: "ring-amber-100" },
  { title: "Closed", value: 0, sub: "", icon: "⚠️", ring: "ring-rose-100" },
];

function devOpsRedirect() {
  const url = "https://aex.dev.azure.com/me?mkt=en-IN";
  const newWin = window.open(url, "_blank", "noopener,noreferrer");

  if (newWin) {
    newWin.focus();
  }
}

function stateToTitle(s) {
  if (!s) {
    return "Unknown";
  }

  const n = String(s).trim().toLowerCase();

  if (n === "active") {
    return "Active";
  }

  if (n === "closed") {
    return "Closed";
  }

  if (n === "new") {
    return "New";
  }

  if (n === "resolved") {
    return "Resolved";
  }

  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function buildByTitleFromBugStats(statsArray) {
  const list = Array.isArray(statsArray?.value)
    ? statsArray.value
    : Array.isArray(statsArray)
      ? statsArray
      : [];

  return list.reduce((acc, item) => {
    if (!item) {
      return acc;
    }

    // Raw /api/bugs response: { value: [{ State: "Resolved" }, ...] }
    if (item?.State || item?.state || item?.fields?.["System.State"]) {
      const rawState =
        item?.State ??
        item?.state ??
        item?.fields?.["System.State"];

      const title = stateToTitle(rawState);
      acc[title] = (acc[title] || 0) + 1;
      return acc;
    }

    // Existing fetchBugStats response:
    // [{ title: "Resolved", value: 3 }, ...]
    if (item?.title) {
      acc[item.title] = (acc[item.title] || 0) + Number(item?.value ?? 0);
    }

    return acc;
  }, {});
}

function getIssueItems(issueResponse) {
  return Array.isArray(issueResponse?.value)
    ? issueResponse.value
    : Array.isArray(issueResponse)
      ? issueResponse
      : Array.isArray(issueResponse?.items)
        ? issueResponse.items
        : [];
}

function buildByTitleFromIssues(issueResponse) {
  const list = getIssueItems(issueResponse);

  return list.reduce((acc, it) => {
    const rawState =
      it?.state ||
      it?.State ||
      it?.fields?.["System.State"] ||
      it?.fields?.["system.state"];

    const title = stateToTitle(rawState);

    acc[title] = (acc[title] || 0) + 1;

    return acc;
  }, {});
}


function getTaskItems(taskResponse) {
  return Array.isArray(taskResponse?.value)
    ? taskResponse.value
    : Array.isArray(taskResponse)
      ? taskResponse
      : Array.isArray(taskResponse?.items)
        ? taskResponse.items
        : [];
}

function buildByTitleFromTasks(taskResponse) {
  const list = getTaskItems(taskResponse);

  return list.reduce((acc, item) => {
    const rawState =
      item?.state ||
      item?.State ||
      item?.fields?.["System.State"] ||
      item?.fields?.["system.state"] ||
      "";

    const title = stateToTitle(rawState);

    acc[title] = (acc[title] || 0) + 1;

    return acc;
  }, {});
}

function buildChartDataFromByTitle(byTitle, setLabels) {
  const fullList = [
    { label: "New", title: "New" },
    { label: "Active", title: "Active" },
    { label: "Resolved", title: "Resolved" },
    { label: "Closed", title: "Closed" },
  ];

  const filtered = fullList
    .map((item) => ({
      label: item.label,
      value: byTitle[item.title] || 0,
    }))
    .filter((item) => item.value > 0);

  const labelsOnly = filtered.map((x) => x.label);

  setLabels(labelsOnly);

  return filtered.map((x) => x.value);
}

function buildSeverityChartData(dataObj, setLabels) {
  if (!dataObj) {
    setLabels([]);
    return [];
  }

  const items = Object.entries(dataObj).map(([sev, count]) => ({
    label: sev,
    value: Number(count) || 0,
  }));

  const filtered = items.filter((i) => i.value > 0);

  const labels = filtered.map((i) => i.label);
  const values = filtered.map((i) => i.value);

  setLabels(labels);

  return values;
}

function formatDateTime(iso) {
  if (!iso) {
    return "—";
  }

  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return String(iso);
  }

  return d.toLocaleString();
}

function truncateWithTwoDots(value, maxLength = 48) {
  const text = String(value || "");

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 2)).trimEnd()}..`;
}

function stateBadgeClass(state) {
  const s = String(state || "").toLowerCase();

  if (s === "new") {
    return "bg-rose-100 text-rose-700";
  }

  if (s === "active") {
    return "bg-amber-100 text-amber-700";
  }

  if (s === "resolved") {
    return "bg-emerald-100 text-emerald-700";
  }

  if (s === "closed") {
    return "bg-gray-200 text-gray-800";
  }

  return "bg-gray-100 text-gray-700";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toSafeNumber(value) {
  const num = Number(value);

  return Number.isFinite(num) ? num : 0;
}

function countBugsFromStats(statsArray) {
  if (!Array.isArray(statsArray)) {
    return null;
  }

  return statsArray.reduce((sum, item) => sum + toSafeNumber(item?.value), 0);
}

function countIssuesFromResponse(issueResponse) {
  return getIssueItems(issueResponse).length;
}

function roundScore(value) {
  return Math.round(clamp(toSafeNumber(value), 0, 100));
}


function defaultProjectProgressComponents() {
  return [
    {
      key: "taskStatus",
      label: "Task status",
      value: 0,
      displayValue: "No data",
      detail: "Task status data unavailable.",
      scoreable: false,
    },
    {
      key: "bugStatus",
      label: "Bug status",
      value: 0,
      displayValue: "No data",
      detail: "Bug status data unavailable.",
      scoreable: false,
    },
  ];
}

function sumStatusCounts(byTitle) {
  return Object.values(byTitle || {}).reduce(
    (sum, value) => sum + toSafeNumber(value),
    0
  );
}

function buildByTitleFromLabelsAndData(labels, data) {
  const safeLabels = Array.isArray(labels) ? labels : [];
  const safeData = Array.isArray(data) ? data : [];

  return safeLabels.reduce((acc, rawLabel, index) => {
    const title = stateToTitle(rawLabel);
    const value = toSafeNumber(safeData[index]);

    if (value > 0) {
      acc[title] = (acc[title] || 0) + value;
    }

    return acc;
  }, {});
}

function formatStatusBreakdown(byTitle) {
  return Object.entries(byTitle || {})
    .filter(([, count]) => toSafeNumber(count) > 0)
    .map(([state, count]) => `${state}: ${toSafeNumber(count)}`)
    .join(" · ");
}

function computeProjectProgressData({
  bugStats,
  taskResponse,
  bugByTitle: directBugByTitle,
  taskByTitle: directTaskByTitle,
  bugStatsAvailable = false,
  taskResponseAvailable = false,
}) {
  const bugByTitle =
    directBugByTitle && typeof directBugByTitle === "object"
      ? directBugByTitle
      : buildByTitleFromBugStats(bugStats);

  const taskByTitle =
    directTaskByTitle && typeof directTaskByTitle === "object"
      ? directTaskByTitle
      : buildByTitleFromTasks(taskResponse);

  const totalBugs = sumStatusCounts(bugByTitle);
  const totalTasks = sumStatusCounts(taskByTitle);

  const openBugs = toSafeNumber(bugByTitle.New) + toSafeNumber(bugByTitle.Active);
  const completedBugs =
    toSafeNumber(bugByTitle.Resolved) + toSafeNumber(bugByTitle.Closed);

  const openTasks = toSafeNumber(taskByTitle.New) + toSafeNumber(taskByTitle.Active);
  const completedTasks =
    toSafeNumber(taskByTitle.Resolved) +
    toSafeNumber(taskByTitle.Closed) +
    toSafeNumber(taskByTitle.Done);

  const taskBreakdown = formatStatusBreakdown(taskByTitle);
  const bugBreakdown = formatStatusBreakdown(bugByTitle);

  let taskValue = 0;
  let taskDetail = "Task status data unavailable.";
  let taskDisplayValue = "No data";
  let taskScoreable = false;

  if (taskResponseAvailable) {
    taskScoreable = true;
    taskDisplayValue = `${totalTasks} ${totalTasks === 1 ? "task" : "tasks"}`;

    if (totalTasks > 0) {
      taskValue = roundScore((completedTasks / totalTasks) * 100);
      taskDetail = taskBreakdown || `${completedTasks} completed · ${openTasks} open`;
    } else {
      taskValue = 100;
      taskDetail = "No tasks found for this build.";
    }
  }

  let bugValue = 0;
  let bugDetail = "Bug status data unavailable.";
  let bugDisplayValue = "No data";
  let bugScoreable = false;

  if (bugStatsAvailable) {
    bugScoreable = true;
    bugDisplayValue = `${totalBugs} ${totalBugs === 1 ? "bug" : "bugs"}`;

    if (totalBugs > 0) {
      bugValue = roundScore((completedBugs / totalBugs) * 100);
      bugDetail = bugBreakdown || `${completedBugs} resolved/closed · ${openBugs} open`;
    } else {
      bugValue = 100;
      bugDetail = "No bugs found for this build.";
    }
  }

  const components = [
    {
      key: "taskStatus",
      label: "Task status",
      value: taskValue,
      displayValue: taskDisplayValue,
      detail: taskDetail,
      scoreable: taskScoreable,
    },
    {
      key: "bugStatus",
      label: "Bug status",
      value: bugValue,
      displayValue: bugDisplayValue,
      detail: bugDetail,
      scoreable: bugScoreable,
    },
  ];

  const scoreableComponents = components.filter((component) => component.scoreable);
  const score =
    scoreableComponents.length > 0
      ? scoreableComponents.reduce(
          (sum, component) => sum + component.value,
          0
        ) / scoreableComponents.length
      : 0;

  return {
    available: true,
    score: roundScore(score),
    components,
    skipped: [],
    totalBugs,
    totalTasks,
    bugStatsAvailable,
    taskResponseAvailable,
  };
}

function ProjectProgressCard({ data }) {
  const score = toSafeNumber(data?.score);
  const components =
    Array.isArray(data?.components) && data.components.length > 0
      ? data.components
      : defaultProjectProgressComponents();

  return (
    <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-800">
            Build Progress
          </h3>
        </div>

        <div className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
          {score}% overall
        </div>
      </div>

      <div className="mt-5">
        <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {components.map((component) => (
          <div
            key={component.key}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-700">
                {component.label}
              </span>

              <span className="text-sm font-semibold text-gray-900">
                {component.displayValue || `${component.value}%`}
              </span>
            </div>

            <p className="mt-1 text-xs text-gray-500">{component.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function isPageReload() {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return false;
  }

  const navigationEntries =
    typeof performance.getEntriesByType === "function"
      ? performance.getEntriesByType("navigation")
      : [];

  if (Array.isArray(navigationEntries) && navigationEntries.length > 0) {
    return navigationEntries[0]?.type === "reload";
  }

  const legacyNavigationType = performance.navigation?.type;

  return legacyNavigationType === 1;
}

function LoadingDialog({
  open = true,
  title = "Loading",
  message = "Please wait...",
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-hidden="false"
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loading-dialog-title"
        aria-describedby="loading-dialog-desc"
        className="relative w-[92%] max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-800"
            aria-hidden="true"
          />

          <div className="min-w-0">
            <div
              id="loading-dialog-title"
              className="text-sm font-semibold text-gray-900"
            >
              {title}
            </div>

            <div
              id="loading-dialog-desc"
              className="mt-0.5 text-xs text-gray-600"
            >
              {message}
            </div>
          </div>
        </div>

        <div className="sr-only" aria-live="polite">
          Loading in progress
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({
  backendApiToken,
  project,
  build,
  buildName,
  setActiveTab,
  role,
  notifications = [],
  onDismissAssignmentAlert,
}) {
  /**
   * We are not using frontend token here because backend should acquire
   * ADO token using OboTokenService.
   */
  const authToken = backendApiToken;

  const [stats, setStats] = useState(DEFAULT_STATS);
  const [testProgress, setTestProgress] = useState(null);
  const [testProgressRequiresBasicAccess, setTestProgressRequiresBasicAccess] = useState(false);

  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [bugChartData, setBugChartData] = useState([]);
  const [bugChartLabels, setBugChartLabels] = useState([]);


  const [issueStatusError, setIssueStatusError] = useState("");
  const [issueChartData, setIssueChartData] = useState([]);
  const [issueChartLabels, setIssueChartLabels] = useState([]);

  const [taskStatusError, setTaskStatusError] = useState("");
  const [taskChartData, setTaskChartData] = useState([]);
  const [taskChartLabels, setTaskChartLabels] = useState([]);

  const [severityChartData, setSeverityChartData] = useState([]);
  const [severityChartLabels, setSeverityChartLabels] = useState([]);

  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState("");
  const [dailyBugStatusData, setDailyBugStatusData] = useState([]);

  const [category, setCategory] = useState("");
  const [links, setLinks] = useState("");

  const [scoreData, setScoreData] = useState(null);

  const [bugs, setBugs] = useState([]);
  const [bugsLoading, setBugsLoading] = useState(false);
  const [bugsError, setBugsError] = useState("");

  const [projectProgressData, setProjectProgressData] = useState({
    available: false,
    score: null,
    components: [],
    skipped: [],
  });

  const isBuildAvailable =
    project &&
    buildName &&
    buildName !== "__NO_BUILDS__" &&
    build &&
    build !== "__NO_BUILDS__" &&
    build !== "No Builds Available";

  const cacheKey = useMemo(() => {
    return `dashboard:${ORGANIZATION}:${project || "none"}:${buildName || "none"}:${build || "none"}`;
  }, [project, buildName, build]);
  
  const projectProgressCacheKey = useMemo(() => {
    return `dashboard:project-progress:${ORGANIZATION}:${project || "none"}:${buildName || "none"}:${build || "none"}`;
  }, [project, buildName, build]);
  const recentBugsCacheKey = useMemo(() => {
    return `dashboard:recent-bugs:${ORGANIZATION}:${project || "none"}`;
  }, [project]);

  const shouldBypassCacheOnFirstLoadRef = useRef(isPageReload());

  const visibleProjectProgressData = useMemo(() => {
    if (!project || !isBuildAvailable) {
      return {
        available: false,
        score: null,
        components: [],
        skipped: [],
      };
    }

    const bugByTitle = buildByTitleFromLabelsAndData(
      bugChartLabels,
      bugChartData
    );

    const taskByTitle = buildByTitleFromLabelsAndData(
      taskChartLabels,
      taskChartData
    );

    const bugStatsAvailable =
      Array.isArray(bugChartLabels) && bugChartLabels.length > 0;

    const taskResponseAvailable =
      Array.isArray(taskChartLabels) && taskChartLabels.length > 0;

    return computeProjectProgressData({
      bugByTitle,
      taskByTitle,
      bugStatsAvailable,
      taskResponseAvailable,
    });
  }, [
    project,
    isBuildAvailable,
    bugChartLabels,
    bugChartData,
    taskChartLabels,
    taskChartData,
  ]);

  useEffect(() => {
    setScoreData(null);
    setScoreError("");
  }, [project, buildName, build]);

  useEffect(() => {
    if (!project || !isBuildAvailable || !authToken) {
      setBugChartData([]);
      setBugChartLabels([]);
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    (async () => {
      try {
        const bugStatsResponse = await fetchBugStats(
          undefined,
          ORGANIZATION,
          project,
          authToken,
          null,
          buildName || "",
          controller.signal,
          build || ""
        );

        if (!mounted) {
          return;
        }

        const bugItems = Array.isArray(bugStatsResponse)
          ? bugStatsResponse
          : [];

        const visibleBugItems = bugItems.filter(
          (item) =>
            item?.title &&
            Number.isFinite(Number(item?.value)) &&
            Number(item.value) > 0
        );

        const labels = visibleBugItems.map((item) => item.title);
        const values = visibleBugItems.map((item) => Number(item.value));

        setStats(bugStatsResponse);
        setBugChartLabels(labels);
        setBugChartData(values);

        const existingCache = loadCache(cacheKey) || {};

        saveCache(cacheKey, {
          ...existingCache,
          stats: bugStatsResponse,
          bugChartLabels: labels,
          bugChartData: values,
        });
      } catch (e) {
        if (!mounted || e?.name === "AbortError") {
          return;
        }

        if (isUnauthorizedError(e)) {
          return;
        }
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    project,
    build,
    buildName,
    authToken,
    isBuildAvailable,
    cacheKey,
  ]);

  useEffect(() => {
    if (!project || !isBuildAvailable || !authToken) {
      setIssueChartData([]);
      setIssueChartLabels([]);
      setIssueStatusError("");
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    (async () => {
      try {
        const issueResponse = await fetchIssues(
          undefined,
          ORGANIZATION,
          project,
          buildName || "",
          build || "",
          authToken,
          controller.signal
        );

        if (!mounted) {
          return;
        }

        const byTitle = buildByTitleFromIssues(issueResponse);
        const preferredOrder = ["New", "Active", "Resolved", "Closed"];

        const labels = [
          ...preferredOrder.filter((label) => Number(byTitle[label] || 0) > 0),
          ...Object.keys(byTitle).filter(
            (label) =>
              !preferredOrder.includes(label) &&
              Number(byTitle[label] || 0) > 0
          ),
        ];

        const values = labels.map((label) => Number(byTitle[label] || 0));

       

        setIssueChartLabels(labels);
        setIssueChartData(values);
        setIssueStatusError("");

        const existingCache = loadCache(cacheKey) || {};

        saveCache(cacheKey, {
          ...existingCache,
          issueChartLabels: labels,
          issueChartData: values,
        });
      } catch (e) {
        if (!mounted || e?.name === "AbortError") {
          return;
        }

        console.error("[Issue Pie isolated] request failed:", e);

        setIssueChartLabels([]);
        setIssueChartData([]);

        if (isUnauthorizedError(e)) {
          setIssueStatusError("Session expired or unauthorized.");
          return;
        }

        setIssueStatusError(e?.message || "Failed to load issue status data");
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    project,
    build,
    buildName,
    authToken,
    isBuildAvailable,
    cacheKey,
  ]);

  useEffect(() => {
    if (!project || !isBuildAvailable || !authToken) {
      setTaskChartData([]);
      setTaskChartLabels([]);
      setTaskStatusError("");
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    (async () => {
      try {
        const taskResponse = await fetchTasks(
          undefined,
          ORGANIZATION,
          project,
          buildName || "",
          build || "",
          authToken,
          controller.signal
        );

        if (!mounted) {
          return;
        }

        const byTitle = buildByTitleFromTasks(taskResponse);
        const preferredOrder = ["New", "Active", "Resolved", "Closed"];
        const labels = [
          ...preferredOrder.filter((label) => Number(byTitle[label] || 0) > 0),
          ...Object.keys(byTitle).filter(
            (label) =>
              !preferredOrder.includes(label) &&
              Number(byTitle[label] || 0) > 0
          ),
        ];
        const values = labels.map((label) => Number(byTitle[label] || 0));

        

        setTaskChartLabels(labels);
        setTaskChartData(values);
        setTaskStatusError("");

        const existingCache = loadCache(cacheKey) || {};
        saveCache(cacheKey, {
          ...existingCache,
          taskChartLabels: labels,
          taskChartData: values,
        });
      } catch (e) {
        if (!mounted || e?.name === "AbortError") {
          return;
        }

        console.error("[Task Pie isolated] request failed:", e);

        setTaskChartLabels([]);
        setTaskChartData([]);

        if (isUnauthorizedError(e)) {
          setTaskStatusError("Session expired or unauthorized.");
          return;
        }

        setTaskStatusError(e?.message || "Failed to load task status data");
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    project,
    build,
    buildName,
    authToken,
    isBuildAvailable,
    cacheKey,
  ]);

  useEffect(() => {
    if (!project || !isBuildAvailable || !authToken) {
      setSeverityChartData([]);
      setSeverityChartLabels([]);
      return;
    }

    const controller = new AbortController();
    let mounted = true;

    (async () => {
      try {
        const severityResponse = await fetchBugSeverity({
          authToken,
          organization: ORGANIZATION,
          project,
          tagName: build || "",
          buildName: buildName || "",
          signal: controller.signal,
        });

        if (!mounted) {
          return;
        }

        let labels = [];
        const values = buildSeverityChartData(severityResponse, (nextLabels) => {
          labels = Array.isArray(nextLabels) ? nextLabels : [];
        });

        setSeverityChartLabels(labels);
        setSeverityChartData(Array.isArray(values) ? values : []);

        const existingCache = loadCache(cacheKey) || {};
        saveCache(cacheKey, {
          ...existingCache,
          severityChartLabels: labels,
          severityChartData: Array.isArray(values) ? values : [],
        });
      } catch (e) {
        if (!mounted || e?.name === "AbortError") {
          return;
        }

        if (isUnauthorizedError(e)) {
          return;
        }

        setSeverityChartLabels([]);
        setSeverityChartData([]);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    project,
    build,
    buildName,
    authToken,
    isBuildAvailable,
    cacheKey,
  ]);

  function resetDashboardState({ preserveBugStats = false } = {}) {
    if (!preserveBugStats) {
      setStats(DEFAULT_STATS);
    }

    setDailyBugStatusData([]);

    setScoreData(null);
    setScoreError("");
    setScoreLoading(false);

    setTestProgress(null);
    setTestProgressRequiresBasicAccess(false);

    setProjectProgressData({
      available: false,
      score: null,
      components: [],
      skipped: [],
    });

    setErr(null);
    setLoading(false);
    setIsLoading(false);

    setCategory("");
    setLinks("");
  }

  const handleFetchConfidenceScore = async () => {
    if (!project) {
      return;
    }

    try {
      setScoreLoading(true);
      setScoreError("");

      const confidenceScore = await fetchConfidenceScore({
        apiBase: `${BASE_URL}/api/confidence/calculate`,
        authToken: backendApiToken,
        organization: ORGANIZATION,
        project,
        tag: build && build !== "__NO_BUILDS__" ? build : "",
        buildName: buildName && buildName !== "__NO_BUILDS__" ? buildName : "",
      });

 
      const finalScore = Number.isFinite(confidenceScore)
        ? confidenceScore
        : null;

      setScoreData(finalScore);

      const existingCache = loadCache(cacheKey) || {};

      saveCache(cacheKey, {
        ...existingCache,
        scoreData: finalScore,
      });
    } catch (e) {
      if (isUnauthorizedError(e)) {
        setScoreData(null);
        return;
      }

      setScoreError(e?.message || "Failed to fetch confidence score");
      setScoreData(null);
    } finally {
      setScoreLoading(false);
    }
  };

  useEffect(() => {
    if (!project || !isBuildAvailable) {
      resetDashboardState();
      return;
    }

    const shouldBypassCacheOnFirstLoad = shouldBypassCacheOnFirstLoadRef.current;

    if (shouldBypassCacheOnFirstLoad) {
      removeCache(cacheKey);
      removeCache(projectProgressCacheKey);
      shouldBypassCacheOnFirstLoadRef.current = false;
    }

    const cached = shouldBypassCacheOnFirstLoad ? null : loadCache(cacheKey);

    const hasCachedDashboardData = Boolean(cached);

    const emptyProjectProgress = {
      available: false,
      score: null,
      components: [],
      skipped: [],
    };

    if (cached) {
      setStats(cached.stats || DEFAULT_STATS);

      setTaskChartData(cached.taskChartData || []);
      setTaskChartLabels(cached.taskChartLabels || []);

      setSeverityChartData(cached.severityChartData || []);
      setSeverityChartLabels(cached.severityChartLabels || []);

      setDailyBugStatusData(cached.dailyBugStatusData || []);

      setScoreData(typeof cached.scoreData === "number" ? cached.scoreData : null);

      setTestProgress(cached.testProgress || null);
      setTestProgressRequiresBasicAccess(false);
      setProjectProgressData(emptyProjectProgress);
    } else {
      setStats(DEFAULT_STATS);

      setDailyBugStatusData([]);
      setTestProgress(null);
    setTestProgressRequiresBasicAccess(false);
      setProjectProgressData(emptyProjectProgress);
    }

    if (!authToken) {
      setLoading(false);
      setIsLoading(false);
      setBugsLoading(false);
      setErr(null);
      return;
    }
 

    const controller = new AbortController();

    let mounted = true;

    setIsLoading(!hasCachedDashboardData);
    setLoading(!hasCachedDashboardData);
    setErr(null);

    async function loadDashboardData() {
      try {
        const today = new Date();
        const endDate = today.toISOString().split("T")[0];

        const start = new Date(today);
        start.setDate(start.getDate() - 7);

        const startDate = start.toISOString().split("T")[0];

        

        const [
          dashboardMetricsResult,
          bugStatsResult,
          testProgressResult,
          dailyBugStatsResult,
          severityResult,
          projectDashboardMetricsResult,
          projectIssueResult,
          projectTaskResult,
        ] = await Promise.allSettled([
          build
            ? fetchDashboardMetrics(
                {
                  organization: ORGANIZATION,
                  project,
                  tagName: build,
                  buildName,
                },
                {
                  authToken,
                  signal: controller.signal,
                }
              )
            : Promise.resolve(null),

          fetchBugStats(
          undefined,
          ORGANIZATION,
          project,
          authToken,
          null,
          buildName || "",
          controller.signal,
          build || ""
        ),

          fetchTestProgress(
            undefined,
            ORGANIZATION,
            project,
            authToken,
            build || "",
            buildName,
            controller.signal
          ),

          build
            ? fetchDailyBugStats({
              authToken,
              organization: ORGANIZATION,
              project,
              startDate,
              endDate,
              tagName: build,
              buildName,
              signal: controller.signal,
            })
            : Promise.resolve(null),

          build
            ? fetchBugSeverity({
                authToken,
                organization: ORGANIZATION,
                project,
                tagName: build,
                buildName,
                signal: controller.signal,
              })
            : Promise.resolve(null),

          fetchDashboardMetrics(
            {
              organization: ORGANIZATION,
              project,
              tagName: build,
              buildName,
              signal: controller.signal,
            }
          ),

          fetchIssues(
            undefined,
            ORGANIZATION,
            project,
            buildName || "",
            build || "",
            authToken,
            controller.signal
          ),

          fetchTasks(
            undefined,
            ORGANIZATION,
            project,
            buildName || "",
            build || "",
            authToken,
            controller.signal
          ),

        ]);

        if (!mounted) {
          return;
        }

        const unauthorizedResult = [
          dashboardMetricsResult,
          bugStatsResult,
          dailyBugStatsResult,
          severityResult,
          projectDashboardMetricsResult,
          projectIssueResult,
          projectTaskResult,
        ].find(
          (r) =>
            r.status === "rejected" &&
            (isUnauthorizedError(r.reason) || r.reason?.status === 403)
        );

        if (unauthorizedResult) {
          removeByPrefix("dashboard:");
          resetDashboardState({ preserveBugStats: true });
          setErr("Session expired or unauthorized. Please sign in again.");
          return;
        }

        const bugStatsAvailable =
          bugStatsResult.status === "fulfilled" &&
          (
            Array.isArray(bugStatsResult.value) ||
            Array.isArray(bugStatsResult.value?.value)
          );

        const bugStats = bugStatsAvailable
          ? bugStatsResult.value
          : DEFAULT_STATS;

        setStats(bugStats);

        const dashboardMetrics =
          dashboardMetricsResult.status === "fulfilled"
            ? dashboardMetricsResult.value
            : null;

        const testProgressForbidden =
          testProgressResult.status === "rejected" &&
          testProgressResult.reason?.status === 403;

        const tpDataRes =
          testProgressResult.status === "fulfilled"
            ? testProgressResult.value
            : null;

        const dailyBugStatsDatas =
          dailyBugStatsResult.status === "fulfilled"
            ? dailyBugStatsResult.value
            : null;

        const severityRes =
          severityResult.status === "fulfilled" ? severityResult.value : null;

        const projectBugStatsAvailable = bugStatsAvailable;
        const projectBugStats = bugStats;

        const projectDashboardMetrics =
          projectDashboardMetricsResult.status === "fulfilled"
            ? projectDashboardMetricsResult.value
            : null;

        const projectIssueResponseAvailable =
          projectIssueResult.status === "fulfilled";

        const projectIssueResponse = projectIssueResponseAvailable
          ? projectIssueResult.value
          : null;

        const projectTaskResponseAvailable =
          projectTaskResult.status === "fulfilled";

        const projectTaskResponse = projectTaskResponseAvailable
          ? projectTaskResult.value
          : null;

        let sevLabelsLocal = [];
        let sevDataLocal = [];

        if (severityRes) {
          sevDataLocal = buildSeverityChartData(severityRes, (labels) => {
            sevLabelsLocal = Array.isArray(labels) ? labels : [];
          });
        } else {
          setSeverityChartLabels([]);
        }

        setCategory("");
        setLinks("");

        setTestProgress(tpDataRes);
        setTestProgressRequiresBasicAccess(testProgressForbidden);
        setDailyBugStatusData(dailyBugStatsDatas?.value || []);

        saveCache(cacheKey, {
          stats: bugStats,

          dailyBugStatusData: dailyBugStatsDatas?.value || [],

          testProgress: tpDataRes,
        });

      } catch (e) {
        if (!mounted) {
          return;
        }

        if (e?.name === "AbortError") {
          return;
        }

        const message = e?.message || "Dashboard fetch failed";

        resetDashboardState({ preserveBugStats: true });
        setErr(message);
      } finally {
        if (!mounted) {
          return;
        }

        setLoading(false);
        setIsLoading(false);
      }
    }

    loadDashboardData();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [
    cacheKey,
    projectProgressCacheKey,
    project,
    build,
    buildName,
    authToken,
    isBuildAvailable,
  ]);

  useEffect(() => {
    if (!project) {
      setBugs([]);
      setBugsError("");
      setBugsLoading(false);
      removeCache(recentBugsCacheKey);
      return;
    }

    if (!authToken) {
      setBugsLoading(false);
      return;
    }

    const cached = loadCache(recentBugsCacheKey);

    if (cached) {
      setBugs(Array.isArray(cached.bugs) ? cached.bugs : []);
      setBugsError(cached.bugsError || "");
    } else {
      setBugs([]);
      setBugsError("");
    }

    const controller = new AbortController();
    let mounted = true;

    setBugsLoading(!Array.isArray(cached?.bugs));

    (async () => {
      try {
        const recentBugs = await fetchRecentBugs({
          authToken,
          organization: ORGANIZATION,
          project,
          signal: controller.signal,
        });

        if (!mounted) {
          return;
        }

        const bugsList = Array.isArray(recentBugs) ? recentBugs : [];

        setBugs(bugsList);
        setBugsError("");

        saveCache(recentBugsCacheKey, {
          bugs: bugsList,
          bugsError: "",
        });
      } catch (e) {
        if (!mounted || e?.name === "AbortError") {
          return;
        }

        if (isUnauthorizedError(e)) {
          return;
        }

        const message = e?.message || "Failed to load bugs";

        setBugs([]);
        setBugsError(message);

        saveCache(recentBugsCacheKey, {
          bugs: [],
          bugsError: message,
        });
      } finally {
        if (!mounted) {
          return;
        }

        setBugsLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [recentBugsCacheKey, project, authToken]);


  const RECENT_VISIBLE = 5;
  const RECENT_ITEM_H = 92;
  const RECENT_GAP = 16;

  const RECENT_LIST_H =
    RECENT_VISIBLE * RECENT_ITEM_H + (RECENT_VISIBLE - 1) * RECENT_GAP;

  const assignmentAlert = useMemo(() => {
    if (String(role || "").toUpperCase() !== "QAENGINEER") {
      return null;
    }

    return (
      (Array.isArray(notifications) ? notifications : []).find((n) => {
        const message = String(n?.message || "");

        return (
          n?.type === "QA_ASSIGNMENT" &&
          !n?.isRead &&
          /is assigned to you for testing\./i.test(message)
        );
      }) || null
    );
  }, [notifications, role]);

  return (
    <div className="min-h-screen bg-gray-50">
      <LoadingDialog
        open={isLoading}
        title="Please wait"
        message="Fetching dashboard data..."
      />

      <div className="mx-auto max-w-7xl px-6 py-6 grid grid-cols-10 gap-6">
        <main className="col-span-10 md:col-span-9 lg:col-span-10">
          <section className="grid grid-cols-1 lg:grid-cols-1 md:grid-cols-1 gap-4">
            {assignmentAlert && (
              <div className="rounded-xl border border-blue-200 bg-blue-100 px-4 py-3 text-blue-900 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 text-sm font-medium leading-6">
                  {assignmentAlert.message}
                </div>

                <button
                  type="button"
                  onClick={() => onDismissAssignmentAlert?.(assignmentAlert.id)}
                  className="shrink-0 text-green-900 hover:text-green-700 text-xl leading-none font-semibold"
                  aria-label="Dismiss assignment alert"
                  title="Dismiss"
                >
                  &times;
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <RecentBuildsRow
                onView={() => {}}
                onRetry={() => {}}
                onShowAll={() => setActiveTab("Build history")}
                role={role}
                requiresBasicAccess={testProgressRequiresBasicAccess}
              />
            </div>
          </section>

          <section className="mt-6">
            <ProjectProgressCard data={visibleProjectProgressData} />
          </section>

          <section className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="rounded-xl bg-white p-6 shadow-lg border border-gray-100 lg:col-span-3">
              <h3 className="text-xl font-semibold text-gray-800">
                Status Distribution
              </h3>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-16">
                <PieChart
                  data={bugChartData}
                  labels={bugChartLabels}
                  title="Bug Status"
                  type="bugs"
                />

                <PieChart
                  data={issueChartData}
                  labels={issueChartLabels}
                  title="Issue Status"
                  type="issues"
                  emptyMessage={issueStatusError || "No issue data available"}
                />

                <PieChart
                  data={taskChartData}
                  labels={taskChartLabels}
                  title="Task Status"
                  type="tasks"
                  emptyMessage={taskStatusError || "No task data available"}
                />

                <PieChart
                  data={severityChartData}
                  labels={severityChartLabels}
                  title="Bug Severity Status"
                  type="severity"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="grid grid-row-2 gap-6">
                <div className="rounded-xl row-span-1 bg-white p-6 shadow-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-800">
                      Project's Bugs Activity
                    </h3>

                    <button
                      onClick={devOpsRedirect}
                      className="text-sm cursor-pointer text-gray-600 hover:text-gray-800 inline-flex items-center gap-1"
                    >
                      View All
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="M7 5l5 5-5 5"
                          stroke="#6b7280"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                    <div className="mt-4">
                      <div className="flex flex-col gap-4">
                      {bugsLoading && (
                        <div className="h-full flex items-center justify-center text-sm text-gray-500">
                          Loading recent bugs…
                        </div>
                      )}

                      {!bugsLoading && bugsError && (
                        <div className="h-full flex items-center justify-center text-sm text-rose-600">
                          {bugsError}
                        </div>
                      )}

                      {!bugsLoading && !bugsError && bugs.length === 0 && (
                        <div className="h-full flex items-center justify-center text-sm text-gray-500">
                          No recent bugs found.
                        </div>
                      )}

                      {!bugsLoading &&
                        !bugsError &&
                        bugs.length > 0 &&
                        bugs.map((b) => (
                          <div
                            key={b.workItemId}
                            className="rounded-lg border border-gray-200 p-4 hover:shadow-lg transition"
                            style={{ minHeight: RECENT_ITEM_H }}
                          >
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                                #{b.workItemId}
                              </span>

                              <span
                                className={`px-2 py-0.5 rounded ${stateBadgeClass(
                                  b.state
                                )}`}
                              >
                                {b.state || "—"}
                              </span>
                            </div>

                            <div
                              className="mt-2 text-sm font-medium text-gray-800 whitespace-nowrap overflow-hidden"
                              title={b.title || "—"}
                            >
                              {truncateWithTwoDots(b.title || "—")}
                            </div>

                            <div className="mt-1 text-xs text-gray-500">
                              Assigned to: {b.assignedTo || "—"} · Changed:{" "}
                              {formatDateTime(b.changedDate)}
                            </div>
                            
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center pt-5 pb-5 row-span-1 rounded-xl bg-white p-6 shadow-lg border border-gray-100">
                  <div className="flex items-center justify-between w-full mb-4">
                    <h1 className="font-semibold">Build Confidence Score</h1>

                    <button
                      onClick={handleFetchConfidenceScore}
                      disabled={scoreLoading || !authToken || !project}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        scoreLoading || !authToken || !project
                          ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                          : "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
                      }`}
                    >
                      {scoreLoading ? "Generating..." : "Generate Score"}
                    </button>
                  </div>

                  <div className="relative z-0">
                    <AIScoreCircle
                      score={Number(scoreData) || 0}
                      size={180}
                      stroke={14}
                      showDelta
                      delta={+2.4}
                      activetb={() => setActiveTab("QA Engineer")}
                    />
                  </div>

                  {scoreError && (
                    <p className="mt-3 text-sm text-red-600 text-center">
                      {scoreError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="w-full col-span-3">
              <BarGraph
                data={dailyBugStatusData.map((d) => ({
                  name: String(d.date || "").split("T")[0],
                  raised: d.createdCount,
                  resolved: d.resolvedCount,
                  closed: d.closedCount,
                }))}
                title="Daily Bug Status (Last 7 Days)"
                stacked={true}
                closedName="Closed"
                colors={["#ef4444", "#10B981", "#6B7280"]}
              />
            </div>

            <div className="w-full col-span-2">
              <TestProgress
                tests={testProgress}
                project={project}
                buildName={buildName}
                version={build}
                role={role}
                requiresBasicAccess={testProgressRequiresBasicAccess}
              />
            </div>
          </section>

          <section className="mt-6 flex flex-cols- md:grid-cols-5 gap-6">
            <div className="w-full">
              <CentralRepository
                key={project || "central-repository"}
                projectName={project}
                backendApiToken={backendApiToken}
              />
            </div>
          </section>

          {err && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {err}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}









