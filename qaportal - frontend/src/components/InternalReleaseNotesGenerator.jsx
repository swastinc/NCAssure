import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { saveAs } from "file-saver";
import { fetchActiveIssuesList } from "../api/fetchIssues";
import { getAllUsers } from "../api/userFromEmail";
import { getBackendApiTokenAsync } from "../config/msalConfig";
import { fetchFinalBuilds } from "../api/fetchBuildsApi";
import { fetchBugsList } from "../api/fetchBugs";
import {
  Document,
  Footer,
  Packer,
  Paragraph,
  PageNumber,
  TextRun,
  ImageRun,
  HeadingLevel,
  Table,
  TableRow,
  AlignmentType,
  TableCell,
  WidthType,
  BorderStyle,
  Tab,
  TabStopType,
} from "docx";

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadSvgAsPngBuffer(src, width = 1800) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo asset: ${response.status}`);
  }

  const svgText = await response.text();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImageElement(objectUrl);
    const aspectRatio = image.naturalWidth / image.naturalHeight || 1;
    const height = Math.max(1, Math.round(width / aspectRatio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create logo canvas context.");
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to convert logo to PNG."));
      }, "image/png");
    });

    return pngBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const textareaBase =
  "w-full min-h-[110px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500";

const FIELD_LIMITS = Object.freeze({
  short: 50,
  notes: 100,
  dependencies: 5000,
  overview: 500,
  workItems: 100,
});

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


function CharCount({ value, limit, className = "" }) {
  return (
    <span className={classNames("block text-right text-[11px] font-medium text-gray-500", className)}>
      {String(value || "").length}/{limit}
    </span>
  );
}

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeVersion(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getBuildVersionValue(buildItem) {
  return String(
    buildItem?.buildVersion ??
      buildItem?.version ??
      buildItem?.buildNo ??
      buildItem?.build ??
      ""
  ).trim();
}

function getBuildNameValue(buildItem) {
  return String(
    buildItem?.buildName ??
      buildItem?.releaseBuildName ??
      buildItem?.buildDisplayName ??
      buildItem?.name ??
      ""
  ).trim();
}

function getWorkItemId(item) {
  return String(item?.id ?? item?.workItemId ?? item?.workItemID ?? item?.key ?? "").trim();
}

function getWorkItemTitle(item) {
  return String(
    item?.title ??
      item?.fields?.["System.Title"] ??
      item?.fields?.title ??
      item?.summary ??
      ""
  ).trim();
}

function getWorkItemStatus(item) {
  return String(
    item?.status ??
      item?.state ??
      item?.fields?.["System.State"] ??
      item?.fields?.state ??
      ""
  ).trim();
}

function getWorkItemSeverity(item) {
  return String(
    item?.severity ??
      item?.priority ??
      item?.fields?.["Microsoft.VSTS.Common.Severity"] ??
      item?.fields?.["Microsoft.VSTS.Common.Priority"] ??
      ""
  ).trim();
}

function isResolvedBug(item) {
  const status = normalizeText(getWorkItemStatus(item));

  if (!status) return true;

  return ["resolved", "closed", "done", "fixed", "completed"].some((value) =>
    status.includes(value)
  );
}

function isActiveIssue(item) {
  const status = normalizeText(getWorkItemStatus(item));

  if (!status) return true;

  return !["resolved", "closed", "done", "fixed", "completed", "removed"].some((value) =>
    status.includes(value)
  );
}

function normalizeWorkItem(item, buildVersion) {
  return {
    ...item,
    id: getWorkItemId(item),
    title: getWorkItemTitle(item),
    status: getWorkItemStatus(item),
    severity: getWorkItemSeverity(item),
    buildVersion: String(item?.buildVersion ?? buildVersion ?? "").trim(),
    isFixed: String(item?.isFixed ?? "No").trim() || "No",
  };
}

function dedupeWorkItems(items) {
  const seen = new Set();
  const result = [];

  for (const item of Array.isArray(items) ? items : []) {
    const key = getWorkItemId(item) || `${getWorkItemTitle(item)}-${item?.buildVersion || ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function docHeading(text, level = HeadingLevel.HEADING_2) {
  return new Paragraph({
    text,
    heading: level,
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 220, after: 120 },
  });
}

function docLine(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun(String(text || ""))],
  });
}

function docMultiline(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  return lines.map((line) => {
    const value = String(line || "");
    const bulletMatch = value.match(/^\s*(?:[-*•])\s+(.*)$/);

    if (bulletMatch) {
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        bullet: { level: 0 },
        children: [new TextRun(bulletMatch[1] || "")],
      });
    }

    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      children: [new TextRun(value)],
    });
  });
}

