import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createKnowledgeBaseItem, getAllKnowledgeBaseItems } from "../api/knowledgeBaseApi";
import { useSelector } from "react-redux";
import { isUnauthorizedError } from "../config/unauthorizedSession";

 

export default function KnowledgeSection() {
    const { email, username, role } = useSelector((s) => s.auth);

  const [refs, setRefs] = useState([]);            // ✅ data from API
  const [loading, setLoading] = useState(false);   // ✅ loading state
  const [error, setError] = useState("");          // ✅ error state
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
  const [search, setSearch] = useState("");



  const canEdit = useMemo(() => role === "QAMANAGER", [role]);

  // ✅ edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: "", link: "", description: "" });
  const [editErrors, setEditErrors] = useState({ title: "", link: "" });

  // ✅ add state
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", link: "", description: "" });
  const [addErrors, setAddErrors] = useState({ title: "", link: "" });

  // ✅ load all KB items
  const loadKnowledgeBase = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const items = await getAllKnowledgeBaseItems();

      // map backend -> UI model
      const mapped = (Array.isArray(items) ? items : []).map((x) => ({
        id: x.id,
        title: x.title,
        url: x.link,
        notes: x.description,
        uploadedBy: "Knowledge Base",
        uploadedAt: x.createdDate || null,
      }));

      // newest first (if createdDate exists)
      mapped.sort((a, b) => {
        const da = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
        const db = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
        return db - da;
      });

      setRefs(mapped);
      setPage(1);
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      setError(e?.message || "Failed to load knowledge base");
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ fetch on mount
  useEffect(() => {
    loadKnowledgeBase();
  }, [loadKnowledgeBase]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(refs.length / PAGE_SIZE));
    setPage((p) => Math.min(p, maxPage));
  }, [refs]);

  const filteredRefs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return refs;
    return refs.filter((ref) => {
      const title = (ref.title || "").toLowerCase();
      const notes = (ref.notes || "").toLowerCase();
      return title.includes(q) || notes.includes(q);
    });
  }, [refs, search]);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const startEdit = (ref) => {
    setEditingId(ref.id);
    setEditForm({
      title: ref.title || "",
      link: ref.url || "",
      description: ref.notes || "",
    });
    setEditErrors({ title: "", link: "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ title: "", link: "", description: "" });
    setEditErrors({ title: "", link: "" });
  };

  const validateKnowledgeForm = (form) => {
    return {
      title: form.title.trim() ? "" : "Title is required",
      link: form.link.trim() ? "" : "Link is required",
    };
  };

  // ✅ Save edit = UPSERT with same id, then reload list
  const saveEdit = async (ref) => {
    try {
      const nextErrors = validateKnowledgeForm(editForm);
      setEditErrors(nextErrors);
      if (nextErrors.title || nextErrors.link) return;

      await createKnowledgeBaseItem({
        id: ref.id, // ✅ update existing
        title: editForm.title,
        link: editForm.link,
        description: editForm.description,
      });
      cancelEdit();
      await loadKnowledgeBase(); // ✅ refresh from backend
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      alert(e?.message || "Failed to update item");
    }
  };

  const openAdd = () => setAdding(true);

  const cancelAdd = () => {
    setAdding(false);
    setAddForm({ title: "", link: "", description: "" });
    setAddErrors({ title: "", link: "" });
  };

  // ✅ Add = create, then reload list
  const saveAdd = async () => {
    try {
      const nextErrors = validateKnowledgeForm(addForm);
      setAddErrors(nextErrors);
      if (nextErrors.title || nextErrors.link) return;

      await createKnowledgeBaseItem({
        title: addForm.title,
        link: addForm.link,
        description: addForm.description,
      });
      cancelAdd();
      await loadKnowledgeBase(); // ✅ refresh from backend
    } catch (e) {
      if (isUnauthorizedError(e)) return;
      alert(e?.message || "Failed to create item");
    }
  };

  return (
    <section className="mt-4 mr-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-lg font-semibold text-gray-800">Knowledge Base</h2>
          <div className="relative w-full max-w-xs">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or description..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m16.5 16.5 4 4" />
            </svg>
          </div>
        </div>

        <button
          onClick={openAdd}
          className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all cursor-pointer"
        >
          + Add Reference
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {adding && (
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>

              <input
                value={addForm.title}
                required
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, title: e.target.value }))
                }
                onBlur={() =>
                  setAddErrors((p) => ({
                    ...p,
                    title: addForm.title.trim() ? "" : "Title is required",
                  }))
                }
                placeholder="Title"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white
               focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {addErrors.title && (
                <p className="mt-1 text-xs text-red-600">{addErrors.title}</p>
              )}
            </div>





            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link (URL) <span className="text-red-500">*</span>
              </label>

              <input
                value={addForm.link}
                required
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, link: e.target.value }))
                }
                onBlur={() =>
                  setAddErrors((p) => ({
                    ...p,
                    link: addForm.link.trim() ? "" : "Link is required",
                  }))
                }
                placeholder="Link (URL)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white
               focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {addErrors.link && (
                <p className="mt-1 text-xs text-red-600">{addErrors.link}</p>
              )}
            </div>


            <textarea
              value={addForm.description}
              onChange={(e) => setAddForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description"
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white md:col-span-4 min-h-[70px]"
            />
          </div>

          <div className="mt-3 flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelAdd}
              className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveAdd}
              className="text-xs px-3 py-2 rounded-lg bg-gray-900 text-white hover:bg-black cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading knowledge base...</p>
      ) : filteredRefs.length === 0 ? (
        <p className="text-gray-500 text-sm">No references added yet.</p>
      ) : (
        <>
        <ul className="space-y-4">
          {filteredRefs
            .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
            .map((ref) => {
            const isEditing = editingId === ref.id;

            return (
              <li
                key={ref.id}
                className="p-4 bg-gray-50 hover:bg-gray-100 rounded-xl flex justify-between items-start transition"
              >
                <div className="flex-1 pr-3">
                  {!isEditing ? (
                    <>
                      <p className="text-sm font-medium text-gray-700">
                        <span className="text-blue-600">KB:</span>{" "}
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          {ref.title}
                        </a>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{ref.notes}</p>
                      {ref.uploadedAt && (
                        <p className="text-xs text-gray-400 mt-1">
                          Added on {new Date(ref.uploadedAt).toLocaleDateString()}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                        <input
                          value={editForm.title}
                          onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                          onBlur={() =>
                            setEditErrors((p) => ({
                              ...p,
                              title: editForm.title.trim() ? "" : "Title is required",
                            }))
                          }
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white"
                        />
                        {editErrors.title && (
                          <p className="mt-1 text-xs text-red-600">{editErrors.title}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Link</label>
                        <input
                          value={editForm.link}
                          onChange={(e) => setEditForm((p) => ({ ...p, link: e.target.value }))}
                          onBlur={() =>
                            setEditErrors((p) => ({
                              ...p,
                              link: editForm.link.trim() ? "" : "Link is required",
                            }))
                          }
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white"
                        />
                        {editErrors.link && (
                          <p className="mt-1 text-xs text-red-600">{editErrors.link}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <textarea
                          value={editForm.description}
                          onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-white min-h-[70px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {/* ✅ Edit visible only for QAMANAGER */}
                  {canEdit && !isEditing && (
                    <button
                      type="button"
                      onClick={() => startEdit(ref)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                    >
                      Edit
                    </button>
                  )}

                  {canEdit && isEditing && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveEdit(ref)}
                        className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-black"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {filteredRefs.length > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer border transition ${
                page === 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed bg-gray-50"
                  : "text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {Math.ceil(filteredRefs.length / PAGE_SIZE)}
            </span>
            <button
              type="button"
              onClick={() =>
                setPage((p) => Math.min(Math.ceil(filteredRefs.length / PAGE_SIZE), p + 1))
              }
              disabled={page >= Math.ceil(filteredRefs.length / PAGE_SIZE)}
              className={`px-3 py-1.5 text-sm rounded-lg cursor-pointer border transition ${
                page >= Math.ceil(refs.length / PAGE_SIZE)
                  ? "text-gray-400 border-gray-200 cursor-not-allowed bg-gray-50"
                  : "text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Next
            </button>
          </div>
        )}
        </>
      )}
    </section>
  );
}
