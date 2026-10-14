// TestProgressReadOnly.jsx
import React, { useEffect, useState } from "react";
import { updateTestStatus } from "../api/fetchTestProgress";
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";
import { getBuildById } from "../api/fetchBuildsApi";

function normalizeIdentity(value) {
  return String(value || "").trim().toLowerCase();
}

function compactIdentity(value) {
  return normalizeIdentity(value).replace(/\s+/g, "");
}

function extractEmail(value) {
  const match = String(value || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : "";
}

function buildRecordId(...parts) {
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
}
function isUnassignedTesterValue(value) {
  const normalized = normalizeIdentity(value);
  return !normalized || normalized === "-" || normalized === "--" || normalized === "n/a" || normalized === "na" || normalized === "none" || normalized === "unassigned";
}

function readAssignedTester(build) {
  if (!build || typeof build !== "object") {
    return { name: "", email: "" };
  }

  const assignedValue =
    build.qaEngineer ??
    build.qaAssignee ??
    build.assignedTo ??
    build.tester ??
    build.qa_engineer ??
    "";
  const assignedEmail =
    build.qaAssigneeEmail ??
    build.testerEmail ??
    build.assignedToEmail ??
    build.qaEngineerEmail ??
    build.qa_engineer_email ??
    extractEmail(assignedValue);

  return {
    name: String(assignedValue || "").replace(/\([^)]*\)/g, ""),
    email: String(assignedEmail || ""),
  };
}
function getBarColor(percent) {
  if (percent >= 75) return "bg-emerald-500";
  if (percent >= 40) return "bg-amber-400";
  return "bg-rose-500";
}

