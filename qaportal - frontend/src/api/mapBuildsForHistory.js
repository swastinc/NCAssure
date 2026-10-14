// mapBuildsForHistory.js — Map BuildDto[] -> BuildHistory releases[]

/**
 * Expected BuildDto fields from backend:
 *  - projectId (string)         // optional but ideal
 *  - builds (string)            // build name
 *  - buildVersion (string)
 *  - description (string)
 *  - buildUrl (string)
 *  - releaseNoteUrl (string)
 *  - projectName (string)
 *  - releasedBy (string)        // display name or email string
 *  - uploadTime (ISO string)    // if present
 *  - isPendingApproval (bool)   // if present
 */
import { useSelector } from "react-redux";


export function mapBuildDtoToRelease(b) {
  if (!b || typeof b !== "object") return null;

  const id =
    b.projectId ||
    (b.projectName && b.buildVersion
      ? `${b.projectName}-${b.buildVersion}`
      : randomId());

  return {
    id,
    version: b.buildVersion || "",
    releasedBy: {
      name: b.releasedBy || "",
      email: email || "", // best-effort
    },
    date: b.uploadTime || new Date().toISOString(),
    notes: b.description || "",
    artifactUrl: b.buildUrl || "",
    commit: null, // not provided by backend
    // carry through useful raw fields if you need them later:
    _projectName: b.projectName,
    _releaseNoteUrl: b.releaseNoteUrl,
    _isPendingApproval: typeof b.isPendingApproval === "boolean" ? b.isPendingApproval : undefined,
    _raw: b,
  };
}

export function mapBuildDtos(list) {
    const { email, username, role } = useSelector((s) => s.auth);

  return (Array.isArray(list) ? list : [])
    .map(mapBuildDtoToRelease)
    .filter(Boolean);
}

function randomId() {
  try {
    return `REL-${crypto.randomUUID()}`;
  } catch {
    return `REL-${Math.random().toString(36).slice(2)}`;
  }
}
