import React, { useEffect, useMemo, useState } from "react";
import {
  getCentralRepoByProject,
  updateCentralRepoPartial,
} from "../api/centralRepoApi";
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";

/* --- Icons --- */
function IconEdit(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={`h-4 w-4 ${props.className || ""}`}
    >
      <path
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536M4 20h4.586a1 1 0 00.707-.293l9.414-9.414a1 1 0 000-1.414L14.121 4.121a1 1 0 00-1.414 0L3.293 13.535A1 1 0 003 14.243V19a1 1 0 001 1z"
      />
    </svg>
  );
}

function IconSave(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={`h-4 w-4 ${props.className || ""}`}
    >
      <path
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function IconCancel(props) {
  return (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={`h-4 w-4 ${props.className || ""}`}
    >
      <path
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

const ORGANIZATION = import.meta.env.VITE_ORGANIZATION;

const hasText = (value) =>
  value !== null && value !== undefined && String(value).trim().length > 0;

function getWorkItemsLink(projectName) {
  const encodedProject = encodeURIComponent(String(projectName || "").trim());
  return `https://dev.azure.com/${ORGANIZATION}/${encodedProject}/_workitems`;
}

function getDefaultLinks(projectName) {
  return [
    {
      key: "testcases",
      label: "No Link Available",
      href: "#",
      count: null,
    },
    {
      key: "Bugs",
      label: "Click Here",
      href: getWorkItemsLink(projectName),
      count: 15,
    },
    {
      key: "reports",
      label: "No Link Available",
      href: "#",
      count: null,
    },
  ];
}

function normalizeInitialLinks(initialLinks, projectName) {
  if (!Array.isArray(initialLinks) || initialLinks.length === 0) {
    return getDefaultLinks(projectName);
  }

  return initialLinks.map((link) => ({
    key: link.key,
    label: link.label ?? link.key,
    href: link.href ?? "#",
    count: link.count ?? null,
  }));
}

function mapRepoToLinks(repo, projectName) {
  if (!repo) {
    return getDefaultLinks(projectName);
  }

  return [
    {
      key: "testcases",
      label: hasText(repo.testCasesTitle)
        ? repo.testCasesTitle
        : "No Link Available",
      href: hasText(repo.testCasesLink) ? repo.testCasesLink : "#",
      count: null,
    },
    {
      key: "Bugs",
      label: hasText(repo.defectsTitle) ? repo.defectsTitle : "Click Here",
      href: hasText(repo.defectsLink)
        ? repo.defectsLink
        : getWorkItemsLink(projectName),
      count: 15,
    },
    {
      key: "reports",
      label: hasText(repo.reportsTitle)
        ? repo.reportsTitle
        : "No Link Available",
      href: hasText(repo.reportsLink) ? repo.reportsLink : "#",
      count: null,
    },
  ];
}

function formatLabelForKey(key) {
  switch (key) {
    case "testcases":
      return "Test Cases";
    case "Bugs":
      return "Bugs";
    case "reports":
      return "Reports";
    default:
      return key;
  }
}

function isExternal(href) {
  try {
    if (!href || href === "#") return false;

    const url = new URL(href);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export default function CentralRepository({
  projectName,
  backendApiToken,
  initialLinks = null,
  onSave,
}) {
  const { role } = useSelector((state) => state.auth || {});

  const defaultLinks = useMemo(
    () => normalizeInitialLinks(initialLinks, projectName),
    [initialLinks, projectName]
  );

  const [links, setLinks] = useState(defaultLinks);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState({ label: "", href: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    let ignore = false;

    async function loadCentralRepository() {
      setError("");
      setEditingKey(null);
      setDraft({ label: "", href: "" });

      if (!hasText(projectName)) {
        setLinks(getDefaultLinks(""));
        return;
      }

      setLinks(getDefaultLinks(projectName));

      if (!hasText(backendApiToken)) {
        setError("Unable to load central repository. Missing backend API token.");
        return;
      }

      try {
        setLoading(true);

        const repo = await getCentralRepoByProject(projectName, backendApiToken);

        if (ignore) return;

        setLinks(mapRepoToLinks(repo, projectName));
      } catch (e) {
        if (!ignore) {
          if (isUnauthorizedError(e)) return;
          setLinks(getDefaultLinks(projectName));
          setError(e?.message || "Failed to load central repository");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadCentralRepository();

    return () => {
      ignore = true;
    };
  }, [projectName, backendApiToken]);

  function startEdit(item) {
    setError("");

    const isUnavailableLabel =
      String(item.label || "").trim().toLowerCase() === "no link available";

    setDraft({
      label: isUnavailableLabel ? "" : item.label || "",
      href: item.href === "#" ? "" : item.href || "",
    });
    setEditingKey(item.key);
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft({ label: "", href: "" });
  }

  function buildPartialPayload(key, label, href) {
    const partial = {};

    if (key === "testcases") {
      if (hasText(label)) partial.testCasesTitle = label.trim();
      if (hasText(href)) partial.testCasesLink = href.trim();
    }

    if (key === "Bugs") {
      if (hasText(label)) partial.defectsTitle = label.trim();
      if (hasText(href)) partial.defectsLink = href.trim();
    }

    if (key === "reports") {
      if (hasText(label)) partial.reportsTitle = label.trim();
      if (hasText(href)) partial.reportsLink = href.trim();
    }

    return partial;
  }

  async function saveEdit(key) {
    setError("");

    const currentItem = links.find((link) => link.key === key);
    if (!currentItem) return;

    const nextLabel = String(draft.label || "").trim();
    const nextHref = String(draft.href || "").trim();

    if ((key === "testcases" || key === "reports") && !hasText(nextLabel)) {
      setError(`${formatLabelForKey(key)} link text is required.`);
      return;
    }

    if ((key === "testcases" || key === "reports") && !hasText(nextHref)) {
      setError(`${formatLabelForKey(key)} link URL is required.`);
      return;
    }

    const finalItem = {
      ...currentItem,
      label: nextLabel || currentItem.label,
      href: nextHref || currentItem.href,
    };

    const previousLinks = links;

    setLinks((prev) =>
      prev.map((link) => (link.key === key ? finalItem : link))
    );

    setEditingKey(null);
    setDraft({ label: "", href: "" });

    try {
      if (!hasText(projectName)) {
        throw new Error("Project name is required");
      }

      if (!hasText(backendApiToken)) {
        throw new Error("Missing backend API token");
      }

      const partial = buildPartialPayload(key, nextLabel, nextHref);

      if (Object.keys(partial).length === 0) {
        if (typeof onSave === "function") {
          onSave(finalItem);
        }
        return;
      }

      setSavingKey(key);

      const saved = await updateCentralRepoPartial(
        projectName,
        partial,
        backendApiToken
      );

      setLinks(mapRepoToLinks(saved, projectName));

      if (typeof onSave === "function") {
        onSave(finalItem, saved);
      }
    } catch (e) {
      setLinks(previousLinks);
      if (isUnauthorizedError(e)) return;
      setError(e?.message || "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="w-full">
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Central Repository</h2>

          {loading ? (
            <span className="text-xs text-gray-500">Loading...</span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          {links.map((item) => (
            <div
              key={item.key}
              className="p-4 border rounded-md bg-gray-50 flex flex-col"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Section</div>
                    <div className="text-sm font-medium text-gray-800 capitalize">
                      {formatLabelForKey(item.key)}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs text-gray-500">Link</div>

                  {editingKey === item.key ? (
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      <input
                        className="px-3 py-2 border rounded text-sm w-full"
                        value={draft.label}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            label: e.target.value,
                          }))
                        }
                        placeholder={item.key === "testcases" ? "Test Cases link text" : "Link text"}
                      />

                      <input
                        className="px-3 py-2 border rounded text-sm w-full"
                        value={draft.href}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            href: e.target.value,
                          }))
                        }
                        placeholder={item.key === "testcases" ? "Paste Test Cases link" : "Link URL"}
                      />

                      <div className="flex items-center gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingKey === item.key}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded border text-sm text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <IconCancel className="text-rose-600" />
                          <span>Cancel</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => saveEdit(item.key)}
                          disabled={savingKey === item.key}
                          className="inline-flex items-center gap-2 px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:opacity-95 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <IconSave />
                          <span>
                            {savingKey === item.key ? "Saving..." : "Save"}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-4 min-h-[32px]">
                      <a
                        href={item.href || "#"}
                        className="text-sm text-blue-600 hover:underline truncate max-w-[65%]"
                        target={isExternal(item.href) ? "_blank" : undefined}
                        rel={
                          isExternal(item.href)
                            ? "noopener noreferrer"
                            : undefined
                        }
                        onClick={(e) => {
                          if (!item.href || item.href === "#") {
                            e.preventDefault();
                          }
                        }}
                      >
                        {item.label}
                      </a>

                      {(role === "QAMANAGER" || role === "QAENGINEER") &&
                        (item.key === "reports" || item.key === "testcases") && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 px-3 py-1 rounded border bg-white text-sm text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                            onClick={() => startEdit(item)}
                            title={`Edit ${formatLabelForKey(item.key)}`}
                          >
                            <IconEdit />
                            <span className="text-xs">Edit</span>
                          </button>
                        )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-400" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}