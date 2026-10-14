import React, { useState, useRef, useEffect } from "react";
import AutocompleteInput from "./AutocompleteInput";
import { fetchProjects } from "../api/fetchProjects";
import { fetchLatestReleasedVersion, releaseBuild } from "../api/releaseBuild";
import { fetchFinalBuilds } from "../api/fetchBuildsApi";
import SimpleSelectForBR from "./SimpleSelectForBR";
import { useSelector } from "react-redux";
import InternalReleaseNotesGenerator from "./InternalReleaseNotesGenerator";
import { createNotification } from "../api/notificationsApi";
import { getDevManagers } from "../api/userFromEmail";
import { isUnauthorizedError } from "../config/unauthorizedSession";


const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED_EXT = [
  ".jar",
  ".war",
  ".zip",
  ".apk",
  ".ipa",
  ".aab",
  ".tar",
  ".gz",
  ".exe",
  ".jar",
  ".dll",
];
const BUILD_TYPES = [
  { value: "WEB_APP", label: "Web App" },
  { value: "MOBILE_APP", label: "Mobile App" },
  { value: "SCRIPTS", label: "Scripts" },
  { value: "SERVICES", label: "Services" },
  { value: "AUTOMATED_FLOW", label: "Automated Flow" },
  { value: "DOCUMENTS", label: "Documents" },
  { value: "APIS", label: "APIs" },
  { value: "AI_MODEL", label: "AI Model" },
  { value: "AI_AGENT", label: "AI Agent" },
];

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function uid(prefix = "") {
  return prefix + Math.random().toString(36).slice(2, 9);
}
const CHAR_LIMIT = 200;

