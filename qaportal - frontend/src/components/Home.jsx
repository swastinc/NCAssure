// src/components/Home.jsx
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useMemo, useState } from "react";
import Dashboard from "./Dashboard";
import SimpleSelect from "./SimpleSelect";
import VersionSelect from "./VersionSelect";
import Logs from "./Logs";
import TestProgress from "./TestProgress";
import FloatingChatbot from "../components/FloatingChatbot";
import { useDispatch, useSelector } from "react-redux";
import { setUser } from "../config/authSlice";
import AITrendsGraph from "../components/AITrendsGraph";
import BuildHistory from "./BuildHistory";
import ReleaseBuildSection from "./ReleaseBuildSection";
import AIInsights from "./AIInsights";
import {
  getBackendApiTokenAsync,
  getMsalAccount,
  validateSessionOrLogout,
  msalInstance,
} from "../config/msalConfig";
import DevManager from "./DevManager";
import QAEngineer from "./QAEngineer";
import KnowledgeSection from "./KnowledgeSection";
import {
  fetchBuildApprovalUnreadCount,
  fetchSignoffApprovalUnreadCount,
  getQAEngineersUsers,
  getUserByEmail,
  markBuildApprovalsSeen,
  markSignoffApprovalsSeen,
} from "../api/userFromEmail";
import { fetchFinalBuilds, fetchPendingBuilds, getBuildById } from "../api/fetchBuildsApi";
import AdminControlPanel from "./AdminControlPanel";
import PendingSignoffApprovals from "./PendingSignoffApprovals";
import { getAllSignoffsPendingApproval } from "../api/signoffApi";
import QaAssigneeSelect from "./QaAssigneeSelect";
import { deleteNotification, fetchNotifications } from "../api/notificationsApi";
import SessionExpiredDialog from "./SessionExpiredDialog";
import AzureDevOpsUpdateNotifier from "./AzureDevOpsUpdateNotifier";
import qaPortalLogo from "../assets/QA_Portal.svg";
import {
  isUnauthorizedError,
  UNAUTHORIZED_SESSION_EVENT,
} from "../config/unauthorizedSession";
import { fetchProjects as fetchProjectsApi } from "../api/fetchProjects";
import { loadCache, saveCache } from "../config/storage";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const PROJECT_INIT_TIMEOUT_MS = 90000;
const PROJECTS_CACHE_PREFIX = "qa-portal:projects";
const PROJECTS_FOCUS_REFRESH_INTERVAL_MS = 30000;

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
function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      const error = new Error(timeoutMessage);
      error.code = "REQUEST_TIMEOUT";
      reject(error);
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function LoadingDialog({
  open = true,
  title = "Loading",
  message = "Please wait...",
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      aria-hidden="false"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

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

function getReleasedByName(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return String(
    value.name ||
      value.username ||
      value.displayName ||
      value.email ||
      ""
  ).trim();
}
function getProjectsCacheKey(accountEmail) {
  const normalizedEmail = String(accountEmail || "").trim().toLowerCase() || "anonymous";
  return `${PROJECTS_CACHE_PREFIX}:${normalizedEmail}`;
}

export default function HomePage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { email, username, role, isAuthenticated } = useSelector(
    (state) => state.auth
  );

  // MSAL account
  const account = getMsalAccount();
  const accountEmail = account?.username;

  // Use Redux email if present; otherwise fallback to MSAL email
  const effectiveEmail = useMemo(
    () => email || accountEmail || "",
    [email, accountEmail]
  );

  const profilePictureUrl = useMemo(
    () => account?.idTokenClaims?.picture || "",
    [account]
  );

  const truncatedEmail = useMemo(() => {
    const value = String(effectiveEmail || "").trim();
    if (!value) return "N/A";
    return value.length > 20 ? `${value.slice(0, 20)}...` : value;
  }, [effectiveEmail]);

  const [navCollapsed, setNavCollapsed] = useState(false);
  const [buildName, setBuildName] = useState(() => {
    return localStorage.getItem("buildName") || "";
  });

  // projects + builds
  const [projectList, setProjectList] = useState([]);
  const [projectsReady, setProjectsReady] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");
  const lastProjectsRefreshRef = useRef(0);
  const [project, setProject] = useState(() => {
    return localStorage.getItem("project") || "";
  });

  const [buildRecords, setBuildRecords] = useState([]);
  const [buildNameOptions, setBuildNameOptions] = useState([]);
  const [buildOptions, setBuildOptions] = useState([]);
  const [buildsLoading, setBuildsLoading] = useState(false);
  const [buildsReadyForProject, setBuildsReadyForProject] = useState("");
  const [build, setBuild] = useState(() => {
    return localStorage.getItem("build") || "";
  });

  const [qaengineer, setQaEngineer] = useState("");
  const [qaEngineerEmail, setQaEngineerEmail] = useState("");
  const [qaOptions, setQaOptions] = useState([]);
  const [buildType, setBuildType] = useState("");
  const [releasedBy, setReleasedBy] = useState("");

  // This is no longer an ADO token.
  // It is only the backend API access token.
  const [backendApiToken, setBackendApiToken] = useState("");

  const selectedBuildOption = useMemo(() => {
    const selectedVersion = String(build || "").trim();
    if (!selectedVersion || selectedVersion === "__NO_BUILDS__") return null;
    return buildOptions.find((option) => {
      return option?.value === selectedVersion || option?.label === selectedVersion;
    }) || null;
  }, [build, buildOptions]);

  const selectedBuildTestingStatus = useMemo(
    () => getBuildTestingStatus(selectedBuildOption?.raw),
    [selectedBuildOption]
  );
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("navbar") || "Dashboard";
  });
  const [mountedTabs, setMountedTabs] = useState(() => ({
    [localStorage.getItem("navbar") || "Dashboard"]: true,
  }));

  const [showSidebar, setShowSidebar] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileCard, setShowProfileCard] = useState(false);
  const profileCardRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [expandedNotifications, setExpandedNotifications] = useState(
    () => new Set()
  );
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [notifError, setNotifError] = useState("");
  const [manualDownloadError, setManualDownloadError] = useState("");
  const [manualDownloading, setManualDownloading] = useState(false);
  const deletingNotificationIdsRef = useRef(new Set());
  const [buildApprovalUnreadCount, setBuildApprovalUnreadCount] = useState(0);
  const [buildApprovalDotHidden, setBuildApprovalDotHidden] = useState(false);
  const [buildApprovalPendingIds, setBuildApprovalPendingIds] = useState([]);
  const [signoffApprovalUnreadCount, setSignoffApprovalUnreadCount] = useState(0);
  const [signoffApprovalDotHidden, setSignoffApprovalDotHidden] = useState(false);
  const [signoffApprovalPendingIds, setSignoffApprovalPendingIds] = useState([]);
  const notificationsPanelRef = useRef(null);
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionDialogMessage, setSessionDialogMessage] = useState(
    "Your session has expired. Please sign in again."
  );

  const selectorsLoading =
    projectsLoading ||
    buildsLoading ||
    (Boolean(backendApiToken) && !projectsError && !projectsReady) ||
    (Boolean(project) && !projectsError && buildsReadyForProject !== project);
  const selectorLoadingMessage = projectsLoading || !projectsReady
    ? "Fetching project list..."
    : "Fetching builds...";
  const projectsCacheKey = useMemo(
    () => getProjectsCacheKey(accountEmail),
    [accountEmail]
  );

  const buildApprovalSeenKey = useMemo(() => {
    const normalizedEmail = String(effectiveEmail || accountEmail || "anonymous").trim().toLowerCase();
    return `qa-portal:build-approvals-seen:${normalizedEmail || "anonymous"}`;
  }, [effectiveEmail, accountEmail]);

  const signoffApprovalSeenKey = useMemo(() => {
    const normalizedEmail = String(effectiveEmail || accountEmail || "anonymous").trim().toLowerCase();
    return `qa-portal:signoff-approvals-seen:${normalizedEmail || "anonymous"}`;
  }, [effectiveEmail, accountEmail]);

  const buildTypeKey = (buildType || "").toLowerCase().trim();

  const buildTypeClass =
    buildTypeKey === "web app"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : buildTypeKey === "mobile app"
        ? "bg-purple-100 text-purple-800 border-purple-200"
        : buildTypeKey === "scripts"
          ? "bg-amber-100 text-amber-800 border-amber-200"
          : buildTypeKey === "services"
            ? "bg-green-100 text-green-800 border-green-200"
            : buildTypeKey === "automated flow"
              ? "bg-pink-100 text-pink-800 border-pink-200"
              : buildTypeKey === "documents"
                ? "bg-slate-100 text-slate-800 border-slate-200"
                : buildTypeKey === "apis"
                  ? "bg-cyan-100 text-cyan-800 border-cyan-200"
                  : buildTypeKey === "ai model"
                    ? "bg-indigo-100 text-indigo-800 border-indigo-200"
                    : buildTypeKey === "ai agent"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : "bg-gray-100 text-gray-800 border-gray-200";

  const hideBuildControls =
    activeTab === "Release Build" ||
    activeTab === "Approve Builds" ||
    activeTab === "Approve Sign Offs" ||
    activeTab === "Admin" ||
    activeTab === "Build history" ||
    activeTab === "AITrends" ||
    activeTab === "Logs" ||
    activeTab === "Knowledge base" ||
    activeTab === "Knowledge ";

  // Ensure AI Orchestration (AITrends) has a project/tag selected on first open
  useEffect(() => {
    if (activeTab !== "AITrends") return;

    const validProject = projectList.find(
      (p) => p.value && p.value !== "No Projects"
    );

    if ((!project || project === "No Projects") && validProject) {
      setProject(validProject.value);
    }

    if (!build && buildOptions.length) {
      const validBuild = buildOptions.find(
        (b) => b.value && b.value !== "__NO_BUILDS__"
      );

      if (validBuild) {
        setBuild(validBuild.value || validBuild.label || "");
      }
    }
  }, [activeTab, project, projectList, build, buildOptions]);

  /* =========================================================
     1) HYDRATE REDUX FROM LOCALSTORAGE
  ========================================================= */
  useEffect(() => {
    const savedUser = localStorage.getItem("user");

    if (savedUser) {
      try {
        dispatch(setUser(JSON.parse(savedUser)));
      } catch (e) {
        console.error("Failed to parse saved user", e);
      }
    }
  }, [dispatch]);

  /* =========================================================
     2) BACKEND API TOKEN HELPERS
     IMPORTANT:
     - Frontend does NOT request Azure DevOps token.
     - Frontend does NOT request Graph token.
     - Frontend only sends backend API token to Spring Boot.
     - Backend uses OBO to get ADO / Graph token.
  ========================================================= */
  async function getBackendToken() {
    const token = await getBackendApiTokenAsync();

    if (!token) {
      throw new Error("BACKEND_API_TOKEN_NOT_AVAILABLE");
    }

    return token;
  }

  async function fetchProjects(tokenOverride = "") {
    const backendApiToken = tokenOverride || await getBackendToken();
    let resolvedToken = backendApiToken;

    const projects = await fetchProjectsApi(undefined, backendApiToken, {
      onResolvedToken: (nextToken) => {
        resolvedToken = nextToken;
      },
    });

    return {
      projects,
      token: resolvedToken,
    };
  }

  function applyProjectsData(projects, { persist = false } = {}) {
    const fetchedProjects = [
      ...new Set((projects?.value ?? []).map((p) => p.name)),
    ]
      .sort()
      .map((name) => ({ value: name, label: name }));

    setProjectList(
      fetchedProjects.length ? fetchedProjects : [{ value: "", label: "" }]
    );

    const savedProject = localStorage.getItem("project");
    const projectExists = fetchedProjects.some(
      (p) => p.value === savedProject
    );

    setProject(projectExists ? savedProject : fetchedProjects[0]?.value || "");
    setProjectsReady(true);

    if (persist) {
      saveCache(projectsCacheKey, {
        projects,
        cachedAt: Date.now(),
      });
    }

    return fetchedProjects;
  }

  async function initializeProjects() {
    setProjectsLoading(true);
    setProjectsReady(false);
    setProjectsError("");
    const token = await getBackendToken();
    setBackendApiToken(token);

    const cachedProjectsEntry = loadCache(projectsCacheKey);
    const cachedProjects = cachedProjectsEntry?.projects;

    if (!projectList.length && Array.isArray(cachedProjects?.value) && cachedProjects.value.length > 0) {
      applyProjectsData(cachedProjects);
    }

    const { projects, token: resolvedToken } = await withTimeout(
      fetchProjects(token),
      PROJECT_INIT_TIMEOUT_MS,
      "Project list request timed out. Please refresh or sign in again."
    );
    setBackendApiToken(resolvedToken || token);
    applyProjectsData(projects, { persist: true });

    return projects;
  }

  /* =========================================================
     3) INIT SESSION + PROJECTS
  ========================================================= */
  useEffect(() => {
    if (!accountEmail) return;

    let cancelled = false;

    (async () => {
      try {
        const isValidSession = await validateSessionOrLogout();

        if (!isValidSession || cancelled) {
          return;
        }

        await initializeProjects();
      } catch (e) {
        if (!cancelled) {
          const cachedProjectsEntry = loadCache(projectsCacheKey);
          const cachedProjects = cachedProjectsEntry?.projects;
          const hasCachedProjects =
            Array.isArray(cachedProjects?.value) && cachedProjects.value.length > 0;

          if (hasCachedProjects) {
            applyProjectsData(cachedProjects);
            setProjectsError(
              "Project list is taking longer than expected. Showing your last loaded projects."
            );
          } else {
            setProjectList([]);
            setProject("");
            setProjectsReady(false);
            setProjectsError(
              e?.message || "Unable to load project list. Please try again."
            );
          }

          if (isUnauthorizedError(e)) return;
          console.error("Project init error:", e);
        }
      } finally {
        if (!cancelled) {
          setProjectsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountEmail, projectsCacheKey]);

  // A project may be created in Azure DevOps while this page remains open.
  // Refresh when the user returns to the portal so manager dropdowns do not
  // stay pinned to the project list captured at login.
  useEffect(() => {
    if (!accountEmail || !backendApiToken) return;

    let cancelled = false;

    const refreshProjectsOnReturn = async () => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      if (now - lastProjectsRefreshRef.current < PROJECTS_FOCUS_REFRESH_INTERVAL_MS) {
        return;
      }
      lastProjectsRefreshRef.current = now;

      try {
        const { projects, token: resolvedToken } = await fetchProjects(backendApiToken);
        if (cancelled) return;

        setBackendApiToken(resolvedToken || backendApiToken);
        applyProjectsData(projects, { persist: true });
        setProjectsError("");
      } catch (error) {
        if (!cancelled && !isUnauthorizedError(error)) {
          console.error("Project refresh error:", error);
        }
      }
    };

    window.addEventListener("focus", refreshProjectsOnReturn);
    document.addEventListener("visibilitychange", refreshProjectsOnReturn);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshProjectsOnReturn);
      document.removeEventListener("visibilitychange", refreshProjectsOnReturn);
    };
  }, [accountEmail, backendApiToken, projectsCacheKey]);

  /* =========================================================
     4) INIT USER + QA OPTIONS
  ========================================================= */
  useEffect(() => {
    if (!effectiveEmail) return;

    let cancelled = false;

    (async () => {
      try {
        const [user, users] = await Promise.all([
          getUserByEmail(effectiveEmail),
          getQAEngineersUsers(),
        ]);

        if (cancelled) return;

        const list = Array.isArray(users) ? users : [];

        const qa = list
          .filter((u) => String(u?.role || "").toUpperCase() === "QAENGINEER")
          .map((u) => ({
            value: u.email,
            label: u.name || u.email,
          }));

        setQaOptions(qa);

        if (qa.length > 0) {
          setQaEngineer((prev) => prev);
        }

        if (user?.email && user?.role) {
          const userPayload = {
            email: user.email,
            username: user.name,
            role: user.role,
          };

          const current = localStorage.getItem("user");
          const next = JSON.stringify(userPayload);

          if (current !== next) {
            localStorage.setItem("user", next);
          }

          if (!isAuthenticated || !email || !role) {
            dispatch(setUser(userPayload));
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error("User init error:", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveEmail, isAuthenticated, email, role, dispatch]);

  /* =========================================================
     5) FETCH BUILDS WHEN PROJECT CHANGES
  ========================================================= */
  useEffect(() => {
    const handleUnauthorizedSession = (event) => {
      const nextMessage =
        event?.detail?.message || "Your session has expired. Please sign in again.";

      setSessionDialogMessage((current) =>
        current === nextMessage ? current : nextMessage
      );
      setSessionDialogOpen((current) => (current ? current : true));
    };

    window.addEventListener(UNAUTHORIZED_SESSION_EVENT, handleUnauthorizedSession);

    return () => {
      window.removeEventListener(
        UNAUTHORIZED_SESSION_EVENT,
        handleUnauthorizedSession
      );
    };
  }, []);

  useEffect(() => {
    if (!backendApiToken) {
      return;
    }

    if (!projectsReady) {
      setBuildsLoading(false);
      setBuildsReadyForProject("");
      setBuildRecords([]);
      setBuildNameOptions([]);
      setBuildOptions([]);
      setBuildName("");
      setBuild("");
      setBuildType("");
      setQaEngineer("");
      setQaEngineerEmail("");
      setReleasedBy("");
      return;
    }

    if (!project) {
      setBuildsLoading(false);
      setBuildsReadyForProject("");
      setBuildRecords([]);
      setBuildNameOptions([]);
      setBuildOptions([]);
      setBuildName("");
      setBuild("");
      setBuildType("");
      setQaEngineer("");
      setQaEngineerEmail("");
      setReleasedBy("");
      return;
    }

    let cancelled = false;

    setBuildsReadyForProject("");
    setBuildsLoading(true);
    setBuildType("");
    setQaEngineer("");
    setQaEngineerEmail("");
    setReleasedBy("");

    (async () => {
      try {
        const data = await fetchFinalBuilds(project, {
          authToken: backendApiToken,
        });

        const records = Array.isArray(data)
          ? data.filter((b) => b?.builds && b?.buildVersion)
          : [];

        const buildNames = [
          ...new Set(records.map((b) => String(b.builds || "").trim()).filter(Boolean)),
        ];

        let nameOptions = buildNames.map((name) => ({
          value: name,
          label: name,
        }));

        if (nameOptions.length === 0) {
          nameOptions = [
            {
              value: "__NO_BUILDS__",
              label: "No Builds Available",
            },
          ];
        }

        if (cancelled) return;

        setBuildRecords(records);
        setBuildNameOptions(nameOptions);

        setBuildName((prevBuildName) => {
          const exists = nameOptions.some((opt) => opt.value === prevBuildName);
          return exists ? prevBuildName : nameOptions[0]?.value || "";
        });
      } catch (e) {
        if (cancelled) return;

        console.error("Failed to load builds for project", project, e);

        setBuildRecords([]);
        setBuildNameOptions([]);
        setBuildOptions([]);
        setBuildName("");
        setBuild("");
        setBuildType("");
        setQaEngineer("");
        setQaEngineerEmail("");
      } finally {
        if (!cancelled) {
          setBuildsReadyForProject(project);
          setBuildsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [project, backendApiToken, projectsReady]);

  useEffect(() => {
    if (!buildName || buildName === "__NO_BUILDS__") {
      setBuildOptions([]);
      setBuild("");
      setBuildType("");
      setQaEngineer("");
      setQaEngineerEmail("");
      setReleasedBy("");
      return;
    }

    let options = buildRecords
      .filter((b) => String(b?.builds || "").trim() === buildName)
      .map((b) => ({
        value: b.buildVersion,
        label: b.buildVersion,
        buildName: b.builds,
        id: b._id,
        raw: b,
      }));

    if (options.length === 0) {
      options = [
        {
          value: "__NO_BUILDS__",
          label: "No Versions Available",
          buildName,
        },
      ];
    }

    setBuildOptions(options);

    setBuild((prevBuild) => {
      const exists = options.some((opt) => opt.value === prevBuild);
      return exists ? prevBuild : options[0]?.value || "";
    });
  }, [buildName, buildRecords]);

  useEffect(() => {
    localStorage.setItem("project", project || "");
    localStorage.setItem("buildName", buildName || "");
    localStorage.setItem("build", build || "");
  }, [project, buildName, build]);

  /* =========================================================
     6) FETCH BUILD DETAILS
  ========================================================= */
  useEffect(() => {
    if (!backendApiToken) {
      return;
    }

    const projectId =
      typeof project === "string" ? project : project?.id || project?._id || "";

    const buildId =
      typeof build === "string" ? build : build?.value || build?.id || build?._id || "";

    setBuildType("");
    setQaEngineer("");
    setQaEngineerEmail("");
    setReleasedBy("");

    if (!projectId || !buildId || buildId === "__NO_BUILDS__") return;

    const selectedBuildOption = buildOptions.find((option) => {
      return option?.value === buildId || option?.label === buildId;
    });

    const selectedBuildName =
      selectedBuildOption?.buildName ||
      selectedBuildOption?.raw?.buildName ||
      selectedBuildOption?.raw?.builds ||
      buildName ||
      "";


    const selectedBuildRaw = selectedBuildOption?.raw || null;
    const directBuildType =
      selectedBuildRaw?.buildType ||
      selectedBuildRaw?.type ||
      selectedBuildRaw?.build_type ||
      "";
    const directReleasedBy = getReleasedByName(selectedBuildRaw?.releasedBy || selectedBuildRaw?.released_by || selectedBuildRaw?.releasedByName);
    const directQaEngineer =
      selectedBuildRaw?.qaEngineer ||
      selectedBuildRaw?.qaAssignee ||
      selectedBuildRaw?.assignedTo ||
      selectedBuildRaw?.tester ||
      selectedBuildRaw?.qa_engineer ||
      "";
    const directQaEngineerEmail =
      selectedBuildRaw?.qaAssigneeEmail ||
      selectedBuildRaw?.testerEmail ||
      selectedBuildRaw?.assignedToEmail ||
      selectedBuildRaw?.qaEngineerEmail ||
      selectedBuildRaw?.qa_engineer_email ||
      "";

    if (directReleasedBy) {
      setReleasedBy(directReleasedBy);
    }

    if (directBuildType || directQaEngineer) {
      setBuildType(directBuildType);
      setQaEngineer(directQaEngineer);
      setQaEngineerEmail(directQaEngineerEmail);
      if (directReleasedBy) return;
    }

    const resolvedBuildRecordId = `${projectId}${selectedBuildName}${buildId}`;

    const controller = new AbortController();

    (async () => {
      try {
        const resp2 = await getBuildById(resolvedBuildRecordId, {
          authToken: backendApiToken,
          signal: controller.signal,
        });
        const data2 = resp2?.data ?? resp2;

        setBuildType(
          data2?.buildType || data2?.type || data2?.build_type || ""
        );

        setReleasedBy(getReleasedByName(data2?.releasedBy || data2?.released_by || data2?.releasedByName));

        setQaEngineer(
          data2?.qaEngineer ||
          data2?.qaAssignee ||
          data2?.assignedTo ||
          data2?.tester ||
          data2?.qa_engineer ||
          ""
        );
        setQaEngineerEmail(
          data2?.qaAssigneeEmail ||
          data2?.testerEmail ||
          data2?.assignedToEmail ||
          data2?.qaEngineerEmail ||
          data2?.qa_engineer_email ||
          ""
        );
      } catch (err) {
        if (err?.name !== "AbortError") {
          console.error("Failed to fetch build:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [
    typeof project === "string" ? project : project?.id || project?._id || "",
    typeof build === "string" ? build : build?.value || build?.id || build?._id || "",
    backendApiToken,
    buildOptions,
  ]);

  /* =========================================================
     TITLE
  ========================================================= */
  useEffect(() => {
    localStorage.setItem("navbar", activeTab);

    if (activeTab === "QA Engineer") {
      document.title = "Sign Offs | QA Portal";
    } else {
      document.title = `${activeTab || "Home"} | QA Portal`;
    }
  }, [activeTab]);

  useEffect(() => {
    setMountedTabs((current) => {
      if (current[activeTab]) {
        return current;
      }

      return {
        ...current,
        [activeTab]: true,
      };
    });
  }, [activeTab]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!showProfileCard) return;

      if (
        profileCardRef.current &&
        !profileCardRef.current.contains(event.target)
      ) {
        setShowProfileCard(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [showProfileCard]);

  const handleUserManualDownload = async () => {
    if (manualDownloading) return;

    setManualDownloadError("");
    setManualDownloading(true);

    try {
      const token = await getBackendToken();
      const response = await fetch(`${BASE_URL}/api/files/download-docx`, {
        method: "GET",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const message =
          response.status === 404
            ? "User manual file was not found."
            : text || `Unable to download user manual. HTTP ${response.status}`;
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
      const fileName = fileNameMatch?.[1]
        ? decodeURIComponent(fileNameMatch[1])
        : "UserManual.docx";
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("User manual download failed", error);
      const message = error?.message || "Unable to download user manual.";
      setManualDownloadError(message);
      window.alert(message);
    } finally {
      setManualDownloading(false);
    }
  };
  const handleLogout = async () => {
    try {
      const acc = msalInstance.getActiveAccount();

      localStorage.clear();
      sessionStorage.clear();

      await msalInstance.logoutRedirect({
        account: acc,
        postLogoutRedirectUri: "/",
      });
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  /*
    Keep your existing JSX/render return block below this line unchanged.
  */

  // Fix tab mismatch (use the same string everywhere)
  const isBuildHistoryTabOpen = activeTab === "Build history";
  const isLogActivityTabOpen = activeTab === "Logs";
  const isAITreandsTabOpen = activeTab === "AITrends";
  const isReleaseBuildTsbOpen = activeTab === "Release Build";
  const isAdminPanelsbOpen = activeTab === "Admin";
  const isKBTabOpen = activeTab === "Knowledge base";
  const compactSidebar = role === "ADMIN";
  const NavItem = ({
    active,
    onClick,
    icon,
    label,
    danger = false,
    badge,
    showDot = false,
  }) => {
    const hasBadge =
      badge !== undefined && badge !== null && String(badge).trim() !== "";

    const badgeText = String(badge).trim();

    return (
      <button
        onClick={onClick}
        title={label}
        className={[
          "group relative flex w-full cursor-pointer items-center rounded-2xl font-medium",
          navCollapsed ? "px-1.5 py-2" : "",
          compactSidebar
            ? "gap-2.5 px-2.5 py-2 text-[13px]"
            : "gap-3 px-3 py-2 text-sm",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-[1px] hover:shadow-md",
          navCollapsed ? "justify-center" : "justify-start",
          danger
            ? "text-red-600 hover:bg-red-50"
            : active
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg"
              : "text-gray-700 hover:bg-gray-100",
        ].join(" ")}
      >
        {/* Active glow bar */}
        {active && (
          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-white/70" />
        )}

        {/* Icon */}
        <span
          className={[
            "relative grid place-items-center rounded-xl",
            compactSidebar ? "h-8 w-8" : "h-10 w-10",
            "transition-all duration-300",
            "group-hover:rotate-[-6deg] group-hover:scale-105",
            danger
              ? "bg-red-50 text-red-600 group-hover:bg-red-100"
              : active
                ? "bg-white/20 text-white shadow-inner"
                : "bg-gray-50 text-gray-700 group-hover:bg-gray-200",
          ].join(" ")}
        >
          {icon}

          {navCollapsed && showDot && (
            <span
              className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white shadow-sm"
              aria-hidden="true"
            />
          )}

          {/* 🔔 Badge (collapsed) */}
          {navCollapsed && hasBadge && (
            <span
              className="
              absolute -top-1 -right-1 px-2 h-[18px]
              rounded-full bg-gradient-to-r from-pink-500 to-red-600
              text-white text-[10px] font-bold
              flex items-center justify-center
              animate-pulse shadow-md
            "
            >
              {badgeText}
            </span>
          )}
        </span>

        {/* Label */}
        {!navCollapsed && (
          <span className="inline-flex min-w-0 flex-1 items-center gap-2 leading-5 transition-all duration-200 group-hover:translate-x-0.5">
            <span className="truncate">{label}</span>
            {showDot && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-white shadow-sm"
                aria-hidden="true"
              />
            )}
          </span>
        )}

        {/* 🔔 Badge (expanded) */}
      </button>
    );
  };

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

  const normalizeBuildApprovalIds = (items = []) => {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) =>
        String(
          item?.id ??
            item?.buildId ??
            item?.projectId ??
            `${item?.projectName || ""}${item?.builds || ""}${item?.buildVersion || ""}`
        ).trim()
      )
      .filter(Boolean);
  };

  const normalizeSignoffApprovalIds = (items = []) => {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) =>
        String(
          item?.id ??
            item?.signoffId ??
            `${item?.projectName || item?.project || ""}${item?.buildName || ""}${item?.version || ""}`
        ).trim()
      )
      .filter(Boolean);
  };

  const readSeenBuildApprovalIds = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(buildApprovalSeenKey) || "[]");
      return new Set(Array.isArray(raw) ? raw.map((id) => String(id)) : []);
    } catch {
      return new Set();
    }
  };

  const saveSeenBuildApprovalIds = (ids = []) => {
    localStorage.setItem(
      buildApprovalSeenKey,
      JSON.stringify([...new Set(ids.map((id) => String(id)).filter(Boolean))])
    );
  };

  const readSeenSignoffApprovalIds = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(signoffApprovalSeenKey) || "[]");
      return new Set(Array.isArray(raw) ? raw.map((id) => String(id)) : []);
    } catch {
      return new Set();
    }
  };

  const saveSeenSignoffApprovalIds = (ids = []) => {
    localStorage.setItem(
      signoffApprovalSeenKey,
      JSON.stringify([...new Set(ids.map((id) => String(id)).filter(Boolean))])
    );
  };

  const unreadGeneral = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );
  useEffect(() => {
    let alive = true;
    const normalizedRole = String(role || "").trim().toUpperCase();
    const canSeeBuildApprovals = normalizedRole === "DEVMANAGER" || normalizedRole === "ADMIN";
    const canSeeSignoffApprovals = normalizedRole === "QAMANAGER" || normalizedRole === "ADMIN";

    if (!isAuthenticated || (!canSeeBuildApprovals && !canSeeSignoffApprovals)) {
      setBuildApprovalUnreadCount(0);
      setSignoffApprovalUnreadCount(0);
      return undefined;
    }

    const loadApprovalCounts = async () => {
      try {
        const [buildCount, pendingBuildsResult, signoffCount, pendingSignoffsResult] = await Promise.all([
          canSeeBuildApprovals
            ? fetchBuildApprovalUnreadCount().catch((err) => {
              if (!isUnauthorizedError(err)) {
                console.warn("Failed to fetch build approval unread count:", err);
              }
              return 0;
            })
            : Promise.resolve(0),
          canSeeBuildApprovals
            ? fetchPendingBuilds("", effectiveEmail || email || "").catch((err) => {
              if (!isUnauthorizedError(err)) {
                console.warn("Failed to fetch pending build approvals:", err);
              }
              return null;
            })
            : Promise.resolve([]),
          canSeeSignoffApprovals
            ? fetchSignoffApprovalUnreadCount().catch((err) => {
              if (!isUnauthorizedError(err)) {
                console.warn("Failed to fetch sign-off approval unread count:", err);
              }
              return 0;
            })
            : Promise.resolve(0),
          canSeeSignoffApprovals
            ? getAllSignoffsPendingApproval().catch((err) => {
              if (!isUnauthorizedError(err)) {
                console.warn("Failed to fetch pending sign-off approvals:", err);
              }
              return null;
            })
            : Promise.resolve([]),
        ]);

        const pendingBuildsLoaded = Array.isArray(pendingBuildsResult);
        const pendingBuildIds = pendingBuildsLoaded
          ? normalizeBuildApprovalIds(pendingBuildsResult)
          : [];
        const seenBuildIds = readSeenBuildApprovalIds();
        const isViewingBuildApprovals = activeTab === "Approve Builds";
        if (pendingBuildsLoaded && isViewingBuildApprovals) {
          saveSeenBuildApprovalIds(pendingBuildIds);
        }
        const hasUnseenPendingBuild =
          !isViewingBuildApprovals && pendingBuildIds.some((id) => !seenBuildIds.has(id));
        const backendBuildApprovalCount = Number(buildCount) || 0;
        const buildApprovalCount = pendingBuildsLoaded
          ? hasUnseenPendingBuild
            ? Math.max(backendBuildApprovalCount, pendingBuildIds.length)
            : 0
          : isViewingBuildApprovals
            ? 0
            : backendBuildApprovalCount;
        const pendingSignoffsLoaded = Array.isArray(pendingSignoffsResult);
        const pendingSignoffIds = pendingSignoffsLoaded
          ? normalizeSignoffApprovalIds(pendingSignoffsResult)
          : [];
        const seenSignoffIds = readSeenSignoffApprovalIds();
        const isViewingSignoffApprovals = activeTab === "Approve Sign Offs";
        if (pendingSignoffsLoaded && isViewingSignoffApprovals) {
          saveSeenSignoffApprovalIds(pendingSignoffIds);
        }
        const hasUnseenPendingSignoff =
          !isViewingSignoffApprovals && pendingSignoffIds.some((id) => !seenSignoffIds.has(id));
        const backendSignoffApprovalCount = Number(signoffCount) || 0;
        const signoffApprovalCount = pendingSignoffsLoaded
          ? hasUnseenPendingSignoff
            ? Math.max(backendSignoffApprovalCount, pendingSignoffIds.length)
            : 0
          : isViewingSignoffApprovals
            ? 0
            : backendSignoffApprovalCount;

        if (!alive) return;
        setBuildApprovalPendingIds(pendingBuildIds);
        setSignoffApprovalPendingIds(pendingSignoffIds);
        setBuildApprovalUnreadCount(buildApprovalCount);
        if (buildApprovalCount === 0) {
          setBuildApprovalDotHidden(false);
        } else if (hasUnseenPendingBuild) {
          setBuildApprovalDotHidden(false);
        }
        setSignoffApprovalUnreadCount(signoffApprovalCount);
        if (signoffApprovalCount === 0) {
          setSignoffApprovalDotHidden(false);
        } else if (hasUnseenPendingSignoff) {
          setSignoffApprovalDotHidden(false);
        }
      } catch (err) {
        if (!isUnauthorizedError(err)) {
          console.warn("Failed to fetch approval unread counts:", err);
        }
      }
    };
    loadApprovalCounts();
    const timer = window.setInterval(loadApprovalCounts, 60000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [activeTab, buildApprovalSeenKey, effectiveEmail, email, isAuthenticated, role, signoffApprovalSeenKey]);

  /* =========================================================
     Notification bell (fetch on open)
  ========================================================= */
  const loadNotifications = async () => {
    if (!effectiveEmail) return;
    setLoadingNotifications(true);
    setNotifError("");
    try {
      const list = await fetchNotifications(effectiveEmail);
       setNotifications(Array.isArray(list) ? list : []);
    } catch (err) {
      if (isUnauthorizedError(err)) return;
      console.error("Notification fetch failed:", err);
      setNotifError("Could not load notifications. Please try again.");
    } finally {
      setLoadingNotifications(false);
    }
  };

  // preload notifications so bell badge shows on initial page load
  useEffect(() => {
    if (effectiveEmail) {
      loadNotifications();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveEmail]);

  const toggleNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) {
      loadNotifications();
    }
  };

  const handleMarkRead = async (id) => {
    if (!id || deletingNotificationIdsRef.current.has(id)) return;

    deletingNotificationIdsRef.current.add(id);
    const notificationToRestore = notifications.find((n) => n.id === id);

    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setExpandedNotifications((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    try {
      await deleteNotification(id);
      setNotifError("");
    } catch (err) {
      if (isUnauthorizedError(err)) return;

      if (err?.status === 404) {
        setNotifError("");
        return;
      }

      console.error("delete notification failed", err);
      if (notificationToRestore) {
        setNotifications((prev) => (
          prev.some((n) => n.id === id) ? prev : [notificationToRestore, ...prev]
        ));
      }
      setNotifError(err?.message || "Could not delete notification.");
    } finally {
      deletingNotificationIdsRef.current.delete(id);
    }
  };

  const handleDismissAssignmentAlert = async (id) => {
    if (!id || deletingNotificationIdsRef.current.has(id)) return;

    deletingNotificationIdsRef.current.add(id);
    const notificationToRestore = notifications.find((n) => n.id === id);

    setNotifications((prev) => prev.filter((n) => n.id !== id));

    try {
      await deleteNotification(id);
      setNotifError("");
    } catch (err) {
      if (isUnauthorizedError(err)) return;

      if (err?.status === 404) {
        setNotifError("");
        return;
      }

      console.error("dismiss assignment alert failed", err);
      if (notificationToRestore) {
        setNotifications((prev) => (
          prev.some((n) => n.id === id) ? prev : [notificationToRestore, ...prev]
        ));
      }
      setNotifError(err?.message || "Could not dismiss alert.");
    } finally {
      deletingNotificationIdsRef.current.delete(id);
    }
  };

  const toggleNotificationExpand = (id) => {
    setExpandedNotifications((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!showNotifications) return;

    const handleOutsideClick = (event) => {
      if (notificationsPanelRef.current && !notificationsPanelRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [showNotifications]);

  const markBuildApprovalsViewed = () => {
    saveSeenBuildApprovalIds(buildApprovalPendingIds);
    setBuildApprovalDotHidden(true);
    setBuildApprovalUnreadCount(0);
    markBuildApprovalsSeen().catch((err) => {
      if (!isUnauthorizedError(err)) {
        console.warn("Failed to mark build approvals seen:", err);
      }
    });
  };

  const markSignoffApprovalsViewed = () => {
    saveSeenSignoffApprovalIds(signoffApprovalPendingIds);
    setSignoffApprovalDotHidden(true);
    setSignoffApprovalUnreadCount(0);
    markSignoffApprovalsSeen().catch((err) => {
      if (!isUnauthorizedError(err)) {
        console.warn("Failed to mark sign-off approvals seen:", err);
      }
    });
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeTab === "Approve Builds") {
      markBuildApprovalsViewed();
    } else if (activeTab === "Approve Sign Offs") {
      markSignoffApprovalsViewed();
    }
  }, [activeTab, isAuthenticated]);

  const openApproveBuilds = () => {
    markBuildApprovalsViewed();
    setActiveTab("Approve Builds");
  };

  const openApproveSignoffs = () => {
    markSignoffApprovalsViewed();
    setActiveTab("Approve Sign Offs");
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <LoadingDialog
        open={selectorsLoading}
        title="Please wait"
        message={selectorLoadingMessage}
      />

      <SessionExpiredDialog
        open={sessionDialogOpen}
        message={sessionDialogMessage}
      />

      {projectsError ? (
        <div className="mx-4 mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {projectsError}
        </div>
      ) : null}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showSidebar && (
          <aside
            className={[
              navCollapsed ? "w-20" : "w-88",
              navCollapsed
                ? "shrink-0 p-1.5 transition-all duration-200"
                : "shrink-0 p-2 transition-all duration-200",
            ].join(" ")}
          >
            <div className={`h-full bg-white shadow-md rounded-2xl ${navCollapsed ? "p-2" : compactSidebar ? "p-3" : "p-4"
              }`}>
              <div className={["flex h-full flex-col", compactSidebar ? "gap-2.5" : "gap-3.5"].join(" ")}>
                {/* Top header */}
                {/* Top header */}
                <div className={[compactSidebar ? "mb-1.5" : "mb-3", navCollapsed ? "relative h-12" : ""].join(" ")}>
                  <div className={["flex items-center", navCollapsed ? "justify-center pr-1" : "justify-between pr-1"].join(" ")}>
                    {!navCollapsed ? (
                      <img
                        src="/nc-logo.png"
                        alt="NathCorp Logo"
                        className="h-14 w-auto object-contain cursor-pointer transition-all"
                        onClick={() => window.location.reload()}
                        title="Home"
                      />
                    ) : (
                      <span />
                    )}
                    {/* Toggle */}
                    <button
                      onClick={() => setNavCollapsed((v) => !v)}
                      className={[
                        "mr-1 inline-flex h-12 w-12 items-center justify-center text-gray-600",
                        "hover:bg-gray-50 hover:text-gray-800 transition cursor-pointer",
                        navCollapsed ? "absolute left-1/2 -translate-x-1/2 top-1" : ""
                      ].join(" ")}
                      title={navCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4 6h16M4 12h16M4 18h16"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>


                {/* Nav items */}
                <nav className={`min-h-0 flex-1 overflow-y-auto flex flex-col ${compactSidebar ? "gap-2.5" : "gap-3"}`}>
                  <NavItem
                    active={activeTab === "Dashboard"}
                    onClick={() => setActiveTab("Dashboard")}
                    label="Dashboard"
                    icon={
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="3"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M7 15v3M12 11v7M17 8v10"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    }
                  />

                  {role === "DEVENGINEER" && (
                    <NavItem
                      active={activeTab === "Release Build"}
                      onClick={() => setActiveTab("Release Build")}
                      label="Release Build"
                      navCollapsed={navCollapsed}
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M14 3c-4 1-7 4-8 8l7 7c4-1 7-4 8-8V3h-7Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 11l-2 6 6-2"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M13 8h.01"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      }
                    />
                  )}

                  {role === "ADMIN" && (
                    <NavItem
                      active={activeTab === "Admin"}
                      onClick={() => setActiveTab("Admin")}
                      label="Admin Panel"
                      icon={
                        // ADMIN icon (fixed)
                        // ADMIN icon (fixed)
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 21a8 8 0 0 1 16 0"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>

                      }
                    />
                  )}

                  {(role === "DEVMANAGER" || role === "ADMIN") && (
                    <NavItem
                      active={activeTab === "Approve Builds"}
                      onClick={openApproveBuilds}
                      label="Approve Builds"
                      showDot={buildApprovalUnreadCount > 0 && !buildApprovalDotHidden}
                      navCollapsed={navCollapsed}
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M4 6h16v2H4V6Zm0 5h10v2H4v-2Zm0 5h16v2H4v-2Z"
                            fill="currentColor"
                          />
                        </svg>
                      }
                    />
                  )}

                  {(role !== "NORMALUSER") && (<NavItem
                    active={activeTab === "AITrends"}
                    onClick={() => setActiveTab("AITrends")}
                    label="AI Orchestration"
                    icon={
                      // Build history icon (fixed)


                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="6" cy="12" r="2" stroke="currentColor" strokeWidth="2" />
                        <circle cx="18" cy="6" r="2" stroke="currentColor" strokeWidth="2" />
                        <circle cx="18" cy="18" r="2" stroke="currentColor" strokeWidth="2" />

                        <path
                          d="M8 12h6M6 10V8M6 14v2M12 12l4-4M12 12l4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>

                    }
                  />)}

                  {(role === "QAMANAGER" || role === "ADMIN") && (
                    <NavItem
                      active={activeTab === "Approve Sign Offs"}
                      onClick={openApproveSignoffs}
                      label="Approve Sign Offs"
                      showDot={signoffApprovalUnreadCount > 0 && !signoffApprovalDotHidden}
                      navCollapsed={navCollapsed}
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M9 11l2 2 4-4 2 2-6 6-4-4 2-2Z" fill="currentColor" />
                        </svg>
                      }
                    />
                  )}

                  {(role !== "NORMALUSER") && (<NavItem
                    active={activeTab === "Build history"}
                    onClick={() => setActiveTab("Build history")}
                    label="Build History"
                    icon={
                      // Build history icon (fixed)
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 8v5l3 2M21 12a9 9 0 1 1-3.3-7M21 3v6h-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    }
                  />)
                  }

                  {(role === "QAMANAGER" || role === "QAENGINEER" || role === "ADMIN") && (
                    <NavItem
                      active={activeTab === "Knowledge base"}
                      onClick={() => setActiveTab("Knowledge base")}
                      label="Knowledge Base"
                      icon={
                        // Knowledge base icon (fixed)
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M4 4h7v16H4V4Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M13 4h7v16h-7V4Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>


                      }
                    />
                  )}

                  {role === "QAENGINEER" && (
                    <NavItem
                      active={activeTab === "QA Engineer"}
                      onClick={() => setActiveTab("QA Engineer")}
                      label="Sign Offs"
                      icon={
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M7 7h10v2H7V7Zm0 4h10v2H7v-2Zm0 4h6v2H7v-2Z" fill="currentColor" />
                        </svg>
                      }
                    />
                  )}

                  {role === "ADMIN" && (
                    <NavItem
                      active={activeTab === "Logs"}
                      onClick={() => setActiveTab("Logs")}
                      label="Logs"
                      icon={
                        // Logs icon (fixed)
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M6 2h9l3 3v17H6V2Z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15 2v4h4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinejoin="round"
                          />
                        </svg>


                      }
                    />
                  )}

                </nav>
                <div className={navCollapsed ? "mt-auto pt-1" : "mt-auto pt-2"}>
                  <div
                    className={[
                      "group relative flex w-full cursor-pointer items-center rounded-2xl font-medium",
                      navCollapsed ? "px-1.5 py-2 justify-center" : "gap-3 px-3 py-2 justify-start",
                      "text-sm text-gray-700 transition-all duration-300 ease-out hover:-translate-y-[1px] hover:bg-gray-50 hover:shadow-md",
                    ].join(" ")}
                    role="button"
                    tabIndex={0}
                    onClick={handleUserManualDownload}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleUserManualDownload();
                      }
                    }}
                    title="User Manual"
                    aria-label="User Manual"
                    aria-disabled={manualDownloading}
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-700"
                      aria-hidden="true"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 4.5h9.5a2 2 0 0 1 2 2V19a1 1 0 0 1-1.45.9l-2.05-1.02a1 1 0 0 0-.89 0l-2.11 1.05a1 1 0 0 1-.9 0L8 18.88a1 1 0 0 0-.89 0L5.05 19.9A1 1 0 0 1 4 19V6.5a2 2 0 0 1 2-2Z"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 8h6M8 11h6M8 14h4"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>

                    {!navCollapsed && (
                      <span className="truncate">{manualDownloading ? "Downloading..." : "User Manual"}</span>
                    )}
                  </div>
                  {manualDownloadError && !navCollapsed ? (
                    <div className="mt-1 px-3 text-xs font-medium text-rose-600">
                      {manualDownloadError}
                    </div>
                  ) : null}

                  <NavItem
                    danger
                    active={false}
                    onClick={handleLogout}
                    label="Logout"
                    icon={
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M10 17v2H4V5h6v2H6v10h4Z" fill="currentColor" />
                        <path d="M13 7l5 5-5 5v-3H9v-4h4V7Z" fill="currentColor" />
                      </svg>
                    }
                  />
                  {navCollapsed ? (
                    <div className="pt-2 flex justify-center">
                      <div
                        className="inline-flex h-8 w-8 items-center justify-center cursor-pointer rounded-full border border-gray-200 bg-white text-[16px] font-bold text-gray-800 shadow-sm"
                        title="© 2026 NathCorp Inc · Version 1.6.0"
                        aria-label="© 2026 NathCorp Inc · Version 1.6.0"
                      >
                        ©
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 pt-2 text-[11px] text-gray-500 leading-tight">
                      <div className="mb-2 h-px bg-gray-200" />
                      © 2026 NathCorp Inc · Version 2.0.0
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        )}


        <div className="flex-1 min-w-0 flex flex-col">
          {(
            <header className="relative z-[20] shrink-0 overflow-visible border-b border-gray-200 bg-slate-50 py-2 shadow-none backdrop-blur-none">
              <div className="mx-auto h-full max-w-full overflow-visible px-3 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 gap-3 h-full min-w-0 w-full overflow-visible sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start lg:items-center">
                  <div className="flex flex-col gap-3 w-full min-w-0 overflow-visible lg:flex-row lg:items-center lg:gap-6">
                    <img
                      src={qaPortalLogo}
                      alt="QA Portal"
                      className="shrink-0 h-7 sm:h-10 w-fit max-w-[160px] object-contain whitespace-nowrap"
                    />

                    {!hideBuildControls && (
                      <div
                        className="flex w-full min-w-0 items-end gap-2 overflow-x-auto overflow-y-hidden xl:overflow-x-visible xl:overflow-y-hidden [&::-webkit-scrollbar]:hidden"
                        style={{
                          scrollbarWidth: "none",
                          msOverflowStyle: "none",
                        }}
                      >
                        <div className="w-32 shrink-0 sm:w-36 lg:w-40">
                          <div className="text-[8px] font-semibold uppercase text-gray-500">
                            Project
                          </div>
                          <SimpleSelect
                            key="s1"
                            value={project}
                            onChange={setProject}
                            options={projectList}
                            className="!m-0 sm:!m-0 !w-full !px-1.5 !py-1.5 !text-xs sm:!text-sm"
                          />
                        </div>

                        <div className="w-28 shrink-0 sm:w-32 lg:w-36">
                          <div className="text-[8px] font-semibold uppercase text-gray-500">
                            Build
                          </div>
                          <SimpleSelect
                            key="build-name"
                            value={buildName}
                            onChange={setBuildName}
                            options={buildNameOptions}
                            disabled={!project || buildsLoading || buildNameOptions.length === 0}
                            className="!m-0 sm:!m-0 !w-full !px-1.5 !py-1.5 !text-xs sm:!text-sm"
                          />
                        </div>

                        <div className="w-20 shrink-0 sm:w-24">
                          <div className="text-[8px] font-semibold uppercase tracking-wide text-gray-500">
                            Version
                          </div>

                          <div className="relative group">
                            <VersionSelect
                              key="s2"
                              value={build}
                              onChange={setBuild}
                              options={buildOptions}
                              disabled={!buildName || buildName === "__NO_BUILDS__"}
                              className="!m-0 sm:!m-0 !w-full !px-1.5 !py-1.5 !text-xs sm:!text-sm"
                            />
                          </div>
                        </div>

                        {activeTab !== "AITrends" && (
                          <>
                            <div className="w-24 shrink-0 sm:w-28">
                              <div className="text-[8px] font-semibold uppercase tracking-wide text-gray-500">
                                Build Type
                              </div>

                              <div className="relative group">
                                <div
                                  className={`inline-flex min-h-8 w-full items-center justify-center gap-2 rounded-md border px-2 text-[8px] font-semibold sm:text-xs ${buildTypeClass}`}
                                >
                                  <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                                  <span className="truncate">{buildType || "NA"}</span>
                                </div>
                              </div>
                            </div>

                            <div
                              className="w-36 shrink-0 sm:w-44"
                              title={
                                qaengineer
                                  ? "Assigned Tester for this build."
                                  : "Either build is not available or tester is not assigned"
                              }
                            >
                              <div className="text-[8px] font-semibold uppercase tracking-wide text-gray-500">
                                Tester
                              </div>

                              <div className="flex min-h-8 items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2">
                                <span className="h-4 w-1 shrink-0 rounded-full bg-indigo-500" />

                                <span className="min-w-0 truncate text-xs font-semibold text-blue-800 sm:text-sm">
                                  {String(qaengineer || "").trim() || "Not Assigned"}
                                </span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="relative z-[200] flex items-center justify-end gap-2 shrink-0 self-start overflow-visible sm:gap-3 sm:self-auto">
                    {/* Notification bell */}
                    <div ref={notificationsPanelRef} className="relative z-[300] overflow-visible">
                      <button
                        type="button"
                        onClick={toggleNotifications}
                        className="w-10 h-10 rounded-full bg-white cursor-pointer border border-gray-200 flex items-center justify-center text-gray-700 hover:bg-gray-50 shadow-none"
                        title="Notifications"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z"
                          />

                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13.73 21a2 2 0 01-3.46 0"
                          />
                        </svg>
                      </button>

                      {unreadGeneral > 0 && (
                        <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white shadow-sm" />
                      )}

                      {showNotifications && (
                        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-sm bg-white shadow-2xl border border-gray-200/80 rounded-2xl z-[10000] sm:w-96">
                          <div className="px-4 py-3 border-b flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-gray-900">
                                Notifications
                              </span>

                              <span className="text-xs text-gray-500">
                                {notifications.length ? `${notifications.length} total` : "No new"}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => setShowNotifications(false)}
                              className="text-xs cursor-pointer text-gray-500 hover:text-gray-700"
                            >
                              Close
                            </button>
                          </div>

                          {loadingNotifications && (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              Loading...
                            </div>
                          )}

                          {notifError && (
                            <div className="px-4 py-3 text-sm text-rose-600">
                              {notifError}
                            </div>
                          )}

                          {!loadingNotifications && !notifError && notifications.length === 0 && (
                            <div className="px-4 py-3 text-sm text-gray-500">
                              No notifications.
                            </div>
                          )}

                          <div
                            className="max-h-[320px] overflow-y-auto [&::-webkit-scrollbar]:hidden"
                            style={{
                              scrollbarWidth: "none",
                              msOverflowStyle: "none",
                            }}
                          >
                            <ul className="divide-y divide-gray-100">
                              {notifications.map((n) => (
                                <li
                                  key={n.id}
                                  className={[
                                    "px-4 py-3 text-sm transition-colors",
                                    n.isRead
                                      ? "bg-white hover:bg-gray-50"
                                      : "bg-indigo-50/70 hover:bg-indigo-100",
                                  ].join(" ")}
                                >
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleNotificationExpand(n.id)}
                                      className="text-left w-full"
                                    >
                                      <div
                                        className={[
                                          "font-semibold text-gray-900",
                                          expandedNotifications.has(n.id)
                                            ? "whitespace-pre-wrap break-words"
                                            : "truncate",
                                        ].join(" ")}
                                      >
                                        {n.message || n.type}
                                      </div>
                                    </button>

                                    {n.projectId && (
                                      <div className="text-lg text-gray-800 mt-0.5">
                                        Project: {n.projectId}
                                      </div>
                                    )}

                                    <div className="text-[11px] text-gray-400 mt-1">
                                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                                    </div>

                                    {!n.isRead && (
                                      <button
                                        type="button"
                                        className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                                        onClick={() => handleMarkRead(n.id)}
                                      >
                                        <span className="h-1 w-1 cursor-pointer rounded-full bg-indigo-500" />
                                        Mark as read
                                      </button>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </div>

                    <AzureDevOpsUpdateNotifier />

                    <div ref={profileCardRef} className="relative z-[300] overflow-visible">
                      <button
                        type="button"
                        onClick={() => setShowProfileCard((v) => !v)}
                        className="w-10 h-10 overflow-hidden rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-semibold shadow-none"
                      >
                        {profilePictureUrl ? (
                          <img
                            src={profilePictureUrl}
                            alt="User profile"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          (effectiveEmail || "NA").substring(0, 2)
                        )}
                      </button>

                      {showProfileCard && (
                        <div className="absolute top-full right-0 mt-3 w-[calc(100vw-1.5rem)] max-w-xs rounded-xl border border-blue-100 bg-white shadow-lg z-[10000] p-4 text-sm text-gray-800">
                          <div className="mb-3 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />

                            <div className="text-xs font-semibold uppercase text-blue-600">
                              Profile
                            </div>
                          </div>

                          <div className="mb-3 flex justify-center">
                            <div className="h-14 w-14 overflow-hidden rounded-full border border-blue-200 bg-blue-50 shadow-sm grid place-items-center">
                              {profilePictureUrl ? (
                                <img
                                  src={profilePictureUrl}
                                  alt="User profile"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="text-blue-600 font-semibold">
                                  {(effectiveEmail || "NA").substring(0, 2)}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="h-px bg-blue-100 mb-3" />

                          <div className="flex items-center justify-center gap-2 mb-2 text-center">
                            <span className="font-semibold text-gray-900">
                              {(username || effectiveEmail || "").trim() || "N/A"}
                            </span>

                            <span className="text-blue-400">|</span>

                            <span className="font-semibold text-blue-600">
                              {(role || "").trim() || "N/A"}
                            </span>
                          </div>

                          <div className="text-center text-gray-500 text-xs break-all">
                            {effectiveEmail}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </header>
          )}

          <main className="flex-1 min-h-0 overflow-y-auto">
            {mountedTabs["Dashboard"] && (
              <div className={activeTab === "Dashboard" ? "block" : "hidden"}>
                <Dashboard
                  backendApiToken={backendApiToken}
                  project={project}
                  build={build}
                  buildName={buildName}
                  setActiveTab={setActiveTab}
                  role={role}
                  notifications={notifications}
                  onDismissAssignmentAlert={handleDismissAssignmentAlert}
                />
              </div>
            )}

            {mountedTabs["Logs"] && (
              <div className={activeTab === "Logs" ? "block" : "hidden"}>
                <Logs />
              </div>
            )}

            {mountedTabs["Test progress"] && (
              <div className={activeTab === "Test progress" ? "block" : "hidden"}>
                <TestProgress
                  project={project}
                  buildName={buildName}
                  version={build}
                />
              </div>
            )}

            {mountedTabs["Build history"] && (
              <div className={activeTab === "Build history" ? "block" : "hidden"}>
                <BuildHistory />
              </div>
            )}

            {mountedTabs["Approve Builds"] && (
              <div className={activeTab === "Approve Builds" ? "block" : "hidden"}>
                <DevManager />
              </div>
            )}

            {mountedTabs["Approve Sign Offs"] && (
              <div className={activeTab === "Approve Sign Offs" ? "block" : "hidden"}>
                <PendingSignoffApprovals />
              </div>
            )}

            {mountedTabs["QA Engineer"] && (
              <div className={activeTab === "QA Engineer" ? "block" : "hidden"}>
                <QAEngineer
                  projectName={project}
                  build={buildName}
                  releasedBy={releasedBy || ""}
                  assignedTester={qaengineer || ""}
                  assignedTesterEmail={qaEngineerEmail || ""}
                  buildTestingStatus={selectedBuildTestingStatus}
                  version={build}
                />
              </div>
            )}

            {mountedTabs["Release Build"] && (
              <div className={activeTab === "Release Build" ? "block" : "hidden"}>
                <ReleaseBuildSection projectNames={projectList} />
              </div>
            )}

            {mountedTabs["AITrends"] && (
              <div className={activeTab === "AITrends" ? "block" : "hidden"}>
                <AITrendsGraph
                  title="Bug Trends"
                  organization={"NC-QA"}
                  project={project}
                  buildName={buildName}
                  tag={build}
                  apiBaseUrl={import.meta.env.VITE_API_BASE_URL}
                  projectOptions={projectList}
                  buildNameOptions={buildNameOptions}
                  versionOptions={buildOptions}
                  onProjectChange={setProject}
                  onBuildNameChange={setBuildName}
                  onVersionChange={setBuild}
                />
              </div>
            )}

            {mountedTabs["Admin"] && (
              <div className={activeTab === "Admin" ? "block" : "hidden"}>
                <AdminControlPanel />
              </div>
            )}

            {mountedTabs["Knowledge base"] && (
              <div className={activeTab === "Knowledge base" ? "block" : "hidden"}>
                <KnowledgeSection />
              </div>
            )}
          </main>
        </div>
      </div>

      <FloatingChatbot organization={"NC-QA"} project={project} role={role} />
    </div>
  );

}

