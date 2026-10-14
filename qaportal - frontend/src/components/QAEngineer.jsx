// QAEngineer.js
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { generateQASignoffPdf } from "../api/generateSignoffPdf";
import { saveSignoff, fetchQAPrivilegedNamesAndRoles } from "../api/signoffApi";
import { createNotification } from "../api/notificationsApi";
import { fetchFinalBuilds, getBuildById } from "../api/fetchBuildsApi";
import { fetchDashboardMetrics, fetchDashboardWorkitems } from "../api/pdfApi";
import { fetchBugStats } from "../api/fetchBugs";
import { fetchIssues } from "../api/fetchIssues";
import { fetchBugSeverity } from "../api/fetchBugSeverity";
import { fetchConfidenceScore } from "../api/fetchConfidenceScore";
import { getAdoTokenAsync, getBackendApiTokenAsync } from "../config/msalConfig";
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";


function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function normalizeRole(role) {
  return String(role || "")
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function compactIdentity(value) {
  return normalizeIdentity(value).replace(/[\s._-]+/g, "");
}

function extractEmail(value) {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

function isUnassignedTesterValue(value) {
  const normalized = normalizeIdentity(value);
  return !normalized || ["- na -", "-na-", "na", "n/a", "not assigned"].includes(normalized);
}

function isCompletedBuildStatus(value) {
  const normalized = normalizeIdentity(value).replace(/[\s_-]+/g, "");
  return ["completed", "complete", "testingcompleted", "testcompleted", "qacompleted"].includes(normalized);
}

function getBuildTestingStatus(build) {
  const source = build?.data ?? build;

  if (
    source?.isTestingCompleted === true ||
    source?.testingCompleted === true ||
    source?.testCompletionDate
  ) {
    return "Completed";
  }

  return String(
    source?.testingStatus ??
      source?.testStatus ??
      source?.status ??
      source?.testing_status ??
      source?.test_status ??
      source?.testingState ??
      source?.testState ??
      ""
  ).trim();
}


function buildRecordId(...parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}

function isMatchingBuildRecord(item, projectName, buildName, version) {
  const selectedProject = normalizeIdentity(projectName);
  const selectedBuild = normalizeIdentity(buildName);
  const selectedVersion = normalizeIdentity(version);

  return (
    normalizeIdentity(item?.projectName) === selectedProject &&
    normalizeIdentity(item?.builds || item?.buildName) === selectedBuild &&
    normalizeIdentity(item?.buildVersion || item?.version) === selectedVersion
  );
}


const inputBase =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500";

const textareaBase =
  "w-full min-h-[110px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500";

const TEXT_FIELD_MAX_LENGTH = 600;

function RequiredMark() {
  return <span className="text-rose-600 ml-1">*</span>;
}

const Section = React.memo(function Section({ title, children, right }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h3>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
});

const Field = React.memo(function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between gap-3">
        <label className="text-sm font-medium text-gray-800">
          {label}
          {required ? <RequiredMark /> : null}
        </label>
        {hint ? <span className="text-xs text-gray-500">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
});

function useOutsideClick(ref, handler, when = true) {
  useEffect(() => {
    if (!when) return;
    const onDown = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      handler?.();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [ref, handler, when]);
}

function isValidHttpUrl(value) {
  const s = String(value ?? "").trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Optional: pull user name/role from storage if you want */



function stateToTitle(s) {
  if (!s) return "Unknown";
  const n = String(s).trim().toLowerCase();
  if (n === "new") return "New";
  if (n === "active") return "Active";
  if (n === "resolved") return "Resolved";
  if (n === "closed") return "Closed";
  if (n === "done") return "Done";
  if (n === "removed") return "Removed";
  if (n === "critical") return "Critical";
  if (n === "high") return "High";
  if (n === "medium") return "Medium";
  if (n === "low") return "Low";
  return String(s).charAt(0).toUpperCase() + String(s).slice(1);
}

function toPdfCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

function hasPositiveCounts(counts) {
  return Object.values(counts || {}).some((value) => toPdfCount(value) > 0);
}

function onlyPositiveCounts(counts = {}) {
  return Object.entries(counts || {}).reduce((acc, [key, value]) => {
    const count = toPdfCount(value);
    if (count > 0) {
      const label = stateToTitle(key);
      acc[label] = (acc[label] || 0) + count;
    }
    return acc;
  }, {});
}

function buildBugCountsFromMetrics(api) {
  const reported = toPdfCount(api?.bugs?.reported);
  const active = toPdfCount(api?.bugs?.active);
  const closed = toPdfCount(api?.bugs?.closed);
  const resolved = toPdfCount(api?.bugs?.resolved);
  const known = active + closed + resolved;
  const newCount = Math.max(0, reported - known);

  return onlyPositiveCounts({ New: newCount, Active: active, Resolved: resolved, Closed: closed });
}

function buildIssueCountsFromMetrics(api) {
  return onlyPositiveCounts({
    Active: api?.issues?.active,
    Closed: api?.issues?.closed,
  });
}

function normalizeSeverityCounts(input) {
  const source = input?.severityCounts || input?.severity || input?.data || input || {};
  return onlyPositiveCounts(source);
}


// statsArray: [{ title: "New", value: 10 }, ...]
function buildByTitleFromBugStats(statsArray) {
  return (statsArray || []).reduce((acc, s) => {
    if (!s || !s.title) return acc;
    acc[s.title] = (acc[s.title] || 0) + (s.value ?? 0);
    return acc;
  }, {});
}

// issueResponse from /api/issues
function buildByTitleFromIssues(issueResponse, fallbackCounts = {}) {
  const list = Array.isArray(issueResponse?.value)
    ? issueResponse.value
    : Array.isArray(issueResponse)
      ? issueResponse
      : Array.isArray(issueResponse?.items)
        ? issueResponse.items
        : Array.isArray(issueResponse?.workItems)
          ? issueResponse.workItems
          : [];

  if (list.length > 0) {
    return list.reduce((acc, it) => {
      const rawState =
        it?.State ??
        it?.state ??
        it?.fields?.["System.State"] ??
        it?.fields?.["system.state"] ??
        "Unknown";

      const title = stateToTitle(rawState);
      acc[title] = (acc[title] || 0) + 1;

      return acc;
    }, {});
  }

  const source =
    issueResponse?.issues ??
    issueResponse?.improvements ??
    issueResponse?.workItems?.improvements ??
    fallbackCounts ??
    {};

  const active = Number(source?.active ?? source?.Active ?? 0);
  const closed = Number(source?.closed ?? source?.Closed ?? 0);
  const resolved = Number(source?.resolved ?? source?.Resolved ?? 0);
  const newCount = Number(source?.new ?? source?.New ?? 0);

  const result = {};

  if (newCount > 0) result.New = newCount;
  if (active > 0) result.Active = active;
  if (resolved > 0) result.Resolved = resolved;
  if (closed > 0) result.Closed = closed;

  return result;
}

function buildIssueChartDataFromByTitle(byTitle, setLabels) {
  if (!byTitle || typeof byTitle !== "object") {
    // console.log("Invalid issue data:", byTitle);
    setLabels([]);
    // setColors([]);
    return [];
  }



  // Convert object → array of { label, value }
  const items = Object.entries(byTitle).map(([state, count]) => ({
    label: state,
    value: Number(count) || 0,
    // color: ISSUE_COLOR_MAP[state] || ISSUE_COLOR_MAP["Unknown"],
  }));

  // Filter out zero-count categories
  const filtered = items.filter((item) => item.value > 0);

  // console.log("Filtered ISSUE items:", filtered);

  const labels = filtered.map((x) => x.label);
  const values = filtered.map((x) => x.value);
  // const colors = filtered.map((x) => x.color);

  // Update React state
  setLabels(labels);
  // setColors(colors);

  // console.log("Issue Labels:", labels);
  // console.log("Issue Values:", values);
  // console.log("Issue Colors:", colors);

  return values; // pie chart numbers
}

function buildTaskCountsFromMetrics(api) {
  const statusCounts = api?.tasks?.statusCounts;

  if (statusCounts && typeof statusCounts === "object") {
    return Object.entries(statusCounts).reduce((acc, [status, count]) => {
      const label = stateToTitle(status);
      acc[label] = (acc[label] || 0) + (Number(count) || 0);
      return acc;
    }, {});
  }

  const total = Number(api?.tasks?.total ?? 0) || 0;
  return total > 0 ? { Unknown: total } : {};
}

function buildChartDataFromByTitle(byTitle, setLabels) {
  // order + labels you want to show
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
    .filter((item) => item.value > 0); // only non-zero buckets

  // console.log("filtered chart items:", filtered);

  const labelsOnly = filtered.map((x) => x.label);
  setLabels(labelsOnly);

  // PieChart expects an array of numbers as `data`
  const valuesOnly = filtered.map((x) => x.value);
  // console.log("labels:", labelsOnly, "values:", valuesOnly);

  return valuesOnly;
}
export default function QAEngineer({
  // qaApprovers = qaApproversSample,
  // buildApprovers = buildApproversSample,

  // optional props if you already have these in app state:
  projectName,
  version,
  build,
  effectiveDate = "",
  verifiedBy = "",
  releasedBy = "",
  assignedTester = "",
  assignedTesterEmail = "",
  buildTestingStatus = "",
  companyName = "NathCorp",
  releaseLabel = "December 2025 Release",

  // adoData = null,
  logoDataUrl = null,
  chartImagesDataUrls = [],
}) {
  const { email, username, role } = useSelector((s) => s.auth);
  const assignedTesterValue = String(assignedTester || "").trim();
  const assignedTesterEmailValue = normalizeIdentity(
    assignedTesterEmail || extractEmail(assignedTesterValue)
  );
  const currentUserEmail = normalizeIdentity(email);
  const currentUserName = compactIdentity(username);
  const assignedTesterName = compactIdentity(
    assignedTesterValue.replace(/\([^)]*\)/g, "")
  );
  const selectedBuildHasAssignedTester = !isUnassignedTesterValue(
    assignedTesterEmailValue || assignedTesterValue
  );
  const selectedBuildAssignedToCurrentUser =
    selectedBuildHasAssignedTester &&
    (assignedTesterEmailValue
      ? assignedTesterEmailValue === currentUserEmail
      : assignedTesterName === currentUserName ||
        normalizeIdentity(assignedTesterValue) === currentUserEmail);
  const signoffAssignmentMessage = !selectedBuildHasAssignedTester
    ? "Selected build is not assigned to a tester."
    : !selectedBuildAssignedToCurrentUser
      ? "Selected build is assigned to another tester."
      : "";
  const today = new Date().toISOString().slice(0, 10);

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [qaApprovers, setQaApprovers] = useState([]);
  const [loadingApprovers, setLoadingApprovers] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [err, setErr] = useState("");
  const [adoData, setAdoData] = useState(null);
  const [success, setSuccess] = useState("");
  const [notifySending, setNotifySending] = useState(false);
  const [defaultQaManager, setDefaultQaManager] = useState("");
  const [defaultQaManagerEmail, setDefaultQaManagerEmail] = useState("");
  const [defaultAdminName, setDefaultAdminName] = useState("");
  const [defaultAdminEmail, setDefaultAdminEmail] = useState("");
  const [adminRecipientEmails, setAdminRecipientEmails] = useState([]);
  const [docApprovedEmails, setDocApprovedEmails] = useState([]);
  const [bugsForPdf, setBugsForPdf] = useState([]);
  const [issueForPdf, setIssueForPdf] = useState({});
  const [tasksForPdf, setTasksForPdf] = useState({});
  const [severityForPdf, setSeverityForPdf] = useState({});
  const [dashboardMetricsForPdf, setDashboardMetricsForPdf] = useState(null);
  const [dashWorkItems, setDashWorkItems] = useState([]);
  const [confidenceScore, setConfidenceScore] = useState(null);
  const [confidenceLoading, setConfidenceLoading] = useState(false);
  const [lowConfidenceConfirmOpen, setLowConfidenceConfirmOpen] = useState(false);
  const [lowConfidenceReason, setLowConfidenceReason] = useState("");
  const [currentBuildStatus, setCurrentBuildStatus] = useState("");
  const ORGANIZATION = import.meta.env.VITE_ORGANIZATION;

  const confidenceBannerClassName = classNames(
    "mt-2 w-full rounded-xl border px-4 py-3 text-sm",
    confidenceScore == null || confidenceLoading
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : confidenceScore > 90
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : confidenceScore < 70
          ? "border-rose-200 bg-rose-50 text-rose-900"
          : "border-orange-200 bg-orange-50 text-orange-900"
  );


  const showConfidenceWarningIcon =
    !confidenceLoading &&
    confidenceScore != null &&
    confidenceScore < 90;

  const confidenceTag = useMemo(() => {
    const normalizedVersion = String(version || "").trim();
    return normalizedVersion && normalizedVersion !== "__NO_BUILDS__"
      ? normalizedVersion
      : "";
  }, [version]);

  useEffect(() => {
    let alive = true;

    if (!projectName || !confidenceTag) {
      setConfidenceScore(null);
      return undefined;
    }

    (async () => {
      try {
        setConfidenceLoading(true);
        const token = await getBackendApiTokenAsync();

        if (!token) {
          if (alive) setConfidenceScore(null);
          return;
        }

        const score = await fetchConfidenceScore({
          authToken: `Bearer ${token}`,
          organization: ORGANIZATION,
          project: projectName,
          tag: confidenceTag,
          buildName: build && build !== "__NO_BUILDS__" ? build : "",
        });

        if (!alive) return;

        setConfidenceScore(Number.isFinite(score) ? score : null);
      } catch (e) {
        if (alive) {
          console.error("Failed to fetch confidence score:", e);
          setConfidenceScore(null);
        }
      } finally {
        if (alive) setConfidenceLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ORGANIZATION, projectName, confidenceTag]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setCurrentBuildStatus(getBuildTestingStatus({ testingStatus: buildTestingStatus }));

    (async () => {
      try {
        setLoadingApprovers(true);

        const list = await fetchQAPrivilegedNamesAndRoles();

        // Build options (name + email) for dropdown/checkbox list
        const options = (list || [])
          .map((u) => {
            const name = (u?.name || u?.username || "").trim();
            const emailVal = (u?.email || "").trim();
            const display = name || emailVal || (u?.username || "").trim();

            if (!display && !emailVal) return null;

            return {
              name: display,
              email: emailVal,
              id: emailVal || display,
            };
          })
          .filter(Boolean);

        // de-dupe by email/id
        const uniqueMap = new Map();
        options.forEach((opt) => {
          if (!uniqueMap.has(opt.id)) {
            uniqueMap.set(opt.id, opt);
          }
        });

        // collect ALL admins
        const admins = (list || []).filter(
          (u) => normalizeRole(u?.role) === "ADMIN"
        );

        const adminNames = admins
          .map((u) => (u?.name || u?.username || u?.email || "").trim())
          .filter(Boolean);

        const adminEmails = admins
          .map((u) => (u?.email || "").trim())
          .filter(Boolean);

        // fallback env admin if not returned by API
        const envAdminName = (import.meta.env.VITE_ADMIN_NAME || "Admin").trim();
        const envAdminEmail = (import.meta.env.VITE_ADMIN_EMAIL || "").trim();

        if (!adminNames.length && envAdminName) {
          adminNames.push(envAdminName);
        }
        if (!adminEmails.length && envAdminEmail) {
          adminEmails.push(envAdminEmail);
        }

        // add all admins into approver options
        adminNames.forEach((name, index) => {
          const email = adminEmails[index] || "";
          const id = email || name;
          if (id && !uniqueMap.has(id)) {
            uniqueMap.set(id, { id, name, email });
          }
        });

        // collect ALL QA managers
        const qaManagers = (list || []).filter(
          (u) => normalizeRole(u?.role) === "QAMANAGER"
        );

        const qaManagerNames = qaManagers
          .map((u) => (u?.name || u?.email || u?.username || "").trim())
          .filter(Boolean);

        const qaManagerEmails = qaManagers
          .map((u) => (u?.email || "").trim())
          .filter(Boolean);

        const unique = Array.from(uniqueMap.values());

        if (alive) {
          setQaApprovers(unique);
          setDefaultQaManager(qaManagerNames[0] || "");
          setDefaultQaManagerEmail(qaManagerEmails[0] || "");
          setDefaultAdminName(adminNames[0] || "");
          setDefaultAdminEmail(adminEmails[0] || "");
          setAdminRecipientEmails(adminEmails);

          // Seed defaults once when the list first arrives.
          setDocApprovedBy((prev) => {
            if (Array.isArray(prev) && prev.length > 0) return prev;
            return Array.from(new Set(qaManagerNames));
          });

          setDocApprovedEmails((prev) => {
            if (Array.isArray(prev) && prev.length > 0) return prev;
            return Array.from(new Set(qaManagerEmails));
          });
        }

        if (!projectName || !version) {
          setAdoData(null);
          setCurrentBuildStatus(getBuildTestingStatus({ testingStatus: buildTestingStatus }));
          return;
        }

        setErr("");
 
        const dashData = await fetchDashboardMetrics({
          organization: ORGANIZATION,
          project: projectName,
          tagName: build,
          buildName: version,
        });

        const dashWorkItems = await fetchDashboardWorkitems({
          organization: ORGANIZATION,
          project: projectName,
          tagName: build,
          buildName: version,
        });

        setDashWorkItems(dashWorkItems);
 
        setDashboardMetricsForPdf(dashData);
        const bugFallbackCounts = buildBugCountsFromMetrics(dashData);
        const issueFallbackCounts = buildIssueCountsFromMetrics(dashData);
        const mapped = mapMetricsToAdoData(dashData);
        setAdoData(mapped);
 
        setBugsForPdf(bugFallbackCounts);
        setIssueForPdf(issueFallbackCounts);
        setTasksForPdf(buildTaskCountsFromMetrics(dashData));

        const id = buildRecordId(projectName, build, version); 

        const backendToken = await getBackendApiTokenAsync();

        const bugStats = await fetchBugStats(
          undefined,
          ORGANIZATION,
          projectName,
          backendToken,
          null,
          build || "",
          controller.signal,
          version
        );

        const safeStats = Array.isArray(bugStats) ? bugStats : [];
        const bugsByTitle = buildByTitleFromBugStats(safeStats);

         setBugsForPdf(hasPositiveCounts(bugsByTitle) ? bugsByTitle : bugFallbackCounts);
 
        let issueResponse = null;

        try {
          const safeBuildName = version && version !== "__NO_BUILDS__" ? version : "";
          const safeTagName = build && build !== "__NO_BUILDS__" ? build : "";

          issueResponse = await fetchIssues(
            undefined,
            ORGANIZATION,
            projectName,
            safeBuildName,
            safeTagName,
            backendToken,
            controller.signal
          );

          const fallbackIssueCounts = {
            Active: Number(dashData?.issues?.active ?? 0),
            Closed: Number(dashData?.issues?.closed ?? 0),
          };

          const issuesByTitle = buildByTitleFromIssues(issueResponse, fallbackIssueCounts);

          
          setIssueForPdf(hasPositiveCounts(issuesByTitle) ? issuesByTitle : issueFallbackCounts);
        } catch (issueError) {
          console.warn("Issues API failed:", issueError);

          const fallbackIssueCounts = {
            Active: Number(dashData?.issues?.active ?? 0),
            Closed: Number(dashData?.issues?.closed ?? 0),
          };

           setIssueForPdf(hasPositiveCounts(fallbackIssueCounts) ? fallbackIssueCounts : issueFallbackCounts);
        }

        let severityRes = null;
        try {
          severityRes = await fetchBugSeverity({
            authToken: backendToken,
            organization: ORGANIZATION,
            project: projectName,
            tagName: build || "",
            buildName: version,
            signal: controller.signal,
          });

           setSeverityForPdf(normalizeSeverityCounts(severityRes));
         } catch (e) {
          console.warn("Severity API failed:", e);
        }

        const buildLookupIds = [
          id,
        ].filter(Boolean);

        let selectedBuildRecord = null;

        for (const lookupId of buildLookupIds) {
          try {
            const response = await getBuildById(lookupId);
            const candidate = response?.data ?? response;
            if (candidate && (candidate.projectId || candidate.buildVersion || getBuildTestingStatus(candidate))) {
              selectedBuildRecord = candidate;
              break;
            }
          } catch (lookupError) {
            if (isUnauthorizedError(lookupError)) return;
          }
        }

        try {
          const finalBuilds = await fetchFinalBuilds(projectName);
          const finalBuildRecord = Array.isArray(finalBuilds)
            ? finalBuilds.find((item) => isMatchingBuildRecord(item, projectName, build, version))
            : null;

          if (isCompletedBuildStatus(getBuildTestingStatus(finalBuildRecord))) {
            selectedBuildRecord = finalBuildRecord;
          } else if (!selectedBuildRecord) {
            selectedBuildRecord = finalBuildRecord;
          }
        } catch (lookupError) {
          if (isUnauthorizedError(lookupError)) return;
        }

        setPreparedBy(selectedBuildRecord?.releasedBy || "");
        const selectedStatus = getBuildTestingStatus({ testingStatus: buildTestingStatus });
        const fetchedStatus = getBuildTestingStatus(selectedBuildRecord);
        setCurrentBuildStatus(
          isCompletedBuildStatus(selectedStatus) ? selectedStatus : fetchedStatus || selectedStatus
        );

       } catch (e) {
        console.error("Failed to load QA approvers:", e);
      } finally {
        if (alive) setLoadingApprovers(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [ORGANIZATION, projectName, version, build, buildTestingStatus]);

  function mapMetricsToAdoData(api) {
    return {
      workItems: {
        testCases: {
          designedSoFar: api?.testCases?.total ?? 0,
          executed: api?.testCases?.executed ?? 0,
          notApplicable: api?.testCases?.notApplicable ?? 0,
        },
        bugs: {
          totalReported: api?.bugs?.reported ?? 0,
          active: api?.bugs?.active ?? 0,
          closed: api?.bugs?.closed ?? 0,
        },
        // UI uses "improvements" but API returns "issues"
        improvements: {
          totalReported: api?.issues?.reported ?? 0,
          active: api?.issues?.active ?? 0,
          closed: api?.issues?.closed ?? 0,
        },
      },

      // API doesn’t provide these separately, so best-effort mapping
      testExecution: {
        manualTestCases: api?.testCases?.total ?? 0,
        totalExecuted: api?.testCases?.executed ?? 0,
      },

      defectsAndImprovementsSummary: {
        total: api?.bugAndIssue?.total ?? 0,
        open: api?.bugAndIssue?.open ?? 0,
        closed: api?.bugAndIssue?.closed ?? 0,
        holdOrWorkaround: api?.bugAndIssue?.holdOrWorkaround ?? 0,
      },

      // Not coming from API response you showed
      activeDefects: api?.activeDefects ?? [],
      activeIssues: api?.activeIssues ?? [],
    };
  }


  // Sign Off fields
  // const [version, setVersion] = useState("");
  const [dateChanged, setDateChanged] = useState(today);
  const [changesDesc, setChangesDesc] = useState("");
  // const [projectName, setProjectName] = userState("");
  // Approved By (document) multi-select
  const [docApprovedBy, setDocApprovedBy] = useState([]);
  const [approverOpen, setApproverOpen] = useState(false);
  const approverRef = useRef(null);
  const closeApprover = useCallback(() => setApproverOpen(false), []);
  useOutsideClick(approverRef, closeApprover, approverOpen);
  const [pdfGenerating, setPdfGenerating] = useState(false);

  // Build details (optional)
  const [briefChange, setBriefChange] = useState("");
  const [affectedSection, setAffectedSection] = useState("");
  const [holdOrWorkaround, setHoldOrWorkaround] = useState("");
  const [buildApprovedBy, setBuildApprovedBy] = useState("");

  // Other sections
  const [overview, setOverview] = useState("");
  const [testExecutionSummary, setTestExecutionSummary] = useState("");
  const [automationTestCasesCount, setAutomationTestCasesCount] = useState("");
  const [automationCoverage, setAutomationCoverage] = useState("");
  const [totalDesignTestCases, setTotalDesignTestCases] = useState("");
  const [totalPass, setTotalPass] = useState("");
  const [totalFail, setTotalFail] = useState("");
  const [testEnvDetails, setTestEnvDetails] = useState("");
  const [risksAssumptions, setRisksAssumptions] = useState("");
  const [conclusion, setConclusion] = useState("");

  // const [automationTestCasesCount, setautomationTestCasesCount] = useState("");
  // const [automationCoverage, setAutomationCoverage] = useState("");

  // Build Approved By (multi-select)
  // const [buildApprovedBy, setBuildApprovedBy] = useState([]);   // ✅ array now
  const [buildApproverOpen, setBuildApproverOpen] = useState(false);
  const buildApproverRef = useRef(null);

  const closeBuildApprover = useCallback(() => setBuildApproverOpen(false), []);
  useOutsideClick(buildApproverRef, closeBuildApprover, buildApproverOpen);

  const toggleBuildApprover = useCallback((name) => {
    setBuildApprovedBy((curr) =>
      curr.includes(name) ? curr.filter((x) => x !== name) : [...curr, name]
    );
  }, []);

  const buildApproverLabel =
    buildApprovedBy.length === 0 ? "Select approvers" : `${buildApprovedBy.length} selected`;



  const onAutomationTestCasesCountChange = (e) => {
    const v = e.target.value;

    if (v === "") return setAutomationTestCasesCount("");
    if (!/^\d+$/.test(v)) return; // digits only

    setAutomationTestCasesCount(v);
  };

  // ---- 0..100 with decimals (up to 2 dp)
  const onWholeNumberChange = (setter) => (e) => {
    const v = e.target.value;

    if (v === "") return setter("");
    if (!/^\d+$/.test(v)) return;

    setter(v);
  };

  const onAutomationCoverageChange = (e) => {
    const v = e.target.value;

    if (v === "") return setAutomationCoverage("");

    // allow: 0, 5, 5., 5.4, 23.23, 100, 100.0
    if (!/^\d{0,3}(\.\d{0,2})?$/.test(v)) return;

    const n = Number(v);
    if (!Number.isNaN(n) && n > 100) return;

    setAutomationCoverage(v);
  };

  const onAutomationCoverageBlur = () => {
    if (automationCoverage === "") return;

    let n = Number(automationCoverage);
    if (Number.isNaN(n)) return setAutomationCoverage("");

    n = Math.max(0, Math.min(100, n));

    // normalize (optional) -> "75.5" / "23.23" / "100"
    setAutomationCoverage(n.toFixed(2).replace(/\.?0+$/, ""));
  };
  // ✅ PDF link (instead of upload)
  const [signOffPdfLink, setSignOffPdfLink] = useState("");

  const toggleApprover = useCallback((option) => {
    const name = option?.name ?? "";
    const emailVal = option?.email ?? "";

    setDocApprovedBy((curr) =>
      curr.includes(name) ? curr.filter((x) => x !== name) : [...curr, name]
    );

    setDocApprovedEmails((curr) => {
      const next = curr.includes(emailVal)
        ? curr.filter((x) => x !== emailVal)
        : [...curr, emailVal].filter(Boolean);
      return Array.from(new Set(next));
    });
  }, []);

  const approverLabel =
    docApprovedBy.length === 0 ? "Select approvers" : `${docApprovedBy.length} selected`;


  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

  const isInt = (v) =>
    Number.isInteger(Number(v));

  const isDecimal = (v) =>
    !isNaN(v) && v !== "" && !Number.isInteger(Number(v));

  const isPdfLinkValid = useMemo(() => isValidHttpUrl(signOffPdfLink), [signOffPdfLink]);
  // ✅ Required fields for SAVE (link-based only)
  const requiredMissing = useMemo(() => {
    const missing = [];
    if (!String(projectName || "").trim()) missing.push("Project");
    if (!String(version || "").trim()) missing.push("Version");
    if (!dateChanged) missing.push("Sign-Off Date");
    if (!String(changesDesc || "").trim()) missing.push("Build's Overview");
    if (!Array.isArray(docApprovedBy) || docApprovedBy.length === 0)
      missing.push("Approved By (Document)");
    if (!String(testEnvDetails || "").trim()) missing.push("Test Environment");
    if (!String(risksAssumptions || "").trim()) missing.push("Risks & Assumptions");
    if (!String(conclusion || "").trim()) missing.push("Conclusion");
    if (!String(briefChange || "").trim()) missing.push("Brief Change");
    if (!String(affectedSection || "").trim()) missing.push("Affected Section");
    if (!isPdfLinkValid) missing.push("Valid Sign-Off PDF Link");





    return missing;
  }, [dateChanged, changesDesc, docApprovedBy, testEnvDetails, risksAssumptions, conclusion, briefChange, affectedSection, automationTestCasesCount, automationCoverage, signOffPdfLink, isPdfLinkValid]);

  const pdfRequiredMissing = useMemo(() => {
    const missing = [];

    if (!String(projectName || "").trim()) missing.push("Project");
    if (!String(version || "").trim()) missing.push("Version");
    if (!dateChanged) missing.push("Date Changed");
    if (!String(changesDesc || "").trim()) missing.push("Build's Overview");
    if (!Array.isArray(docApprovedBy) || docApprovedBy.length === 0)
      missing.push("Approved By (Document)");
    if (!String(testEnvDetails || "").trim()) missing.push("Test Environment");
    if (!String(risksAssumptions || "").trim()) missing.push("Risks & Assumptions");
    if (!String(conclusion || "").trim()) missing.push("Conclusion");
    if (!String(briefChange || "").trim()) missing.push("Brief Change");
    if (!String(affectedSection || "").trim()) missing.push("Affected Section");

    return missing;
  }, [
    projectName,
    version,
    dateChanged,
    changesDesc,
    docApprovedBy,
    testEnvDetails,
    risksAssumptions,
    conclusion,
    briefChange,
    affectedSection,
  ]);

  const pdfGenerateEnabled = pdfRequiredMissing.length === 0 && !pdfGenerating;
  const isPdfLinkFilled = isPdfLinkValid;
  const currentBuildCompleted = isCompletedBuildStatus(currentBuildStatus);
  const buildStatusMessage = currentBuildCompleted
    ? ""
    : "Build's testing status must be Completed before requesting approval.";
  const showBuildStatusWarning = Boolean(buildStatusMessage && projectName && version);

  const submitEnabled =
    requiredMissing.length === 0 &&
    !submitting &&
    selectedBuildAssignedToCurrentUser &&
    currentBuildCompleted;

  const requiresLowConfidenceConfirmation =
    !confidenceLoading &&
    confidenceScore != null &&
    confidenceScore < 90;

  const lowConfidenceReasonRequired =
    lowConfidenceConfirmOpen && requiresLowConfidenceConfirmation;



  // ✅ Backend request body for /api/signoff/save

  const signoffRecipientEmails = useMemo(() => {
    return Array.from(
      new Set([
        ...docApprovedEmails,
        ...adminRecipientEmails,
      ].map((value) => String(value || "").trim()).filter(Boolean))
    );
  }, [docApprovedEmails, adminRecipientEmails]);

  const signoffRequestPayload = useMemo(() => {
    const completedByValue =
      String(verifiedBy || username || "QA Engineer").trim();

    const approvedByValue = docApprovedBy.join(", ");

    return {
      project: String(projectName || "").trim(),
      buildName: String(build || "").trim(),
      version: String(version || "").trim(),
      dateChanged: String(dateChanged || "").trim(), // YYYY-MM-DD
      completedBy: completedByValue,
      approvedBy: approvedByValue,
      description: String(changesDesc || "").trim(),
      reason: requiresLowConfidenceConfirmation
        ? String(lowConfidenceReason || "").trim()
        : "",
      testEnvironment: String(testEnvDetails || "").trim(),
      risksAssumptions: String(risksAssumptions || "").trim(),
      conclusion: String(conclusion || "").trim(),
      signOffPdfLink: String(signOffPdfLink || "").trim(),
      totalDesignTestCases: String(totalDesignTestCases || "").trim(),
      totalPass: String(totalPass || "").trim(),
      totalFail: String(totalFail || "").trim(),
      approvedByEmails: signoffRecipientEmails,
      isApproved: false,
    };
  }, [
    projectName,
    build,
    version,
    dateChanged,
    verifiedBy,
    buildApprovedBy,
    docApprovedBy,
    signoffRecipientEmails,
    changesDesc,
    requiresLowConfidenceConfirmation,
    lowConfidenceReason,
    testEnvDetails,
    risksAssumptions,
    conclusion,
    signOffPdfLink,
    totalDesignTestCases,
    totalPass,
    totalFail,
  ]);

  // ✅ Payload for generateQASignoffPdf (richer PDF document)
  const pdfPayload = useMemo(() => {
    const approvedByForPdf =
      String(buildApprovedBy || "").trim() ||
      (docApprovedBy.length ? docApprovedBy.join(", ") : "");
    const completedByForPdf = String(verifiedBy || username || "QA Engineer").trim();

    return {
      companyName,
      projectName,
      releaseLabel,
      releasedBy: releasedBy || "",
      signoffDocVersion: version || "v1.0",
      dateChanged: dateChanged || today,
      signoffChangeDescription: changesDesc || "",
      buildName: build || "",
      buildVersion: version || "",
      effectiveDate: effectiveDate || today,
      briefDescriptionOfChange: briefChange || "",
      affectedSection: affectedSection || "",
      holdOrWorkaround: holdOrWorkaround || "",
      preparedBy: preparedBy || "",
      verifiedBy: verifiedBy || "",
      completedBy: completedByForPdf,
      approvedBy: approvedByForPdf,

      overview: overview || "",
      testExecutionSummary: testExecutionSummary || "",
      automationTestCases: automationTestCasesCount || "",
      automationCoveragePercent: automationCoverage || "",
      totalDesignTestCases: totalDesignTestCases || "",
      totalPass: totalPass || "",
      totalFail: totalFail || "",

      testEnvironmentDetails: testEnvDetails || "",
      risksAndAssumptions: risksAssumptions || "",
      conclusion: conclusion || "",

      ado: adoData || {
        workItems: {
          testCases: { designedSoFar: 0, executed: 0, notApplicable: 0 },
          bugs: { totalReported: 0, active: 0, closed: 0 },
          improvements: { totalReported: 0, active: 0, closed: 0 },
        },
        testExecution: { manualTestCases: 0, totalExecuted: 0 },
        defectsAndImprovementsSummary: { total: 0, open: 0, closed: 0, holdOrWorkaround: 0 },
        activeDefects: [],
        activeIssues: [],
      },
      logoDataUrl: logoDataUrl || null,
      chartImagesDataUrls: Array.isArray(chartImagesDataUrls) ? chartImagesDataUrls : [],
    };
  }, [
    companyName,
    projectName,
    releaseLabel,
    version,
    dateChanged,
    changesDesc,
    version,
    effectiveDate,
    briefChange,
    affectedSection,
    holdOrWorkaround,
    preparedBy,
    verifiedBy,
    username,
    releasedBy,
    buildApprovedBy,
    docApprovedBy,
    overview,
    testExecutionSummary,
    automationTestCasesCount,
    automationCoverage,
    totalDesignTestCases,
    totalPass,
    totalFail,
    testEnvDetails,
    risksAssumptions,
    conclusion,
    adoData,
    logoDataUrl,
    chartImagesDataUrls,
  ]);

  const resetForm = useCallback((options = {}) => {
    const { keepSignOffPdfLink = true } = options;
    // setVersion("");
    setDateChanged(today);
    setChangesDesc("");
    const defaultNames = Array.from(
      new Set([
        ...(defaultQaManager ? [defaultQaManager] : []),
      ])
    );
    setDocApprovedBy(defaultNames);
    const defaultEmails = Array.from(
      new Set([
        ...(defaultQaManagerEmail ? [defaultQaManagerEmail] : []),
      ])
    );
    setDocApprovedEmails(defaultEmails);
    setBriefChange("");
    setAffectedSection("");
    setHoldOrWorkaround("");
    setBuildApprovedBy("");
    setOverview("");
    setTestExecutionSummary("");
    setAutomationTestCasesCount("");
    setAutomationCoverage("");
    setTotalDesignTestCases("");
    setTotalPass("");
    setTotalFail("");
    setTestEnvDetails("");
    setRisksAssumptions("");
    setConclusion("");
    if (!keepSignOffPdfLink) {
      setSignOffPdfLink("");
    }
    setLowConfidenceReason("");
    setApproverOpen(false);
  }, [defaultQaManager, defaultQaManagerEmail, today]);

  const clearAll = useCallback(() => {
    resetForm();
    setToast("Cleared.");
    setTimeout(() => setToast(""), 2000);
  }, [resetForm]);

  const handleGenerateSignOff = useCallback(async () => {
    try {
      setPdfGenerating(true);

      const metricsRequest = {
        organization: ORGANIZATION,
        project: projectName,
        tagName: build,
        buildName: version,
      };

      const [metricsResult, severityResult] = await Promise.allSettled([
        fetchDashboardMetrics(metricsRequest),
        fetchBugSeverity(metricsRequest),
      ]);

      const currentMetrics =
        metricsResult.status === "fulfilled"
          ? metricsResult.value
          : dashboardMetricsForPdf;
      const currentSeverity =
        severityResult.status === "fulfilled"
          ? normalizeSeverityCounts(severityResult.value)
          : normalizeSeverityCounts(severityForPdf);

      if (metricsResult.status === "fulfilled") {
        setDashboardMetricsForPdf(currentMetrics);
      } else {
        console.warn(
          "Dashboard metrics refresh failed during PDF generation:",
          metricsResult.reason
        );
      }

      if (severityResult.status === "fulfilled") {
        setSeverityForPdf(currentSeverity);
      } else {
        console.warn(
          "Bug severity refresh failed during PDF generation:",
          severityResult.reason
        );
      }

      const metricBugCounts = buildBugCountsFromMetrics(currentMetrics);
      const metricIssueCounts = buildIssueCountsFromMetrics(currentMetrics);
      const metricTaskCounts = buildTaskCountsFromMetrics(currentMetrics);

      await generateQASignoffPdf({
        userData: { email, username, role },
        userInput: {
          companyName: pdfPayload.companyName,
          projectName: pdfPayload.projectName,
          releaseLabel: pdfPayload.releaseLabel,
          signoffDocVersion: pdfPayload.signoffDocVersion,
          dateChanged: pdfPayload.dateChanged,
          signoffChangeDescription: pdfPayload.signoffChangeDescription,
          buildName: pdfPayload.buildName,
          buildVersion: pdfPayload.buildVersion,
          effectiveDate: pdfPayload.effectiveDate,
          briefDescriptionOfChange: pdfPayload.briefDescriptionOfChange,
          affectedSection: pdfPayload.affectedSection,
          holdOrWorkaround: pdfPayload.holdOrWorkaround,
          preparedBy: pdfPayload.preparedBy,
          verifiedBy: pdfPayload.verifiedBy,
          completedBy: pdfPayload.completedBy,
          approvedBy: pdfPayload.approvedBy,
          releasedBy: pdfPayload.releasedBy,
          overview: pdfPayload.overview,
          testExecutionSummary: pdfPayload.testExecutionSummary,
          automationTestCases: pdfPayload.automationTestCases,
          automationCoveragePercent: pdfPayload.automationCoveragePercent,
          totalDesignTestCases: pdfPayload.totalDesignTestCases,
          totalPass: pdfPayload.totalPass,
          totalFail: pdfPayload.totalFail,

          testEnvironmentDetails: pdfPayload.testEnvironmentDetails,
          risksAndAssumptions: pdfPayload.risksAndAssumptions,
          conclusion: pdfPayload.conclusion,
        },
        ado: pdfPayload.ado,
        assets: { logoDataUrl: pdfPayload.logoDataUrl },
        dashWorkItems,
        chartsData: {
          BUG: hasPositiveCounts(metricBugCounts) ? metricBugCounts : bugsForPdf,
          ISSUE: hasPositiveCounts(metricIssueCounts) ? metricIssueCounts : issueForPdf,
          TASK: hasPositiveCounts(metricTaskCounts) ? metricTaskCounts : tasksForPdf,
          SEVERITY: currentSeverity,
        },
        fileName: `QA_SignOff_${pdfPayload.projectName}_${pdfPayload.buildVersion}.pdf`,
      });

      setToast("PDF generated. Upload it to SharePoint and paste the link below.");
      setTimeout(() => setToast(""), 3500);
    } catch (e) {
      console.error("PDF generation failed:", e);
      alert(`PDF generation failed: ${e?.message || e}`);
    } finally {
      setPdfGenerating(false);
    }
  }, [
    ORGANIZATION,
    projectName,
    build,
    version,
    pdfPayload,
    dashWorkItems,
    bugsForPdf,
    issueForPdf,
    tasksForPdf,
    severityForPdf,
    dashboardMetricsForPdf,
  ]);



  /*const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (!submitEnabled) {
        alert(`Please fill: ${requiredMissing.join(", ")}`);
        return;
      }

      try {
        setSubmitting(true);
        await saveSignoff(signoffRequestPayload);

        // notify each approver individually
        if (docApprovedEmails.length) {
          setNotifySending(true);
          setToast("Sending notifications...");
          const projectLabel = projectName || "Project";
          const title = "QA Assignment";
          const message = `Build ${projectLabel}${version ? ` (${version})` : ""} is assigned to you for testing.`;

          try {
            await Promise.allSettled(
              docApprovedEmails.map((email) =>
                createNotification({
                  userId: email,
                  title,
                  message,
                  type: "QA_ASSIGNMENT",
                  isRead: false,
                })
              )
            );
            setToast("Notifications sent.");
            setTimeout(() => setToast(""), 2000);
          } catch (notifyErr) {
            console.warn("Notification send failed:", notifyErr);
            setToast("Some notifications failed to send.");
            setTimeout(() => setToast(""), 2000);
          } finally {
            setNotifySending(false);
          }
        }
        setSuccess("Sign-off requested successfully.");
        // alert("Sign-off saved successfully.");
      } catch (err) {
        console.error(err);
        alert(err?.message || "Failed to save sign-off.");
      } finally {
        setSubmitting(false);
      }
    },
    [submitEnabled, requiredMissing, signoffRequestPayload]
  );*/
  const submitApprovalRequest = useCallback(async () => {
    try {
      if (!selectedBuildAssignedToCurrentUser) {
        alert(signoffAssignmentMessage);
        return;
      }

      if (
        requiresLowConfidenceConfirmation &&
        !String(lowConfidenceReason || "").trim()
      ) {
        alert("Please provide a reason before proceeding.");
        return;
      }

      setSubmitting(true);
      await saveSignoff(signoffRequestPayload);

      if (signoffRecipientEmails.length) {
        for (const email of signoffRecipientEmails) {
          const payload = {
            userId: email,
            title: `QA Sign-off requested for ${projectName || "project"} (${version || "version"})`,
            message: `Sign-Off is requested for approval for ${projectName || "project"} ${build || "build"} (${version || "version"})`,
            type: "QA_SIGNOFF_REQUEST",
            isRead: false,
          };

          try {
            await createNotification(payload);
          } catch (notifyErr) {
            if (isUnauthorizedError(notifyErr)) {
              break;
            }
            console.warn(`Notification send failed for ${email}:`, notifyErr);
          }
        }
      }

      setSuccess("Sign-off requested successfully.");
      setLowConfidenceConfirmOpen(false);
      resetForm({ keepSignOffPdfLink: false });
    } catch (err) {
      console.error(err);
      if (isUnauthorizedError(err)) return;
      alert(err?.message || "Failed to save sign-off.");
    } finally {
      setSubmitting(false);
    }
  }, [
    signoffRequestPayload,
    signoffRecipientEmails,
    projectName,
    version,
    build,
    requiresLowConfidenceConfirmation,
    lowConfidenceReason,
    resetForm,
    selectedBuildAssignedToCurrentUser,
    signoffAssignmentMessage,
  ]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();

      if (submitting) return;

      if (!selectedBuildAssignedToCurrentUser) {
        alert(signoffAssignmentMessage);
        return;
      }

      setLowConfidenceConfirmOpen(true);
    },
    [
      submitting,
      selectedBuildAssignedToCurrentUser,
    signoffAssignmentMessage,
    ]
  );

  const [coverage, setCoverage] = useState(""); // keep as string for smooth typing


  // allow up to 2 decimals (change {0,2} if you want more)
  const handleAutomationCoverageChange = (e) => {
    const v = e.target.value;

    // allow empty (so user can delete)
    if (v === "") return setAutomationCoverage("");

    // allow digits + optional decimal (max 2 decimal places)
    if (!/^\d{0,3}(\.\d{0,2})?$/.test(v)) return;

    // block > 100
    const n = Number(v);
    if (!Number.isNaN(n) && n > 100) return;

    setAutomationCoverage(v);
  };

  const handleAutomationCoverageBlur = () => {
    if (automationCoverage === "") return;

    let n = Number(automationCoverage);
    if (Number.isNaN(n)) return setAutomationCoverage("");

    // clamp 0..100
    n = Math.max(0, Math.min(100, n));

    // normalize display (optional)
    setAutomationCoverage(n.toFixed(2).replace(/\.?0+$/, ""));
  };

  function onCoverageBlur() {
    if (coverage === "") return;

    let n = Number(coverage);
    if (Number.isNaN(n)) return setCoverage("");

    // clamp to 0..100
    n = Math.max(0, Math.min(100, n));

    // optional: normalize formatting (keeps up to 2 decimals, removes trailing zeros)
    const normalized = n.toFixed(2).replace(/\.?0+$/, "");
    setCoverage(normalized);
  }


  // optional helper for unapprove (call only when you have signoff id)
  const handleUnapprove = useCallback(async (id) => {
    try {
      const updated = await unapproveSignoffById(id);
      // console.log("Updated signoff:", updated);
      setToast("Sign-off updated (unapproved).");
      setTimeout(() => setToast(""), 2500);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div className="w-full">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Request Sign-off</h1>
              <p className="mt-1 text-sm text-gray-600">
                Fill details → Generate PDF → Upload to SharePoint → Paste link → Send Approval Request
              </p>
              <p className={confidenceBannerClassName}>
                <span className="flex items-center gap-2">
                  {showConfidenceWarningIcon ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 3 2.6 19.5A1 1 0 0 0 3.47 21h17.06a1 1 0 0 0 .87-1.5L12 3Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M12 9v4" strokeLinecap="round" />
                      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  ) : null}
                  <span className="text-[14px]">
                    Disclaimer: The current build confidence score is{" "}
                    <span className="font-semibold">
                      {confidenceLoading
                        ? "loading..."
                        : confidenceScore != null
                          ? `${confidenceScore}%`
                          : "not available"}
                    </span>
                  </span>
                </span>
              </p>

              {showBuildStatusWarning && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
                  <div className="flex items-start gap-3">
                    <svg
                      viewBox="0 0 24 24"
                      className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 3 2.6 19.5A1 1 0 0 0 3.47 21h17.06a1 1 0 0 0 .87-1.5L12 3Z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M12 9v4" strokeLinecap="round" />
                      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    <div>
                      <div className="font-semibold">Build testing is not completed</div>
                      <div className="mt-0.5">
                        {buildStatusMessage}
                        {currentBuildStatus ? (
                          <span className="ml-1 font-medium">Current status: {currentBuildStatus}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {toast && (
            <div
              className={classNames(
                "mt-4 rounded-xl px-4 py-3 text-sm border",
                requiredMissing.length && !submitEnabled
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              )}
            >
              {toast}
            </div>
          )}
        </div>

        <form id="signoffForm" onSubmit={handleSubmit} className="space-y-5">
          {/* Sign Off Document Details */}
          <Section title="Sign Off Document Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* <Field label="Version" required hint="Required">
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="e.g., v1.1.0"
                  className={inputBase}
                  disabled={submitting}
                />
              </Field> */}

              <Field label="Sign-Off Date" required hint="Required">
                <input
                  type="date"
                  value={dateChanged}
                  onChange={(e) => setDateChanged(e.target.value)}
                  className={inputBase}
                  disabled={submitting}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Sign-Off Overview" required hint="Required">
                  <textarea
                    value={changesDesc}
                    onChange={(e) => setChangesDesc(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                    placeholder="Summarize what changed..."
                    className={textareaBase}
                    disabled={submitting}
                  />

                  <div className="text-sm text-gray-500 mt-1 text-right">
                    {changesDesc.length} / {TEXT_FIELD_MAX_LENGTH} characters
                  </div>
                </Field>
              </div>


              {/* Multi-select dropdown with checkboxes */}
              <div className="sm:col-span-2" ref={approverRef}>
                <Field label="Approved By" required hint="Select one or more">
                  <button
                    type="button"
                    onClick={() => setApproverOpen((v) => !v)}
                    disabled={submitting}
                    className={classNames(inputBase, "text-left flex items-center justify-between")}
                  >
                    <span className={docApprovedBy.length ? "text-gray-900" : "text-gray-400"}>
                      {approverLabel}
                    </span>
                    <span className="text-gray-500">{approverOpen ? "▲" : "▼"}</span>
                  </button>

                  {approverOpen && (
                    <div className="mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                      <div className="max-h-56 overflow-auto">
                        {qaApprovers.map((opt) => {
                          const checked = docApprovedBy.includes(opt.name);
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleApprover(opt)}
                                  className="h-4 w-4"
                                  disabled={submitting}
                                />
                                <div className="text-sm text-gray-800 leading-tight">
                                  <div>{opt.name}</div>
                                  {opt.email ? (
                                    <div className="text-xs text-gray-500">{opt.email}</div>
                                  ) : null}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDocApprovedBy([]);
                            setDocApprovedEmails([]);
                          }}
                          disabled={submitting || docApprovedBy.length === 0}
                          className={classNames(
                            "text-xs font-medium",
                            docApprovedBy.length === 0
                              ? "text-gray-400 cursor-not-allowed"
                              : "text-gray-700 hover:text-gray-900 underline"
                          )}
                        >
                          Clear
                        </button>

                        <button
                          type="button"
                          onClick={() => setApproverOpen(false)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}

                  {docApprovedBy.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      Selected:{" "}
                      <span className="font-medium text-gray-900">{docApprovedBy.join(", ")}</span>

                    </div>
                  )}
                </Field>
              </div>
            </div>
          </Section>

          {/* Build Details (optional for saving, useful for PDF) */}
          <Section title="Build Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Build's Overview" required>
                  <textarea
                    value={briefChange}
                    onChange={(e) => setBriefChange(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                    placeholder="High-level summary of build changes..."
                    className={textareaBase}
                    disabled={submitting}
                  />

                  <div className="text-sm text-gray-500 mt-1 text-right">
                    {briefChange.length} / {TEXT_FIELD_MAX_LENGTH} characters
                  </div>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label="Affected Section" required>
                  <input
                    value={affectedSection}
                    onChange={(e) => setAffectedSection(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                    placeholder="e.g., Login, Dashboard, API"
                    className={inputBase}
                    disabled={submitting}
                  />
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Field label="Hold/Workaround">
                  <input
                    value={holdOrWorkaround}
                    onChange={(e) => setHoldOrWorkaround(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                    placeholder="e.g., 2"
                    className={inputBase}
                    disabled={submitting}
                    inputMode="numeric"
                  />
                </Field>
              </div>

              {/* <div ref={buildApproverRef}>
                <Field label="Approved By (Build)" hint="Select one or more">
                  <button
                    type="button"
                    onClick={() => setBuildApproverOpen((v) => !v)}
                    disabled={submitting}
                    className={classNames(inputBase, "text-left flex items-center justify-between")}
                  >
                    <span className={buildApprovedBy.length ? "text-gray-900" : "text-gray-400"}>
                      {buildApproverLabel}
                    </span>
                    <span className="text-gray-500">{buildApproverOpen ? "▲" : "▼"}</span>
                  </button>

                  {buildApproverOpen && (
                    <div className="mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg p-2">
                      <div className="max-h-56 overflow-auto">
                        {qaApprovers.map((opt) => {
                          const checked = buildApprovedBy.includes(opt.name);
                          return (
                            <label
                              key={opt.id}
                              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 cursor-pointer justify-between"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleBuildApprover(opt.name)}
                                  className="h-4 w-4"
                                  disabled={submitting}
                                />
                                <div className="text-sm text-gray-800 leading-tight">
                                  <div>{opt.name}</div>
                                  {opt.email ? (
                                    <div className="text-xs text-gray-500">{opt.email}</div>
                                  ) : null}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
                        <button
                          type="button"
                          onClick={() => setBuildApprovedBy([])}
                          disabled={submitting || buildApprovedBy.length === 0}
                          className={classNames(
                            "text-xs font-medium",
                            buildApprovedBy.length === 0
                              ? "text-gray-400 cursor-not-allowed"
                              : "text-gray-700 hover:text-gray-900 underline"
                          )}
                        >
                          Clear
                        </button>

                        <button
                          type="button"
                          onClick={() => setBuildApproverOpen(false)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}

                  {buildApprovedBy.length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      Selected:{" "}
                      <span className="font-medium text-gray-900">{buildApprovedBy.join(", ")}</span>
                    </div>
                  )}
                </Field>
              </div> */}









            </div>
          </Section>

          <Section title="Test Environment Details">
            <Field label="Test Environment" required>
              <textarea
                value={testEnvDetails}
                onChange={(e) => setTestEnvDetails(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                placeholder="Environment details..."
                className={textareaBase}
                disabled={submitting}
              />

              <div className="text-sm text-gray-500 mt-1 text-right">
                {testEnvDetails.length} / {TEXT_FIELD_MAX_LENGTH} characters
              </div>
            </Field>
          </Section>



          <Section title="Automation Details">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Automated Test Cases" >
                <input
                  type="text"
                  value={automationTestCasesCount}
                  onChange={onAutomationTestCasesCountChange}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                  placeholder="e.g. 120"
                  className={inputBase}
                  disabled={submitting}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Automation Coverage %" >
                <input
                  type="text"
                  value={automationCoverage}
                  onChange={onAutomationCoverageChange}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                  onBlur={onAutomationCoverageBlur}
                  placeholder="e.g. 75.50"
                  className={inputBase}
                  disabled={submitting}
                  inputMode="decimal"
                />
              </Field>

              <Field label="Total Design Test Case" >
                <input
                  type="text"
                  value={totalDesignTestCases}
                  onChange={onWholeNumberChange(setTotalDesignTestCases)}
                  maxLength={TEXT_FIELD_MAX_LENGTH}
                  placeholder="e.g. 150"
                  className={inputBase}
                  disabled={submitting}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Total Pass" >
                <input
                  type="text"
                  value={totalPass}
                  onChange={onWholeNumberChange(setTotalPass)}
                  maxLength={TEXT_FIELD_MAX_LENGTH}
                  placeholder="e.g. 142"
                  className={inputBase}
                  disabled={submitting}
                  inputMode="numeric"
                />
              </Field>

              <Field label="Total Fail" >
                <input
                  type="text"
                  value={totalFail}
                  onChange={onWholeNumberChange(setTotalFail)}
                  maxLength={TEXT_FIELD_MAX_LENGTH}
                  placeholder="e.g. 8"
                  className={inputBase}
                  disabled={submitting}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </Section>

          <Section title="Risks & Assumptions">
            <Field label="Risks & Assumptions" required>
              <textarea
                value={risksAssumptions}
                onChange={(e) => setRisksAssumptions(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                placeholder="Mention risks, assumptions, known issues..."
                className={textareaBase}
                disabled={submitting}
              />

              <div className="text-sm text-gray-500 mt-1 text-right">
                {risksAssumptions.length} / {TEXT_FIELD_MAX_LENGTH} characters
              </div>
            </Field>
          </Section>


          <Section title="Conclusion">
            <Field label="Conclusion" required>
              <textarea
                value={conclusion}
                onChange={(e) => setConclusion(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                placeholder="Final conclusion / recommendation..."
                className={textareaBase}
                disabled={submitting}
              />

              <div className="text-sm text-gray-500 mt-1 text-right">
                {conclusion.length} / {TEXT_FIELD_MAX_LENGTH} characters
              </div>
            </Field>
          </Section>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateSignOff}
              disabled={!pdfGenerateEnabled}
              title={!pdfGenerateEnabled ? "Please fill all the mandatory fields" : ""}
              className={classNames(
                "px-5 py-2.5 text-sm font-semibold rounded-xl text-white transition-all duration-200 cursor-pointer",
                !pdfGenerateEnabled
                  ? "bg-blue-400 opacity-60 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5"
              )}
            >
              {pdfGenerating ? (
                <span className="inline-flex items-center gap-2 ">
                  <span className="h-4 w-4  rounded-full border-2 border-gray-300 border-t-gray-900 animate-spin" />
                  Generating PDF
                </span>
              ) : (
                "Generate Sign-Off PDF"
              )}
            </button>

            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-2.5 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:shadow-sm cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5"
              disabled={submitting}
            >
              Reset
            </button>
          </div>

          <p className="mt-1 text-sm text-gray-600">
            Upload Generated PDF To SharePoint → Paste Link Below → Send Approval Request
          </p>
          {/* ✅ Link instead of upload */}
          <Section title="Sign Off PDF Link">
            <Field label="Sign-Off PDF Link" required>
              <input
                value={signOffPdfLink}
                onChange={(e) => setSignOffPdfLink(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                onBlur={() => setSignOffPdfLink((v) => v.trim())}
                placeholder="Paste SharePoint/URL (https://...)"
                className={inputBase}
                disabled={submitting}
                inputMode="url"
              />
              {!isPdfLinkValid && signOffPdfLink.trim() !== "" && (
                <p className="text-xs text-rose-600 mt-1">Enter a valid URL starting with http or https.</p>
              )}
            </Field>
          </Section>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Only for testing when you have a saved signoff id */}
            {/* <button
              type="button"
              onClick={() => handleUnapprove("SIGNOFF_ID")}
              className="px-3 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
              disabled={submitting}
            >
              Unapprove (demo)
            </button> */}
          </div>

          {/* Footer helper */}
          <div className="sticky bottom-3">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs text-gray-600">
                {requiredMissing.length ? (
                  <span>
                    Missing required:{" "}
                    <span className="font-medium text-gray-900">{requiredMissing.join(", ")}</span>
                  </span>
                ) : signoffAssignmentMessage ? (
                  <span>{signoffAssignmentMessage}</span>
                ) : (
                  <span>All required fields complete.</span>
                )}
              </div>

              <button
                type="submit"
                title={
                  signoffAssignmentMessage
                    ? signoffAssignmentMessage
                    : buildStatusMessage
                      ? buildStatusMessage
                      : !isPdfLinkFilled
                        ? "Please generate Sign-Off PDF and paste the link before requesting approval"
                        : ""
                }
                className={classNames(
                  "px-4 py-2 text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition",
                  submitEnabled
                    ? "bg-gray-900 text-white hover:bg-black hover:shadow-lg cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5"
                    : "bg-gray-200 text-gray-600 cursor-not-allowed"
                )}
                disabled={!submitEnabled}
              >
                {submitting ? "Submitting..." : "Request for Approval"}
              </button>


            </div>
          </div>

          {success && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg rounded-2xl bg-white px-8 py-8 shadow-2xl animate-in fade-in zoom-in-95">

                {/* Green Tick */}
                <div className="flex justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-10 w-10 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </div>
                </div>

                {/* Content */}
                <div className="mt-6 text-center">
                  <h3 className="text-xl font-semibold text-gray-900">
                    Success
                  </h3>
                  <p className="mt-2 text-base text-gray-700">
                    {success}
                  </p>
                </div>

                {/* Action */}
                <div className="mt-8 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setSuccess("")}
                    className="rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          )}

          {lowConfidenceConfirmOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
              role="dialog"
              aria-modal="true"
              onClick={() => !submitting && setLowConfidenceConfirmOpen(false)}
            >
              <div
                className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)] ring-1 ring-slate-200/70"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-6 pt-6 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-amber-100">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5 text-amber-600"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 3 2.6 19.5A1 1 0 0 0 3.47 21h17.06a1 1 0 0 0 .87-1.5L12 3Z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M12 9v4" strokeLinecap="round" />
                        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                      </svg>
                    </div>

                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                        Confirm Approval Request
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        The confidence score is below{" "}
                        <span className="font-semibold text-slate-800">90%</span>. Please
                        confirm if you still want to continue with the approval request.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <label className="text-sm font-medium text-slate-800">
                      Reason <span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      value={lowConfidenceReason}
                      onChange={(e) => setLowConfidenceReason(e.target.value)}
                    maxLength={TEXT_FIELD_MAX_LENGTH}
                      placeholder="Explain why the sign-off request should proceed despite the confidence score being below 90%..."
                      rows={4}
                      disabled={submitting}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                    <div className="mt-1 text-right text-xs text-slate-500">
                      {lowConfidenceReason.length} / {TEXT_FIELD_MAX_LENGTH} characters
                    </div>
                    {lowConfidenceReasonRequired &&
                      !String(lowConfidenceReason || "").trim() ? (
                      <p className="mt-2 text-xs text-rose-600">
                        Reason is required when the confidence score is below 90%.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setLowConfidenceConfirmOpen(false)}
                      disabled={submitting}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitApprovalRequest}
                      disabled={
                        submitting ||
                        !selectedBuildAssignedToCurrentUser ||
                        !String(lowConfidenceReason || "").trim()
                      }
                      className={classNames(
                        "rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition",
                        submitting || !selectedBuildAssignedToCurrentUser || !String(lowConfidenceReason || "").trim()
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-slate-800"
                      )}
                    >
                      {submitting ? "Submitting..." : "Proceed"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}



        </form>
      </div>
    </div>
  );
}