function docTable(headers, rows) {
  const b = { style: BorderStyle.SINGLE, size: 1, color: "000000" };
  const safeRows = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row)) : [];
  const cellBorders = {
    top: b,
    bottom: b,
    left: b,
    right: b,
  };

  const makeCell = (value) =>
    new TableCell({
      borders: cellBorders,
      children: [
        new Paragraph({
          children: [new TextRun(String(value ?? ""))],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: b, bottom: b, left: b, right: b, insideH: b, insideV: b },
    rows: [
      new TableRow({
        children: headers.map(
          (h) =>
            new TableCell({
              borders: cellBorders,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true })],
                }),
              ],
            })
        ),
      }),
      ...safeRows.map(
        (r) =>
          new TableRow({
            children: r.map((c) => makeCell(c)),
          })
      ),
    ],
  });
}


const mkQaScope = (seed = {}) => ({
  id: uid(),
  area: "",
  devTested: "Yes",
  qaScope: "",
  outOfScope: "",
  notes: "",
  ...seed,
});

const mkTestingType = (seed = {}) => ({
  id: uid(),
  type: "",
  inScope: "yes",
  notes: "",
  ...seed,
});

const mkImpact = (seed = {}) => ({
  id: uid(),
  area: "",
  details: "",
  ...seed,
});

const mkRisk = (seed = {}) => ({
  id: uid(),
  risk: "",
  impact: "",
  mitigation: "",
  owner: "",
  ...seed,
});