function countWords(text) {
  return (text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampToWordLimit(text, limit) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  return words.length <= limit ? text : words.slice(0, limit).join(" ");
}
function buildProjectId(projectName, buildName, version) {
  return [projectName, buildName, version]
    .map((part) => String(part || "").trim())
    .join("");
}

export default function ReleaseBuildSection({ projectNames, initialReleases = [], onUpload = null }) {
  const [buildName, setBuildName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [showLatestVersionOnVersionField, setShowLatestVersionOnVersionField] = useState(false);
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceType, setSourceType] = useState("url"); // "file" | "url"
  const [urlReleaseNoteValue, seturlReleaseNoteValue] = useState("");
  const [urlBuildValue, seturlBuildValue] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [buildType, setBuildType] = useState("WEB_APP");
  const [testPriority, setTestPriority] = useState("Medium");
  const [success, setSuccess] = useState("");
  // const [notifyStatus, setNotifyStatus] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState(null);
  const { email, username, role } = useSelector((s) => s.auth);
  const [docxLoading, setDocxLoading] = useState(false);
  const [showReleaseNoteForm, setShowReleaseNoteForm] = useState(false);
  const versionRef = useRef(null);
  const [versionValid, setVersionValid] = useState(false);
  const releaseNoteUrlRef = useRef(null);
  const buildUrlRef = useRef(null);
  const [approverOptions, setApproverOptions] = useState([]);
  const [selectedApprover, setSelectedApprover] = useState("");
  const [devTested, setDevTested] = useState("Yes");
  const [devTestResultUrl, setDevTestResultUrl] = useState("");
  const [buildNameOptions, setBuildNameOptions] = useState([]);
  const [buildNameLoading, setBuildNameLoading] = useState(false);
  const [latestReleasedVersion, setLatestReleasedVersion] = useState("");
  const [latestVersionLoading, setLatestVersionLoading] = useState(false);
  const [latestVersionError, setLatestVersionError] = useState("");


  useEffect(() => {
    const normalizedProjectName = String(projectName || "").trim();

    if (!normalizedProjectName) {
      setBuildNameOptions([]);
      setBuildName("");
      setBuildNameLoading(false);
      return undefined;
    }

    let alive = true;

    async function loadBuildNames() {
      try {
        setBuildNameLoading(true);

        const data = await fetchFinalBuilds(normalizedProjectName);
        const records = Array.isArray(data)
          ? data.filter((b) => b?.builds)
          : [];

        const names = [
          ...new Set(records.map((b) => String(b.builds || "").trim()).filter(Boolean)),
        ];

        const options = names.map((name) => ({
          value: name,
          label: name,
        }));

        if (!alive) return;

        setBuildNameOptions(options);
        setBuildName((prev) => {
          if (options.some((option) => option.value === prev)) {
            return prev;
          }
          return "";
        });
      } catch (err) {
        if (!alive) return;
        if (!isUnauthorizedError(err)) {
          console.error("Failed to load build names for release build", err);
        }
        setBuildNameOptions([]);
        setBuildName("");
      } finally {
        if (alive) setBuildNameLoading(false);
      }
    }

    loadBuildNames();

    return () => {
      alive = false;
    };
  }, [projectName]);
  useEffect(() => {
    setLatestReleasedVersion("");
    setLatestVersionError("");
    setLatestVersionLoading(false);
    setShowLatestVersionOnVersionField(false);
  }, [projectName, buildName]);

  async function handleVersionFieldFocus() {
    const normalizedProjectName = String(projectName || "").trim();
    const normalizedBuildName = String(buildName || "").trim();

    setShowLatestVersionOnVersionField(true);

    if (!normalizedProjectName || !normalizedBuildName) {
      setLatestReleasedVersion("");
      setLatestVersionError("Select build name");
      setLatestVersionLoading(false);
      return;
    }

    try {
      setLatestVersionLoading(true);
      setLatestVersionError("");

      const latest = await fetchLatestReleasedVersion({
        projectName: normalizedProjectName,
        buildName: normalizedBuildName,
      });

      setLatestReleasedVersion(String(latest || "").trim());
    } catch (err) {
      if (isUnauthorizedError(err)) return;

      setLatestReleasedVersion("");
      if (err?.status === 404) {
        setLatestVersionError("");
        setShowLatestVersionOnVersionField(false);
      } else {
        setLatestVersionError(err?.message || "Failed to load latest released version");
      }
    } finally {
      setLatestVersionLoading(false);
    }
  }
  // open release notes generator
  const openReleaseNotes = () => setShowReleaseNoteForm(true);

  // come back to this page
  const goBack = () => setShowReleaseNoteForm(false);

  // const [projectNames, setProjectNames] = useState([]);
  const [value, setValue] = useState("");

  const [releases, setReleases] = useState(
    (Array.isArray(initialReleases) && initialReleases.slice()) || []
  );
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  function resetFormFields() {
    setBuildName("");
    setProjectName("");
    setVersion("");
    setNotes("");
    setSourceType("url");
    seturlBuildValue("");
    seturlReleaseNoteValue("");
    setFile(null);
    setSelectedApprover("");
    setDevTested("Yes");
    setDevTestResultUrl("");
    setFieldErrors({});
    setError("");
    setVersionValid(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // handle dropped files
  const onDrop = (f) => {
    if (!f) return;
    validateAndSetFile(f);
  };

  function validateRequiredFields({ includeUrls = true } = {}) {
    const errs = {};
    if (!projectName.trim()) errs.projectName = "Project is required.";
    if (!buildName.trim()) errs.buildName = "Build name is required.";
    if (versionRef.current && !versionRef.current.checkValidity()) {
      versionRef.current.reportValidity();
      errs.version = true;
      setVersionValid(false);
    } else if (versionRef.current) {
      setVersionValid(true);
    }
    if (includeUrls) {
      if (releaseNoteUrlRef.current && !releaseNoteUrlRef.current.checkValidity()) {
        releaseNoteUrlRef.current.reportValidity();
        errs.urlReleaseNoteValue = true;
      }
      if (buildUrlRef.current && !buildUrlRef.current.checkValidity()) {
        buildUrlRef.current.reportValidity();
        errs.urlBuildValue = true;
      }
    }
    // Description is optional now
    if (!buildType) errs.buildType = "Build type is required.";
    if (!testPriority) errs.testPriority = "Test priority is required.";
    if (!devTested) errs.devTested = "Dev Tested is required.";
    if (String(devTested || "") === "Yes" && !devTestResultUrl.trim()) {
      errs.devTestResultUrl = "Dev Test Result URL is required.";
    }
    if (includeUrls && sourceType === "url") {
      if (!urlReleaseNoteValue.trim()) errs.urlReleaseNoteValue = "Release Note URL is required.";
      if (!urlBuildValue.trim()) errs.urlBuildValue = "Build URL is required.";
    }
    return errs;
  }

  // Validate minimal fields before opening the release-note generator
  const handleOpenReleaseNotes = (e) => {
    e.preventDefault();
    setError("");
    const errs = validateRequiredFields({ includeUrls: false });
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setShowReleaseNoteForm(true);
  };

  function validateAndSetFile(f) {
    setError("");
    const name = f.name || "";
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    if (ALLOWED_EXT.length && !ALLOWED_EXT.includes(ext)) {
      setError(`Unsupported file type "${ext}". Allowed: ${ALLOWED_EXT.join(", ")}`);
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError(`File too large. Max ${formatBytes(MAX_FILE_BYTES)} allowed.`);
      return;
    }
    setFile(f);
  }

  const validateUrlField = (ref, value, requiredMsg = "Required") => {
    if (!ref.current) return;
    const v = String(value || "").trim();
    try {
      const url = new URL(v);
      if (url.protocol === "http:" || url.protocol === "https:") {
        ref.current.setCustomValidity("");
        return;
      }
      ref.current.setCustomValidity("Enter a valid http/https URL");
    } catch {
      ref.current.setCustomValidity(v ? "Enter a valid http/https URL" : requiredMsg);
    }
  };

  useEffect(() => {
    if (String(devTested || "") === "Yes") {
      return;
    }

    setDevTestResultUrl("");
    setFieldErrors((prev) => {
      if (!prev?.devTestResultUrl) return prev;
      const next = { ...prev };
      delete next.devTestResultUrl;
      return next;
    });
  }, [devTested]);

  const fetchDevManagers = async () => {
    const users = await getDevManagers();
    const list = Array.isArray(users) ? users : [];
    return list
      .map((u) => ({
        email: String(u?.email || "").trim(),
        name: String(u?.name || u?.username || u?.email || "").trim(),
        role: String(u?.role || "").trim(),
      }))
      .filter((u) => u.email || u.name);
  };

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const managers = await fetchDevManagers();
        if (!active) return;
        setApproverOptions(managers);
      } catch (err) {
        console.error("Failed to load dev managers/admins", err);
        if (!active) return;
        setApproverOptions([]);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const notifyDevManagers = async (buildInfo) => {
    try {

      const managers = await fetchDevManagers();

      if (
        !Array.isArray(managers) ||
        managers.length === 0
      ) {
        return "No Dev Managers found.";
      }

      // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ ONLY selected manager + admins
      const recipients = managers.filter((mgr) => {

        const email =
          String(mgr?.email || "")
            .trim()
            .toLowerCase();

        const role =
          String(mgr?.role || "")
            .trim()
            .toUpperCase();

        const selected =
          String(selectedApprover || "")
            .trim()
            .toLowerCase();

        // send to:
        // 1. selected manager
        // 2. all admins

        return (
          email === selected ||
          role === "ADMIN"
        );
      });

      if (recipients.length === 0) {
        return "No matching approver found.";
      }

      const buildLabel =
        buildInfo?.projectName ||
        buildInfo?.projectId ||
        buildInfo?.builds ||
        projectName ||
        "Project";

      const versionLabel =
        buildInfo?.buildVersion ||
        buildInfo?.version ||
        version ||
        "";

      const projectId =
        buildInfo?.projectId ||
        buildProjectId(
          buildInfo?.projectName || projectName,
          buildInfo?.buildName || buildInfo?.builds || buildName,
          versionLabel
        );

      const releasedByLabel =
        String(
          buildInfo?.releaseByEmail ||
          buildInfo?.releasedByEmail ||
          buildInfo?.releasedBy ||
          email ||
          username ||
          "Dev Engineer"
        ).trim();

      const title =
        `Build approval requested for ${buildLabel}` +
        (versionLabel ? ` ${versionLabel}` : "");

      const message =
        `Build ${buildLabel}` +
        (versionLabel ? ` (${versionLabel})` : "") +
        ` is submitted for approval by ${releasedByLabel}.`;

      const results = await Promise.allSettled(
        recipients.map(async (mgr) => {

          const payload = {
            userId: mgr.email || mgr.name,
            title,
            message,
            type: "DEV_BUILD_RELEASE",
            projectId,
            isRead: false,
          };

         
          return createNotification(payload);
        })
      );

       

      const unauthorizedFailure =
        results.some(
          (result) =>
            result.status === "rejected" &&
            isUnauthorizedError(result.reason)
        );

      if (unauthorizedFailure) {
        return "";
      }

      const failures =
        results.filter(
          (r) => r.status === "rejected"
        ).length;

      const succeeded =
        recipients.length - failures;

      const summary =
        failures === 0
          ? `Notified ${recipients.length} recipient${recipients.length > 1 ? "s" : ""}.`
          : `Notified ${succeeded}/${recipients.length} recipients.`;

 
      return summary;

    } catch (err) {

      console.error(
        "Failed to send notifications",
        err
      );

      return "Could not send notifications.";
    }
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    // setNotifyStatus("");
    const errs = validateRequiredFields({ includeUrls: true });
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;

    if (sourceType === "file" && !file) return setError("Please choose a build file.");
    const bt = (buildType ?? "").trim();
    setBuildType(bt);
    if (!bt) return setError("Please select build type.");
    // console.log("")
    setLoading(true);
    try {
      let artifactUrl = null;
      let fileName = undefined;
      let fileSize = undefined;

      // Handle file upload (server or fallback)
      if (sourceType === "file") {
        fileName = file?.name;
        fileSize = file?.size;

        if (typeof onUpload === "function") {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("buildName", buildName);
          formData.append("version", version);
          formData.append("notes", notes);
          const result = await onUpload(formData, { buildName, version, notes });
          if (!result || !result.artifactUrl) {
            throw new Error("Upload handler did not return an artifactUrl.");
          }
          artifactUrl = result.artifactUrl;
        } else {
          artifactUrl = URL.createObjectURL(file);
        }
      } else {
        // sourceType === "url"
        artifactUrl = urlBuildValue.trim();
      }

      // ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ FIXED: Build payload matching backend BuildDto
      const payload = {
        projectId: buildProjectId(projectName, buildName, version),

        builds: buildName.trim(),

        buildName: buildName.trim(),

        buildVersion: version.trim(),

        description: notes?.trim() || "",

        buildUrl: artifactUrl,

        buildType: buildType,

        releaseNoteUrl:
          urlReleaseNoteValue.trim() || "",

        projectName:
          projectName?.trim() ||
          buildName.trim(),

        releasedBy:
          username?.trim() || "",

        releaseByEmail:
          email?.trim() || "",

        approverEmail:
          selectedApprover.trim() || "",

        devTested: devTested,

        devTestResultUrl:
          String(devTested || "") === "Yes"
            ? devTestResultUrl.trim()
            : "",

        testPriority: testPriority,

        testingStatus: "Not Started",
      };

      const saved = await releaseBuild(payload, {
        user: { email, username, role },
      });

      if (!saved || !saved.projectId) {
        throw new Error("Empty response from server");
      }

      const notificationStatus = await notifyDevManagers(saved);

      setSuccess(
        notificationStatus
          ? `Build released successfully. ${notificationStatus}`
          : "Build released successfully"
      );
      setSubmittedSummary({
        projectName: projectName?.trim() || "-",
        buildName: buildName?.trim() || "-",
        version: version?.trim() || "-",
      });
      resetFormFields();

      // Add to UI state
      // setReleases((r) => [saved || payload, ...r]);

      // Reset form
      // setBuildName("");
      // setVersion("");
      // setNotes("");
      // setFile(null);
      // seturlBuildValue("");
      // seturlReleaseNoteValue("");
      // setSourceType("url");
      // setError("");
      // setSuccess("Build released successfully ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦");
      setShowSuccessModal(true);
    } catch (err) {
      console.error(err);
      if (isUnauthorizedError(err)) return;
      setError(err?.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  function handleRemove(id) {
    const toRemove = releases.find((r) => r.id === id);
    // revoke object URL if used and local
    if (toRemove?.type === "file" && toRemove?.artifactUrl?.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(toRemove.artifactUrl);
      } catch { }
    }
    setReleases((r) => r.filter((x) => x.id !== id));
  }

  function handleCopy(url) {
    navigator.clipboard?.writeText(url).catch(() => { });
  }
  function showSuccess(s) {
    if (!s) {
      setSuccess("");
      setSubmittedSummary(null);
    }
    setShowSuccessModal(s);

  }

  // Auto-hide success UI after 5 seconds
  useEffect(() => {
    if (!success && !showSuccessModal) return;

    const timeoutId = setTimeout(() => {
      setSuccess("");
      setShowSuccessModal(false);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [success, showSuccessModal]);

  if (showReleaseNoteForm) {
    return (
      <InternalReleaseNotesGenerator
        project={projectName}
        releaseBuildVersion={version}
        buildName={buildName}
        build={version}
        selectedManager={selectedApprover}
        devTested={devTested}
        devTestResultUrl={devTestResultUrl}
        buildUrl={urlBuildValue}
        goBack={goBack}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">

      <header className="px-6 py-4 mt-4 ml-4 mr-10 bg-white border rounded-lg flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Release Build</h1>
          <p className="text-sm text-gray-500">
            Submit a build for approval and generate release notes.
          </p>
        </div>

      </header>

      {/* Body */}
      <main className="flex-1 overflow-hidden">
        <form
          onSubmit={handleSubmit}
          className="h-full grid grid-cols-1 lg:grid-cols-4 gap-6 p-4 overflow-auto"
        >
          {/* Main Form */}
          <section className="lg:col-span-3 bg-white rounded-lg border p-6 space-y-6">
            {/* ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ Inline success banner (optional but nice) */}
            {/* {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      className="h-5 w-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      {success}
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Your request is submitted and waiting for approval.
                    </p>
                  </div>
                </div>
              </div>
            )} */}

            {/* ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚ÂÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ Error banner only for non-field errors (e.g., file issues) */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            )}

            {/* Project */}
            <SimpleSelectForBR
              value={projectName}
              onChange={setProjectName}
              options={projectNames}
              label="Project"
              placeholder="- Select Project -"
              required
            />
            {fieldErrors.projectName && (
              <p className="text-xs text-red-600">{fieldErrors.projectName}</p>
            )}

            {/* Build Name + Version */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Build Name <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  list="release-build-name-options"
                  value={buildName}
                  onChange={(e) => {
                    setBuildName(e.target.value);

                    if (fieldErrors.buildName) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.buildName;
                        return next;
                      });
                    }
                  }}
                  disabled={!projectName.trim() || buildNameLoading}
                  placeholder={
                    !projectName.trim()
                      ? "Select project"
                      : buildNameLoading
                        ? "Loading builds..."
                        : "-Select Existing Build or Create New Build-"
                  }
                  className="mt-1 block w-full px-3 py-2 border rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100 disabled:text-gray-500"
                  required
                />

                <datalist id="release-build-name-options">
                  {buildNameOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>

                

                {fieldErrors.buildName && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.buildName}</p>
                )}

              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Version <span className="text-red-500">*</span>
                </label>

                <input
                  ref={versionRef}
                  value={version}
                  onFocus={handleVersionFieldFocus}
                  onClick={handleVersionFieldFocus}
                  onChange={(e) => {
                    let v = e.target.value;

                    // Allow only digits and dots, max 3 parts (X.Y.Z)
                    v = v.replace(/[^0-9.]/g, "");
                    v = v.replace(/^\.+/, "").replace(/\.{2,}/g, ".");
                    const parts = v.split(".").slice(0, 3).map((p) => p.replace(/\D/g, ""));
                    v = parts.join(".");

                    setVersion(v);
                    const trimmed = v.trim();

                    if (!trimmed) {
                      versionRef.current?.setCustomValidity(
                        "Use exactly 3 digits like X.Y.Z (e.g., 1.2.3)"
                      );
                    } else if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
                      versionRef.current?.setCustomValidity(
                        "Use exactly 3 digits like X.Y.Z (e.g., 1.2.3)"
                      );
                    } else {
                      versionRef.current?.setCustomValidity("");
                    }
                  }}
                  onBlur={() => {
                    setVersion((v) => {
                      const cleaned = v.replace(/\.$/, "");
                      const trimmed = cleaned.trim();

                      if (!trimmed) {
                        versionRef.current?.setCustomValidity(
                          "Use exactly 3 digits like X.Y.Z (e.g., 1.2.3)"
                        );
                      } else if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
                        versionRef.current?.setCustomValidity(
                          "Use exactly 3 digits like X.Y.Z (e.g., 1.2.3)"
                        );
                      } else {
                        versionRef.current?.setCustomValidity("");
                      }

                      return cleaned;
                    });
                  }}
                  placeholder="e.g. 1.2.3"
                  inputMode="numeric"
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                  required
                  pattern="^\d+\.\d+\.\d+$"
                  title="Use exactly 3 digits like X.Y.Z (e.g., 1.2.3)"
                />

                {showLatestVersionOnVersionField && (
                  <div className="mt-1 text-xs text-gray-500">
                    {latestVersionLoading ? (
                      <span>Loading last released version...</span>
                    ) : latestVersionError ? (
                      <span className="text-amber-600">{latestVersionError}</span>
                    ) : (
                      <span>
                        Last released version for{" "}
                        <span className="font-semibold text-gray-800">
                          {buildName || "selected build"}
                        </span>
                        :{" "}
                        <span className="font-semibold text-gray-800">
                          {latestReleasedVersion || "No release yet"}
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Build Type */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Build Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={buildType}
                  onChange={(e) => setBuildType(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm
               focus:ring-2 focus:ring-blue-500"
                  required
                >
                  {BUILD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {fieldErrors.buildType && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.buildType}</p>
              )}

              {/* Test Priority */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Test Priority <span className="text-red-500">*</span>
                </label>

                <select
                  value={testPriority}
                  onChange={(e) => setTestPriority(e.target.value)}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm
               focus:ring-2 focus:ring-blue-500"
                  required
                >                   <option value="Medium">Medium</option>

                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              {fieldErrors.testPriority && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.testPriority}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Dev Tested <span className="text-red-500">*</span>
                </label>

                <div className="mt-1 flex items-center gap-4 rounded-md border bg-white px-3 py-2 text-sm">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="devTested"
                      value="Yes"
                      checked={devTested === "Yes"}
                      onChange={() => setDevTested("Yes")}
                      className="accent-blue-600"
                    />
                    <span>Yes</span>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="devTested"
                      value="No"
                      checked={devTested === "No"}
                      onChange={() => setDevTested("No")}
                      className="accent-blue-600"
                    />
                    <span>No</span>
                  </label>
                </div>

                {fieldErrors.devTested && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.devTested}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Dev Test Result URL
                  {String(devTested || "") === "Yes" && <span className="text-red-500"> *</span>}
                </label>

                <input
                  value={devTestResultUrl}
                  onChange={(e) => {
                    setDevTestResultUrl(e.target.value);
                    if (fieldErrors.devTestResultUrl) {
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.devTestResultUrl;
                        return next;
                      });
                    }
                  }}
                  disabled={String(devTested || "") === "No"}
                  required={String(devTested || "") === "Yes"}
                  placeholder="e.g. https://nathcorp.sharepoint.com/sites/dev-test-results"
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                />

                {fieldErrors.devTestResultUrl && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.devTestResultUrl}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="manager" className="text-sm font-medium text-gray-700">
                Manager <span className="text-red-500">*</span>
              </label>

              <select
                id="manager"
                name="manager"
                value={selectedApprover || ""}
                required
                onInvalid={(e) =>
                  e.currentTarget.setCustomValidity("Please select a manager for approval")
                }
                onChange={(e) => {
                  e.currentTarget.setCustomValidity("");
                  setSelectedApprover(e.target.value);
                }}
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>
                  - Select Manager -
                </option>

                {approverOptions.map((user) => {
                  const optionValue = user.email || user.name;
                  return (
                    <option key={optionValue} value={optionValue}>
                      {(user.name || user.email) +
                        (user.email && user.name !== user.email
                          ? ` (${user.email})`
                          : "")}
                    </option>
                  );
                })}
              </select>
            </div>


            {/* Description */}
            <div>
              <label className="text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="eg. Bug fixes and performance improvements"
                maxLength={CHAR_LIMIT}


                title="Please enter the description"
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm resize-none
                         focus:ring-2 focus:ring-blue-500"
              />
              <div className="text-xs text-gray-500 text-right mt-1">
                {notes?.length || 0}/{CHAR_LIMIT}
              </div>

            </div>



            {/* <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleGenerateDocx}
                disabled={docxLoading || loading}
                className="w-full bg-white border border-blue-200 text-blue-700 rounded-lg py-3 font-semibold
               hover:bg-blue-50 disabled:opacity-60"
              >
                {docxLoading ? "Generating .docx..." : "Create .docx"}
              </button>
 
              <button
                type="submit"
                disabled={loading || !buildType}
                className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium
               hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "Submitting..." : "Request Approval"}
              </button>
            </div> */}

            <div
              className="w-full"
              title={
                loading ||
                  !buildType ||
                  !buildName.trim() ||
                  !projectName.trim() ||
                  !version.trim() ||
                  !testPriority.trim()
                  ? "Please fill all the mandatory fields"
                  : undefined
              }
            >
              <button
                type="button"
                onClick={handleOpenReleaseNotes}
                disabled={
                  loading ||
                  !buildType ||
                  !buildName.trim() ||
                  !projectName.trim() ||
                  !version.trim() ||
                  !testPriority.trim()
                }
                className="w-full rounded-lg border border-black-600 bg-white py-3 font-semibold cursor-pointer
transition duration-150 text-black-900
hover:-translate-y-[1px] hover:shadow-sm hover:bg-red-600 hover:text-white
disabled:opacity-60 disabled:cursor-not-allowed"
                title={
                  loading
                    ? "Please wait..."
                    : !buildType || !buildName.trim() || !projectName.trim() || !testPriority.trim()
                      ? "Please fill all the mandatory fields"
                      : "Create Release Note"
                }
              >
                Create Release Note
              </button>
            </div>

            {/* URLs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Release Note URL
                  {sourceType === "url" && <span className="text-red-500"> *</span>}
                </label>
                <input
                  ref={releaseNoteUrlRef}
                  value={urlReleaseNoteValue}
                  required
                  placeholder="e.g. https://nathcorp.sharepoint.com/sites/notes"
                  onChange={(e) => {
                    seturlReleaseNoteValue(e.target.value);
                    validateUrlField(releaseNoteUrlRef, e.target.value);
                  }}
                  onBlur={(e) => validateUrlField(releaseNoteUrlRef, e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
                {fieldErrors.urlReleaseNoteValue && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.urlReleaseNoteValue}</p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Build URL
                  {sourceType === "url" && <span className="text-red-500"> *</span>}
                </label>
                <input
                  ref={buildUrlRef}
                  value={urlBuildValue}
                  placeholder="e.g. https://nathcorp.sharepoint.com/sites/build"
                  required
                  onChange={(e) => {
                    seturlBuildValue(e.target.value);
                    validateUrlField(buildUrlRef, e.target.value);
                  }}
                  onBlur={(e) => validateUrlField(buildUrlRef, e.target.value)}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
                {fieldErrors.urlBuildValue && (
                  <p className="text-xs text-red-600 mt-1">{fieldErrors.urlBuildValue}</p>
                )}
              </div>
            </div>



            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !buildType}
              className="w-full bg-blue-600 text-white rounded-lg py-3 font-bold cursor-pointer
                       hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Request Approval"}
            </button>


            {success && (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      className="h-5 w-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">
                      {success}
                    </p>
                    <p className="text-xs text-green-700 mt-0.5">
                      Your request is submitted and waiting for approval.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </section>

          {/* Right Info Panel */}
          {/* Right Info Panel */}
          <aside className="block w-full order-first lg:order-none bg-white border rounded-lg p-0 pt-1 px-1 text-sm text-gray-600 overflow-hidden">
            <div className="p-3 bg-white">
              <h4 className="text-lg font-semibold text-gray-900 text-center mb-3">
                Dev-QA Release Workflow
              </h4>

              <div className="space-y-1.5">
                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">1. Build Request</div>
                  <div className="text-[11px] text-black">Dev Engineer request for build release.</div>
                </div>
                <div className="flex items-center justify-center gap-4 text-gray-700">
                  <span className="text-sm leading-none">↓</span>
                  <span className="text-xs sm:text-sm font-medium">↑ Build Reject</span>
                </div>

                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">2. Dev Manager Review</div>
                  <div className="text-[11px] text-black">Manager evaluates and approves/rejects build.</div>
                </div>
                <div className="text-center text-sm font-medium text-gray-700">↓ Approved</div>


                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">3. Release to QA</div>
                  <div className="text-[11px] text-black">Approved build will be released to QA team.</div>
                </div>
                <div className="text-center text-sm leading-none text-gray-700">↓</div>

                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">4. QA Testing</div>
                  <div className="text-[11px] text-black">QA team performs testing and validation.</div>
                </div>
                <div className="text-center text-sm leading-none text-gray-700">↓</div>

                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">5. Sign-off Request</div>
                  <div className="text-[11px] text-black">QA requests formal sign-off.</div>
                </div>
                <div className="flex items-center justify-center gap-4 text-gray-700">
                  <span className="text-sm leading-none">↓</span>
                  <span className="text-xs sm:text-sm font-medium">↑ Sign-off Reject</span>
                </div>

                <div className="rounded-xl border-2 border-gray-300 bg-gray-100 px-2 py-1.5 shadow-sm text-black">
                  <div className="text-xs font-semibold text-black">6. QA Manager Review</div>
                  <div className="text-[11px] text-black">QA Manager review and approves/rejects.</div>
                </div>
                <div className="text-center text-sm font-medium text-gray-700">Sign-off Approved</div>
                <div className="text-center text-sm leading-none text-gray-700">↓</div>
                <div className="text-lg font-semibold text-gray-900 text-center mb-3">Workflow End</div>
              </div>
            </div>
          </aside>
        </form>
      </main>

      {/* ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ SUCCESS MODAL */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 text-center">
            <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="h-7 w-7 text-green-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h3 className="text-lg font-semibold text-gray-900">
              Request Submitted
            </h3>

            <p className="mt-2 text-sm text-gray-600">
              {success || "Your build has been successfully submitted for approval."}
            </p>

            <div className="mt-5 rounded-lg bg-gray-50 border p-3 text-left text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">Project</span>
                <span className="font-medium">{submittedSummary?.projectName || "-"}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-gray-500">Build</span>
                <span className="font-medium">{submittedSummary?.buildName || "-"}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-gray-500">Version</span>
                <span className="font-medium">{submittedSummary?.version || "-"}</span>
              </div>
            </div>

            <button
              onClick={() =>

                showSuccess(false)
              }
              className="mt-6 w-full bg-blue-600 text-white rounded-lg py-2.5 cursor-pointer
                       hover:bg-blue-700 font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );




}