export default function TestProgress({
  project,
  version,
  buildName = "",
  tests = null,
  compact = false,
  showPercent = true,
  onEdit = null,
  onSaveAll = null,
  requiresBasicAccess = false,

}) {
  const { email, username, role } = useSelector((s) => s.auth);

  const isQAManager = role === "QAMANAGER";

  const isQAEngineer = role === "QAENGINEER";

  const defaultTests = [
    { id: 1, name: "Smoke Test", percent: 0 },
    { id: 2, name: "Regression Test", percent: 0 },
    { id: 3, name: "Performance Test", percent: 0 },
    { id: 4, name: "Security Test", percent: 0 },
  ];

  const initial = Array.isArray(tests) && tests.length ? tests : defaultTests;

  const [localList, setLocalList] = useState(initial);
  useEffect(() => setLocalList(initial), [tests]);

  const gapClass = compact ? "gap-3" : "gap-4";
  const pyClass = compact ? "py-2" : "py-3";

  const [editMode, setEditMode] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValues, setEditValues] = useState({ name: "", percent: 0 });
  const [modifiedMap, setModifiedMap] = useState({});
  const [testStatus, setTestStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState(null);


  //const isDisabled = saving || testStatus === selectedBuild?.testingStatus;

  const getKey = (t, idx) => (t.id != null ? String(t.id) : `${t.name}-${idx}`);

  // Hydrate current build testingStatus into dropdown when project/version changes
  useEffect(() => {
    const projectValue = String(project || "").trim();
    const versionValue = String(version || "").trim();
    const buildNameValue = String(buildName || "").trim();

    if (!projectValue || !versionValue) {
      setTestStatus("");
      setSelectedBuild(null);
      return;
    }

    let mounted = true;
    const buildId = buildRecordId(projectValue, buildNameValue, versionValue);

    (async () => {
      setLoadingStatus(true);
      try {
        const resp = await getBuildById(buildId);
        const build = resp?.data ?? resp;
        const rawStatus = String(build?.testingStatus ?? build?.testStatus ?? "").trim();
        const normalizedStatus = rawStatus.toLowerCase();
        const status =
          normalizedStatus === "not_started" || normalizedStatus === "not started"
            ? "Not Started"
            : normalizedStatus === "in_progress" || normalizedStatus === "in progress"
              ? "In Progress"
              : normalizedStatus === "on_hold" || normalizedStatus === "on hold"
                ? "On Hold"
                : normalizedStatus === "completed"
                  ? "Completed"
                  : rawStatus;
        if (!mounted) return;
        setSelectedBuild(build || null);
        setTestStatus(status);
      } catch (e) {
        if (!mounted) return;
        if (isUnauthorizedError(e)) return;
        // Don't block UI; just fallback to empty.
        setSelectedBuild(null);
        setTestStatus("");
      } finally {
        if (!mounted) return;
        setLoadingStatus(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [project, buildName, version]);

  const startEdit = (t, idx) => {
    const key = getKey(t, idx);
    setEditingKey(key);
    setEditValues({ name: t.name ?? "", percent: Number(t.percent) ?? 0 });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditValues({ name: "", percent: 0 });
  };

  const saveItem = (t, idx) => {
    const key = getKey(t, idx);
    const sanitizedPercent = Math.max(0, Math.min(100, Number(editValues.percent) || 0));
    const updated = { ...t, name: editValues.name, percent: sanitizedPercent };
    const newList = localList.map((it, i) => (getKey(it, i) === key ? updated : it));
    setLocalList(newList);
    setModifiedMap((m) => ({ ...m, [key]: updated }));
    setEditingKey(null);
    setEditValues({ name: "", percent: 0 });

    if (typeof onEdit === "function") {
      try {
        onEdit(updated);
      } catch (e) {
        console.error("onEdit callback error", e);
      }
    }
  };

  const saveAll = () => {
    const modifiedItems = Object.values(modifiedMap);
    if (modifiedItems.length === 0) {
      setEditMode(false);
      return;
    }

    if (typeof onSaveAll === "function") {
      try {
        onSaveAll(localList);
      } catch (e) {
        console.error("onSaveAll error", e);
      }
    } else {
      if (typeof onEdit === "function") {
        modifiedItems.forEach((it) => {
          try {
            onEdit(it);
          } catch (e) {
            console.error("onEdit callback error", e);
          }
        });
      }
    }

    setModifiedMap({});
    setEditMode(false);
  };

  const cancelAll = () => {
    setLocalList(initial);
    setModifiedMap({});
    setEditingKey(null);
    setEditValues({ name: "", percent: 0 });
    setEditMode(false);
  };

  const assignedTester = readAssignedTester(selectedBuild);
  const assignedTesterEmail = normalizeIdentity(assignedTester.email);
  const assignedTesterName = compactIdentity(assignedTester.name);
  const currentUserEmail = normalizeIdentity(email);
  const currentUserName = compactIdentity(username);
  const selectedBuildHasAssignedTester = !isUnassignedTesterValue(
    assignedTesterEmail || assignedTester.name
  );
  const selectedBuildAssignedToCurrentUser =
    selectedBuildHasAssignedTester &&
    (assignedTesterEmail
      ? assignedTesterEmail === currentUserEmail
      : assignedTesterName === currentUserName ||
        normalizeIdentity(assignedTester.name) === currentUserEmail);
  // Build status can be viewed/changed by QA engineers and QA managers.
  const canSetBuildStatus = isQAEngineer || isQAManager;
  const onClickSaveTestStatus = async () => {
    if (!testStatus) {
      alert("Please select Test Status");
      return;
    }

    try {
      setSaving(true);
      setSuccessMsg("");
      const projectId = buildRecordId(project, buildName, version);
      await updateTestStatus({
        projectId,
        testingStatus: testStatus,
      });

      setSelectedBuild((prev) => prev ? { ...prev, testingStatus: testStatus } : prev);
      setSuccessMsg("Test status updated successfully ✅");
      setTimeout(() => setSuccessMsg(""), 3000);

    } catch (error) {
      console.error("Update test status failed", error);
      if (isUnauthorizedError(error)) {
        return;
      }
      alert("Failed to update test status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative w-full max-w-full h-full bg-white rounded-2xl p-4 shadow-lg ring-1 ring-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-800">
          <span>Test Progress</span>
          <div className="relative group flex-shrink-0 cursor-pointer">
            <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-xs font-bold text-gray-600">
              i
            </span>

            <div
              className="absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-md bg-gray-800 p-2 text-xs text-white opacity-0 shadow-lg transition-opacity
                          group-hover:opacity-100"
            >
              Indicates test case execution progress %
            </div>
          </div>
          {requiresBasicAccess && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              This feature requires a Basic level access user.
            </span>
          )}
        </h3>


        {isQAManager && (
          <div className="flex items-center gap-2">
            {!editMode ? (
              // <button
              //   type="button"
              //   onClick={() => setEditMode(true)}
              //   className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
              //   title="Edit tests"
              // >
              //   {/* <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              //     <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
              //     <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              //   </svg> */}

              // </button>

              <>  </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={saveAll}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Save All
                </button>
                <button
                  type="button"
                  onClick={cancelAll}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="relative">
        <div className="relative z-0">
        <div className={`flex flex-col ${gapClass}`}>
        {localList.map((t, idx) => {
          const percent = Math.max(0, Math.min(100, Number(t.percent) || 0));
          const barColor = getBarColor(percent);
          const key = getKey(t, idx);
          const isEditing = editingKey === key;

          return (
            <div key={key} className={`${pyClass} border-b last:border-b-0 border-gray-100`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {!isEditing && (
                    <div className="flex items-baseline justify-between">
                      <div className="text-sm font-medium text-gray-700 truncate">{t.name}</div>
                      {showPercent && <div className="text-sm font-semibold text-gray-800">{percent}%</div>}
                    </div>
                  )}

                  {isQAManager && isEditing &&
                    (
                      <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                        <input
                          value={editValues.name}
                          onChange={(e) => setEditValues((v) => ({ ...v, name: e.target.value }))}
                          className="mt-1 block w-full sm:w-60 px-2 py-1 border rounded-md text-sm"
                          placeholder="Test name"
                          aria-label="Test name"
                        />
                        {/* <div className="flex items-center gap-2 mt-2 sm:mt-0">
                        <input
                          type="number"
                          value={editValues.percent}
                          onChange={(e) => setEditValues((v) => ({ ...v, percent: e.target.value }))}
                          className="w-24 px-2 py-1 border rounded-md text-sm"
                          min={0}
                          max={100}
                          aria-label="Percent complete"
                        />
                        <button
                          onClick={() => saveItem(t, idx)}
                          className="px-2 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => cancelEdit()}
                          className="px-2 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div> */}
                      </div>
                    )
                  }

                  <div className="mt-2 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      role="progressbar"
                      aria-label={`${t.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-valuetext={`${percent}%`}
                      className={`h-full rounded-full transition-all duration-500 ${getBarColor(
                        isEditing ? Number(editValues.percent) : percent
                      )}`}
                      style={{ width: `${isEditing ? editValues.percent : percent}%` }}
                    />
                  </div>
                </div>

                {/* {isQAManager && (
                  <div className="flex items-center gap-2">
                    {!editMode && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          startEdit(t, idx);
                          setEditMode(true);
                        }}
                        className="inline-flex items-center gap-2 px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Quick edit"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
                          <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      </button>
                    )}

                    {editMode && !isEditing && (
                      <button
                        onClick={() => startEdit(t, idx)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50"
                        title="Edit item"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                )} */}
              </div>
            </div>
          );
        })}
      </div>

      {/* <div className="mt-10 text-xs text-gray-500">
        {editMode ? "Edit mode: make changes and click Save All or Save per item." : "Tip: this view is read-only."}
      </div> */}
        </div>
      </div>

      {/* Build Status remains visible and interactive for QA engineers and QA managers. */}
      {/* Test Status – Right (INLINE) */}
      {canSetBuildStatus && (
        <div className="relative z-30 mt-4 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 shadow-sm">

          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center lg:flex-nowrap">
            {/* Left: Label + info */}
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-700 md:flex-none">
              <span className="min-w-0 whitespace-normal md:whitespace-nowrap">Change Build Status</span>
              <div className="relative inline-flex flex-shrink-0 cursor-pointer group" aria-label="Status info">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-gray-400 text-xs font-bold text-gray-600">
                  i
                </span>

                <div
                  className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2 rounded-md bg-gray-800 p-2 text-xs text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                >
                  Change the status of this build
                </div>
              </div>
            </div>
            {/* Right: Select + Button */}
            <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center md:ml-auto md:w-auto md:flex-nowrap md:justify-end">
              <select
                value={testStatus}
                onChange={(e) => setTestStatus(e.target.value)}
                disabled={saving || loadingStatus}
                className="
            w-full min-w-0 sm:flex-1 md:w-40 lg:w-44
            rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm
            text-gray-700 shadow-sm
            focus:border-blue-500 focus:ring-2 focus:ring-blue-200
            transition
          "
              >
                <option value="" disabled>Select status</option>
                <option value="Not Started">Not Started</option>
                <option value="On Hold">On Hold</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <button
                onClick={onClickSaveTestStatus}
                disabled={saving}
                className="
            inline-flex items-center justify-center gap-2 rounded-lg
            w-full sm:w-auto
            md:flex-shrink-0
            bg-blue-600 px-5 py-2 text-sm font-semibold text-white
            hover:bg-blue-700
            disabled:cursor-not-allowed disabled:opacity-50
            transition
          "
              >
                {saving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving…
                  </>
                ) : (
                  <>Save</>
                )}
              </button>

            </div>
          </div>

          {/* ✅ Success Message */}
          {successMsg && (
            <div className="mt-3 text-sm font-medium text-green-700 bg-green-100 border border-green-200 rounded-md px-3 py-2">
              {successMsg}
            </div>
          )}
        </div>
      )}




    </div>
  );
}