export default function InternalReleaseNotesGenerator({
  goBack,
  project,
  releaseBuildVersion,
  buildName,
  build: initialBuild,
  selectedManager = "",
  devTested = "Yes",
  devTestResultUrl = "",
}) {
  const { username, email } = useSelector((s) => s.auth || {});

  const autoResizeTextarea = (e) => {
    const el = e.currentTarget;
    el.style.height = "42px";
    el.style.height = `${el.scrollHeight}px`;
  };

  const [generating, setGenerating] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const successTimerRef = useRef(null);



  const [activeIssues, setActiveIssues] = useState([]);
  const [loadingActiveIssues, setLoadingActiveIssues] = useState(false);
  const [activeIssuesError, setActiveIssuesError] = useState("");
  const [managerOptions, setManagerOptions] = useState([]);
  const [releaseEnv, setReleaseEnv] = useState("QA");

  const [releaseVersion, setReleaseVersion] = useState(releaseBuildVersion || initialBuild || "");
  const [buildType, setBuildType] = useState("Bug Fix & Minor Enhancements");
  const [devOwner, setDevOwner] = useState("");
  const [qaOwner, setQaOwner] = useState("QA Team");
  const [bugs, setBugs] = useState([]);
  const [depsNotes, setDepsNotes] = useState("");

  const [loadingBugs, setLoadingBugs] = useState(false);

  const [workItems, setWorkItems] = useState("New feature Added/ Bug Fixes");
  const [previousBuildVersions, setPreviousBuildVersions] = useState([]);
  const [workItemsSummaryError, setWorkItemsSummaryError] = useState("");

  const ORGANIZATION = import.meta.env.VITE_ORGANIZATION;

  const inputBase =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10";

  const [qaScope, setQaScope] = useState([mkQaScope({ devTested: "Yes" })]);
  const [loadingLists, setLoadingLists] = useState(false);

  const [buildOverview, setBuildOverview] = useState(
    "This build descriptions. If script brief on this. If App need short brief for this release."
  );

  const qaRows = Array.isArray(qaScope) ? qaScope : [];

  const filledQaRows = qaRows.filter(
    (r) =>
      String(r?.area || "").trim() ||
      String(r?.devTested || "").trim() ||
      String(r?.qaScope || "").trim() ||
      String(r?.outOfScope || "").trim() ||
      String(r?.notes || "").trim()
  );

  const hasValidQaScope = filledQaRows.some(
    (r) =>
      String(r?.area || "").trim() &&
      String(r?.devTested || "").trim() &&
      String(r?.qaScope || "").trim()
  );

  useEffect(() => {
    setReleaseVersion(releaseBuildVersion || initialBuild || "");
  }, [releaseBuildVersion, initialBuild]);


  // async function fetchProjectss(token) {
  //   const res = await fetch(`${BASE_URL}/api/ado/projects`, {
  //     method: "GET",
  //     headers: { Authorization: `Bearer ${token}` },
  //   });
  //   if (!res.ok) {
  //     const text = await res.text();
  //     throw new Error(`Backend ${res.status}: ${text}`);
  //   }
  //   return res.json();
  // }

  // // if (!accessToken) return;
  // useEffect(() => {
  //   // if (!accessToken) return;

  //   (async () => {
  //     try {
  //       const data = await fetchProjectss("s");

  //       // ✅ IMPORTANT FIX
  //       const projectsArray = Array.isArray(data?.value) ? data.value : [];

  //       const options = projectsArray.map((p) => ({
  //         value: p.name,   // or p.id if backend expects id
  //         label: p.name,
  //       }));

  //       setProjects(options);

  //       // auto-select first project
  //       if (options.length > 0) {
  //         setProject(options[0].value);
  //       }
  //     } catch (e) {
  //       console.error("Failed to load projects", e);
  //       setProjects([]);
  //     }
  //   })();
  // }, []);

  // useEffect(() => {
  //   if (!project || !build) {
  //     setActiveIssues([]);
  //     return;
  //   }

  //   const controller = new AbortController();

  //   (async () => {
  //     try {
  //       setLoadingActiveIssues(true);

  //       const list = await fetchActiveIssuesList(
  //         undefined,            // api (default)
  //         ORGANIZATION,         // organization
  //         project,              // project
  //         "accessToken",          // ✅ token (NOT "accessToken" string)
  //         build,                // tag = version
  //         controller.signal     // abort signal
  //       );

  //       setActiveIssues(list);
  //       setKnownIssues(list);
  //     } catch (e) {
  //       if (e.name !== "AbortError") {
  //         console.error("Failed to fetch active issues", e);
  //         setActiveIssues([]);
  //       }
  //     } finally {
  //       setLoadingActiveIssues(false);
  //     }
  //   })();

  //   return () => controller.abort();
  // }, [project, build, buildName]);

  useEffect(() => {
    if (!project || !buildName) {
      setPreviousBuildVersions([]);
      setBugs([]);
      setDefectsFixed([]);
      setActiveIssues([]);
      setKnownIssues([]);
      setWorkItemsSummaryError("");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    async function loadWorkItemsSummaryForBuildName() {
      setLoadingLists(true);
      setLoadingBugs(true);
      setLoadingActiveIssues(true);
      setActiveIssuesError("");
      setWorkItemsSummaryError("");

      try {
        const [token, finalBuildsResponse] = await Promise.all([
          getBackendApiTokenAsync(),
          fetchFinalBuilds(project),
        ]);

        if (cancelled || controller.signal.aborted) return;

        const finalBuilds = Array.isArray(finalBuildsResponse) ? finalBuildsResponse : [];
        const targetBuildName = normalizeText(buildName);
        const currentVersion = normalizeVersion(releaseBuildVersion || initialBuild || releaseVersion || "");
        const hasBuildNameInResponse = finalBuilds.some((item) => getBuildNameValue(item));

        const matchingBuilds = finalBuilds.filter((item) => {
          const buildVersion = getBuildVersionValue(item);
          if (!buildVersion) return false;

          if (hasBuildNameInResponse && normalizeText(getBuildNameValue(item)) !== targetBuildName) {
            return false;
          }

          return normalizeVersion(buildVersion) !== currentVersion;
        });

        const versions = Array.from(
          new Set(matchingBuilds.map((item) => getBuildVersionValue(item)).filter(Boolean))
        );

        if (cancelled || controller.signal.aborted) return;

        setPreviousBuildVersions(versions);

        if (versions.length === 0) {
          setBugs([]);
          setDefectsFixed([]);
          setActiveIssues([]);
          setKnownIssues([]);
          return;
        }

        const [bugsByVersion, activeIssuesByVersion] = await Promise.all([
          Promise.all(
            versions.map(async (buildVersion) => {
              try {
                const list = await fetchBugsList(
                  undefined,
                  ORGANIZATION,
                  project,
                  token,
                  buildVersion,
                  controller.signal,
                  buildName
                );

                return (Array.isArray(list) ? list : []).map((item) =>
                  normalizeWorkItem(item, buildVersion)
                );
              } catch (error) {
                if (error?.name === "AbortError") throw error;
                console.error(`Failed to fetch resolved bugs for ${buildName} ${buildVersion}`, error);
                return [];
              }
            })
          ),
          Promise.all(
            versions.map(async (buildVersion) => {
              try {
                const list = await fetchActiveIssuesList(
                  undefined,
                  ORGANIZATION,
                  project,
                  token,
                  buildVersion,
                  controller.signal,
                  buildName
                );

                return (Array.isArray(list) ? list : []).map((item) =>
                  normalizeWorkItem(item, buildVersion)
                );
              } catch (error) {
                if (error?.name === "AbortError") throw error;
                console.error(`Failed to fetch active issues for ${buildName} ${buildVersion}`, error);
                return [];
              }
            })
          ),
        ]);

        if (cancelled || controller.signal.aborted) return;

        const resolvedBugs = dedupeWorkItems(bugsByVersion.flat()).filter(isResolvedBug);
        const activeIssueRows = dedupeWorkItems(activeIssuesByVersion.flat()).filter(isActiveIssue);

        setBugs(resolvedBugs);
        setDefectsFixed(resolvedBugs);
        setActiveIssues(activeIssueRows);
        setKnownIssues(activeIssueRows);
      } catch (error) {
        if (error?.name !== "AbortError" && !cancelled) {
          console.error("Failed to load work item summary", error);
          setPreviousBuildVersions([]);
          setBugs([]);
          setDefectsFixed([]);
          setActiveIssues([]);
          setKnownIssues([]);
          setActiveIssuesError(error?.message || "Failed to load active issues");
          setWorkItemsSummaryError(error?.message || "Failed to load work item summary");
        }
      } finally {
        if (!cancelled) {
          setLoadingLists(false);
          setLoadingBugs(false);
          setLoadingActiveIssues(false);
        }
      }
    }

    loadWorkItemsSummaryForBuildName();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [project, buildName, releaseBuildVersion, initialBuild, releaseVersion, ORGANIZATION]);

  // ---- Testing Types ----
  const [testingTypes, setTestingTypes] = useState([
    mkTestingType({ type: "Regression", inScope: "yes" }),
    mkTestingType({ type: "Security", inScope: "no" }),
    mkTestingType({ type: "Performance", inScope: "no" }),
    mkTestingType({ type: "API", inScope: "no" }),
    mkTestingType({ type: "Backend/DB", inScope: "yes" }),
  ]);

  const [defectsFixed, setDefectsFixed] = useState([]);
  const [knownIssues, setKnownIssues] = useState([]);

  const [impactSummary, setImpactSummary] = useState([
    mkImpact({ area: "Functional", details: "" }),
    mkImpact({ area: "Integration", details: "" }),
    mkImpact({ area: "UI", details: "" }),
    mkImpact({ area: "API", details: "" }),
    mkImpact({ area: "DB/Data", details: "" }),
    mkImpact({ area: "Config", details: "" }),
  ]);

  const [risks, setRisks] = useState([mkRisk()]);

  const [manager, setManager] = useState(selectedManager || "");

  useEffect(() => {
    setManager(selectedManager || "");
  }, [selectedManager]);

  useEffect(() => {
    if (String(devOwner || "").trim()) return;
    const loggedInName = String(username || email || "").trim();
    if (loggedInName) setDevOwner(loggedInName);
  }, [username, email, devOwner]);

  const updateRow = useCallback((setter, id, patch) => {
    setter((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const removeRow = useCallback((setter, id) => {
    setter((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const requiredMissing = useMemo(() => {
    const missing = [];

    if (!String(buildType || "").trim()) missing.push("Build Type");
    if (!String(buildOverview || "").trim()) missing.push("Build Overview");
    if (!String(devOwner || "").trim()) missing.push("Developer");
    if (!String(depsNotes || "").trim()) missing.push("Dependencies");
    if (!hasValidQaScope) missing.push("QA Scope");
    if (!testingTypes.some((row) => String(row?.type || "").trim())) missing.push("Testing Types");
    if (!String(buildName || "").trim()) missing.push("Build Name");
    if (!String(qaOwner || "").trim()) missing.push("QA Owner");

    return missing;
  }, [buildType, buildOverview, devOwner, qaOwner, hasValidQaScope, testingTypes, depsNotes, buildName]);

  const canGenerate = requiredMissing.length === 0 && !generating;

  const handleGenerateDoc = useCallback(async () => {
    if (!canGenerate) return;

    setGenerating(true);

    try {
      const logoBuffer = await loadSvgAsPngBuffer("/ncsignofflogo.svg");

      const managerDisplay = (() => {
        const raw = String(manager || "").trim();
        if (!raw) return "";
        if (!raw.includes("@")) return raw;

        const matchedManager = managerOptions.find(
          (opt) => String(opt?.email || "").trim().toLowerCase() === raw.toLowerCase()
        );

        return matchedManager?.name || raw;
      })();

      const doc = new Document({
        creator: "Release Notes Generator",
        title: "- Release Notes",
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { before: 0, after: 0 },
                tabStops: [
                  {
                    type: TabStopType.RIGHT,
                    position: 9000,
                  },
                ],
                children: [
                  new TextRun("© 2026 NathCorp Inc"),
                  new Tab(),
                  PageNumber.CURRENT,
                ],
              }),
            ],
          }),
        },
        sections: [
          {
            children: [
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: { after: 180 },
                children: [
                  new ImageRun({
                    data: logoBuffer,
                    transformation: {
                      width: 234,
                      height: 132,
                    },
                  }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: project + " - Release Notes",
                    bold: true,
                    color: "000000",
                  }),
                ],
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.JUSTIFIED,
              }),
              new Paragraph({ text: "" }),

              docLine(
                "This document is intended to formally hand over the build from the Development team to the QA team for validation and testing. It provides build-level information, scope of changes, testing expectations, and known limitations."
              ),

              docHeading("Project Details"),
              docTable(
                ["Field", "Value"],
                [
                  ["Project Name", project],
                  ["Build Name", buildName],
                  ["Version", releaseBuildVersion || ""],
                ]
              ),

              docHeading("Current Build Details"),
              docTable(
                ["Field", "Value"],
                [
                  ["Dev Tested", devTested],
                  [
                    "Dev Test Result URL",
                    String(devTested || "").trim() === "No" ? "NA" : devTestResultUrl || "NA",
                  ],
                  ["Release Environment", releaseEnv],
                  ["Build Type Major/Minor", buildType],
                  ["Developer", devOwner],
                  ["QA Owner", qaOwner],
                  ["CR/WorkItems", workItems],
                ]
              ),

              docHeading("Build Overview"),
              docLine(buildOverview),

              docHeading("QA Scope"),
              docTable(
                ["Affected Module/Area", "Dev Tested", "QA Scope/ What to test", "Out of QA Scope", "Notes"],
                qaScope.map((r) => [r.area, r.devTested, r.qaScope, r.outOfScope, r.notes])
              ),

              docHeading("Testing Types (In/Out of Scope for this release)"),
              docTable(
                ["Test Type", "In Scope Yes/No", "Notes"],
                testingTypes.map((r) => [r.type, r.inScope, r.notes])
              ),

              docHeading("Resolved Bugs from Previous Versions"),
              defectsFixed.length
                ? docTable(
                    ["ID", "Title", "Severity", "Version"],
                    defectsFixed.map((r) => [r.id, r.title, r.severity, r.buildVersion])
                  )
                : docLine("No resolved bugs found for previous versions of this build name."),

              docHeading("Active Issues from Previous Versions"),
              knownIssues.length
                ? docTable(
                    ["ID", "Title", "State", "Version", "Is Fixed"],
                    knownIssues.map((r) => [r.id, r.title, r.status, r.buildVersion, r.isFixed || "No"])
                  )
                : docLine("No active issues found for previous versions of this build name."),

              docHeading("Impact Summary"),
              docTable(
                ["Impact Area", "What Dev Should Fill"],
                impactSummary.map((r) => [r.area, r.details])
              ),

              docHeading("Dependencies & Configuration Notes/Steps for Testing"),
              ...docMultiline(depsNotes),

              docHeading("Risks & Mitigation"),
              risks.length
                ? docTable(
                    ["Risk", "Impact", "Mitigation", "Owner"],
                    risks.map((r) => [r.risk, r.impact, r.mitigation, r.owner])
                  )
                : docLine("No risks captured."),

              docHeading("Approvals"),
              docLine("The build has been reviewed and approved for release to the QA team for testing."),
              new Paragraph({ spacing: { after: 200 } }),
              docTable(["Role", "Approved By"], [["Project Manager", managerDisplay]]),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);

      saveAs(
        blob,
        `ReleaseNote_${String(project || "Project")
          .trim()
          .replace(/\s+/g, "_")}_${String(buildName || "Build")
          .trim()
          .replace(/\s+/g, "_")}_${String(releaseBuildVersion || initialBuild || releaseVersion || "Version")
          .trim()
          .replace(/\s+/g, "_")}.docx`
      );

      setShowSuccessPopup(true);

      if (successTimerRef.current) clearTimeout(successTimerRef.current);

      successTimerRef.current = setTimeout(() => {
        setShowSuccessPopup(false);
        goBack?.();
      }, 4000);
    } finally {
      setGenerating(false);
    }
  }, [
    canGenerate,
    releaseEnv,
    buildType,
    devOwner,
    qaOwner,
    workItems,
    buildOverview,
    qaScope,
    testingTypes,
    defectsFixed,
    knownIssues,
    impactSummary,
    risks,
    manager,
    managerOptions,
    project,
    buildName,
    releaseBuildVersion,
    initialBuild,
    releaseVersion,
    goBack,
    depsNotes,
    devTestResultUrl,
    devTested,
  ]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadManagers = async () => {
      try {
        const users = await getAllUsers();

        const filteredManagers = Array.isArray(users)
          ? users.filter((u) =>
              ["DEVMANAGER", "QAMANAGER", "ADMIN"].includes(
                String(u?.role || "").toUpperCase()
              )
            )
          : [];

        const options = filteredManagers
          .map((u) => ({
            value: u.name || u.email || "",
            label: u.name ? `${u.name}${u.email ? ` (${u.email})` : ""}` : u.email,
            name: u.name || "",
            email: u.email || "",
          }))
          .filter((u) => u.value)
          .sort((a, b) => a.label.localeCompare(b.label));

        if (!cancelled) {
          setManagerOptions(options);
        }
      } catch (error) {
        console.error("Failed to fetch managers", error);
        if (!cancelled) {
          setManagerOptions([]);
        }
      }
    };

    loadManagers();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {showSuccessPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-2xl bg-white shadow-2xl px-6 py-5 text-center max-w-sm w-full border border-green-100">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-gray-900">Document generated successfully</p>
            <p className="text-sm text-gray-600 mt-1">Returning to Release Build...</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <div
          onClick={goBack}
          className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium
             rounded-lg border border-black-200 px-3 py-2
             text-gray-700 hover:bg-gray-50 hover:text-black active:scale-[0.98]
             transition"
        >
          ← Back
        </div>

        <div className="mb-6 mt-6 sm:mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Release Notes</h1>
              <p className="mt-1 text-sm text-gray-600">
                Fill details → Generate Document → Upload Release Note in SharePoint → Paste SharePoint Doc's Link in Release Note URL
              </p>
              <p className="mt-2 text-sm text-gray-600">
                <span className="font-semibold text-gray-900">Purpose:</span> This document is intended to formally hand
                over the build from Dev to QA for validation/testing. It provides build-level info, scope, testing
                expectations, and known limitations.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <Section title="Current Build Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Release Environment" required hint="">
                <select className={inputBase} value={releaseEnv} onChange={(e) => setReleaseEnv(e.target.value)}>
                  <option>QA</option>
                  <option>Staging</option>
                  <option>UAT</option>
                  <option>Prod</option>
                </select>
              </Field>

              <Field label="Build Type (Major/Minor)" required hint={<CharCount value={buildType} limit={FIELD_LIMITS.short} />}> 
                <input
                  className={inputBase}
                  value={buildType}
                  maxLength={FIELD_LIMITS.short}
                  onChange={(e) => setBuildType(e.target.value)}
                  placeholder='e.g., "Bug Fix & Minor Enhancements"'
                />
              </Field>

              <Field label="Developer" required hint={<CharCount value={devOwner} limit={FIELD_LIMITS.short} />}> 
                <input
                  className={inputBase}
                  value={devOwner}
                  maxLength={FIELD_LIMITS.short}
                  onChange={(e) => setDevOwner(e.target.value)}
                  placeholder="Enter name"
                />
              </Field>

              <Field label="QA Owner" required hint={<CharCount value={qaOwner} limit={FIELD_LIMITS.short} />}> 
                <input
                  className={inputBase}
                  value={qaOwner}
                  maxLength={FIELD_LIMITS.short}
                  onChange={(e) => setQaOwner(e.target.value)}
                  placeholder="QA Team"
                />
              </Field>

              <Field label="CR/WorkItems" hint={<CharCount value={workItems} limit={FIELD_LIMITS.workItems} />}> 
                <input
                  className={inputBase}
                  value={workItems}
                  maxLength={FIELD_LIMITS.workItems}
                  onChange={(e) => setWorkItems(e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Build Overview">
            <Field label="Build Overview" required hint={<CharCount value={buildOverview} limit={FIELD_LIMITS.overview} />}> 
              <textarea
                className={textareaBase}
                value={buildOverview}
                maxLength={FIELD_LIMITS.overview}
                onChange={(e) => setBuildOverview(e.target.value)}
                placeholder="Short brief of this release..."
              />
            </Field>
          </Section>

          <Section
            title={
              <span>
                QA Scope <span className="text-red-500">*</span>
              </span>
            }
            right={
              <button
                type="button"
                onClick={() => setQaScope((p) => [...p, mkQaScope()])}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                + Add Row
              </button>
            }
          >
            <div className="text-xs text-gray-500 mb-3">List modules/features and what to test.</div>

            <div className="hidden md:grid grid-cols-5 gap-2 text-xs font-semibold text-gray-500 mb-2">
              <div>Affected Module/Area<span className="text-red-500"> *</span></div>
              <div>Dev Tested<span className="text-red-500"> *</span></div>
              <div>QA Scope / What to test<span className="text-red-500"> *</span></div>
              <div>Out of QA Scope</div>
              <div>Notes</div>
            </div>

            <div className="space-y-2">
              {qaScope.map((r) => (
                <div key={r.id} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-start">
                  <div>
                    <textarea
                      required
                      className="w-full h-[42px] min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                      placeholder="Affected Module/Area"
                      value={r.area}
                      maxLength={FIELD_LIMITS.short}
                      onChange={(e) => updateRow(setQaScope, r.id, { area: e.target.value })}
                      onInput={autoResizeTextarea}
                    />
                    <CharCount value={r.area} limit={FIELD_LIMITS.short} className="mt-0.5" />
                  </div>

                  <select
                    required
                    className={classNames(inputBase, "h-[42px] py-1.5")}
                    value={r.devTested}
                    onChange={(e) => updateRow(setQaScope, r.id, { devTested: e.target.value })}
                  >
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>

                  <div>
                    <textarea
                      required
                      className="w-full h-[42px] min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                      placeholder="QA Scope / What to test"
                      value={r.qaScope}
                      maxLength={FIELD_LIMITS.short}
                      onChange={(e) => updateRow(setQaScope, r.id, { qaScope: e.target.value })}
                      onInput={autoResizeTextarea}
                    />
                    <CharCount value={r.qaScope} limit={FIELD_LIMITS.short} className="mt-0.5" />
                  </div>

                  <div>
                    <textarea
                      className="w-full h-[42px] min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                      placeholder="Out of QA Scope"
                      value={r.outOfScope}
                      maxLength={FIELD_LIMITS.short}
                      onChange={(e) => updateRow(setQaScope, r.id, { outOfScope: e.target.value })}
                      onInput={autoResizeTextarea}
                    />
                    <CharCount value={r.outOfScope} limit={FIELD_LIMITS.short} className="mt-0.5" />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <textarea
                        className="w-full h-[42px] min-h-[42px] rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 resize-y"
                        placeholder="Notes"
                        value={r.notes}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setQaScope, r.id, { notes: e.target.value })}
                        onInput={autoResizeTextarea}
                      />
                      <CharCount value={r.notes} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(setQaScope, r.id)}
                      className="h-[42px] px-3 text-sm font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title={
              <span>
                Testing Types (In / Out of Scope) <span className="text-red-500">*</span>
              </span>
            }
            right={
              <button
                type="button"
                onClick={() => setTestingTypes((p) => [...p, mkTestingType()])}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                + Add Row
              </button>
            }
          >
            <div className="hidden md:grid grid-cols-3 gap-2 text-xs font-semibold text-gray-500 mb-2">
              <div>Test Type</div>
              <div>In Scope (Yes/No)</div>
              <div>Notes</div>
            </div>

            <div className="space-y-2">
              {testingTypes.map((r) => (
                <div key={r.id} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <input
                      className={classNames(inputBase, "py-1.5")}
                      placeholder="Test Type"
                      value={r.type}
                      maxLength={FIELD_LIMITS.short}
                      onChange={(e) => updateRow(setTestingTypes, r.id, { type: e.target.value })}
                    />
                    <CharCount value={r.type} limit={FIELD_LIMITS.short} className="mt-0.5" />
                  </div>

                  <select
                    className={classNames(inputBase, "py-1.5")}
                    value={r.inScope}
                    onChange={(e) => updateRow(setTestingTypes, r.id, { inScope: e.target.value })}
                  >
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Notes"
                        value={r.notes}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setTestingTypes, r.id, { notes: e.target.value })}
                      />
                      <CharCount value={r.notes} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(setTestingTypes, r.id)}
                      className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                      title="Remove row"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-2">
              Tip: Add rows for Regression, Security, Performance, API, Backend/DB as needed.
            </p>
          </Section>

          <Section title="Work Items Summary (Resolved Bugs + Active Issues)">
            <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Build Name:</span>{" "}
                {buildName || "-"}
              </div>
              
            </div>

            {!buildName ? (
              <div className="text-sm text-gray-600">Build name is not available.</div>
            ) : loadingLists || loadingBugs || loadingActiveIssues ? (
              <div className="text-sm text-gray-500">
                Loading resolved bugs and active issues for previous versions of {buildName}…
              </div>
            ) : workItemsSummaryError || activeIssuesError ? (
              <div className="text-sm text-rose-600">{workItemsSummaryError || activeIssuesError}</div>
            ) : previousBuildVersions.length === 0 ? (
              <div className="text-sm text-gray-600">
                No previous final versions found for this build name.
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Resolved Bugs</div>
                    <div className="text-xs text-gray-500">{bugs.length} items</div>
                  </div>

                  <div className="hidden md:grid grid-cols-4 gap-2 text-xs font-semibold text-gray-500 mb-2">
                    <div>ID</div>
                    <div>Title</div>
                    <div>Severity</div>
                    <div>Version</div>
                  </div>

                  {bugs.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No resolved bugs found for previous versions of this build name.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {bugs.map((b) => (
                        <div
                          key={`${b.id || b.title}-${b.buildVersion || "bug"}`}
                          className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        >
                          <div className="font-mono text-gray-800">{b.id || "-"}</div>
                          <div className="text-gray-900 truncate">{b.title || "-"}</div>
                          <div className="font-semibold">{b.severity || "-"}</div>
                          <div className="text-gray-700">{b.buildVersion || "-"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">Active Issues</div>
                    <div className="text-xs text-gray-500">{activeIssues.length} items</div>
                  </div>

                  <div className="mb-3 flex items-center gap-2 text-sm">
                    <input
                      id="select-all-active-issues"
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                      checked={activeIssues.length > 0 && activeIssues.every((it) => String(it.isFixed || "").trim() === "Yes")}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setActiveIssues((prev) =>
                          prev.map((it) => ({
                            ...it,
                            isFixed: checked ? "Yes" : "No",
                          }))
                        );
                        setKnownIssues((prev) =>
                          prev.map((it) => ({
                            ...it,
                            isFixed: checked ? "Yes" : "No",
                          }))
                        );
                      }}
                    />
                    <label htmlFor="select-all-active-issues" className="text-sm text-gray-700">
                      Select all as fixed
                    </label>
                  </div>

                  <div className="hidden md:grid grid-cols-5 gap-2 text-xs font-semibold text-gray-500 mb-2">
                    <div>ID</div>
                    <div>Title</div>
                    <div>State</div>
                    <div>Version</div>
                    <div>Is Fixed</div>
                  </div>

                  {activeIssues.length === 0 ? (
                    <div className="text-sm text-gray-600">
                      No active issues found for previous versions of this build name.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeIssues.map((it) => (
                        <div
                          key={`${it.id || it.title}-${it.buildVersion || "issue"}`}
                          className="grid grid-cols-1 md:grid-cols-5 gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                        >
                          <div className="font-mono text-gray-800">{it.id || "-"}</div>
                          <div className="text-gray-900 truncate">{it.title || "-"}</div>
                          <div className="font-semibold">{it.status || "-"}</div>
                          <div className="text-gray-700">{it.buildVersion || "-"}</div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                              checked={String(it.isFixed || "").trim() === "Yes"}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                const nextValue = checked ? "Yes" : "No";
                                setActiveIssues((prev) =>
                                  prev.map((row) =>
                                    row.id === it.id && row.buildVersion === it.buildVersion
                                      ? { ...row, isFixed: nextValue }
                                      : row
                                  )
                                );
                                setKnownIssues((prev) =>
                                  prev.map((row) =>
                                    row.id === it.id && row.buildVersion === it.buildVersion
                                      ? { ...row, isFixed: nextValue }
                                      : row
                                  )
                                );
                              }}
                            />
                            <span>{String(it.isFixed || "").trim() === "Yes" ? "Yes" : "No"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Section>

          <Section title="Impact Summary">
            <div className="text-xs text-gray-500 mb-3">
              Please write the build's impact on the below area.
            </div>

            <div className="hidden md:grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-semibold text-gray-500 mb-2">
              <div>Impact Area</div>
              <div>Details</div>
              <div></div>
            </div>

            <div className="space-y-2">
              {impactSummary.map((r) => (
                <div key={r.id} className="flex gap-2 items-start">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1">
                    <div>
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Area"
                        value={r.area}
                        maxLength={FIELD_LIMITS.short}
                        onChange={(e) => updateRow(setImpactSummary, r.id, { area: e.target.value })}
                      />
                      <CharCount value={r.area} limit={FIELD_LIMITS.short} className="mt-0.5" />
                    </div>

                    <div>
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Enter details here"
                        value={r.details}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setImpactSummary, r.id, { details: e.target.value })}
                      />
                      <CharCount value={r.details} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRow(setImpactSummary, r.id)}
                    className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                    title="Remove row"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title={
              <>
                Dependencies & Configuration Notes/Steps for Testing
                <span className="text-red-500 ml-1">*</span>
              </>
            }
          >
            <textarea
              className={classNames(inputBase, "min-h-[140px] resize-y leading-6")}
              value={depsNotes}
              maxLength={FIELD_LIMITS.dependencies}
              onChange={(e) => setDepsNotes(e.target.value)}
              placeholder={`Write steps / dependencies here...
 
Example:
- Feature flag ENABLE_QA_SIGNOFF must be enabled
- Azure DevOps PAT configured for QA environment
- Test data available in QA_DB_v3`}
            />
            <CharCount value={depsNotes} limit={FIELD_LIMITS.dependencies} className="mt-1" />
          </Section>

          <Section
            title="Risks & Mitigation"
            right={
              <button
                type="button"
                onClick={() => setRisks((p) => [...p, mkRisk()])}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                + Add Row
              </button>
            }
          >
            <div className="hidden md:grid grid-cols-4 gap-2 text-xs font-semibold text-gray-500 mb-2">
              <div>Risk</div>
              <div>Impact</div>
              <div>Mitigation</div>
              <div>Owner</div>
            </div>

            {risks.length === 0 ? (
              <div className="text-sm text-gray-600">No risks captured.</div>
            ) : (
              <div className="space-y-2">
                {risks.map((r) => (
                  <div key={r.id} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div>
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Risk"
                        value={r.risk}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setRisks, r.id, { risk: e.target.value })}
                      />
                      <CharCount value={r.risk} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>

                    <div>
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Impact"
                        value={r.impact}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setRisks, r.id, { impact: e.target.value })}
                      />
                      <CharCount value={r.impact} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>

                    <div>
                      <input
                        className={classNames(inputBase, "py-1.5")}
                        placeholder="Mitigation"
                        value={r.mitigation}
                        maxLength={FIELD_LIMITS.notes}
                        onChange={(e) => updateRow(setRisks, r.id, { mitigation: e.target.value })}
                      />
                      <CharCount value={r.mitigation} limit={FIELD_LIMITS.notes} className="mt-0.5" />
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          className={classNames(inputBase, "py-1.5")}
                          placeholder="Owner"
                          value={r.owner}
                          maxLength={FIELD_LIMITS.short}
                          onChange={(e) => updateRow(setRisks, r.id, { owner: e.target.value })}
                        />
                        <CharCount value={r.owner} limit={FIELD_LIMITS.short} className="mt-0.5" />
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(setRisks, r.id)}
                        className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
                        title="Remove row"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <div className="sticky bottom-3">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="text-xs text-gray-600">
                {requiredMissing.length ? (
                  <span>
                    Missing required:{" "}
                    <span className="font-medium text-gray-900">{requiredMissing.join(", ")}</span>
                  </span>
                ) : (
                  <span>All required fields complete. You can generate.</span>
                )}
              </div>

              <button
                type="button"
                onClick={handleGenerateDoc}
                disabled={!canGenerate}
                className={classNames(
                  "px-4 py-2 text-sm font-semibold rounded-xl shadow-sm hover:shadow-md transition",
                  canGenerate
                    ? "bg-gray-900 text-white hover:bg-black hover:shadow-lg cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5"
                    : "bg-gray-200 text-gray-600 cursor-not-allowed"
                )}
              >
                {generating ? "Generating..." : "Generate Document"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
















