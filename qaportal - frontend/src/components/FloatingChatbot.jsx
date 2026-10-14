// src/components/FloatingChatbot.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getBackendApiTokenAsync } from "../config/msalConfig";

function getAssistantDisplayText(raw) {
  if (raw == null) return "";

  const obj = typeof raw === "object" ? raw : null;

  if (!obj && typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object" && parsed.action) {
          if (parsed.action === "FINAL_ANSWER") return parsed.final_markdown || "";
          if (parsed.action === "ASK_CLARIFICATION") return parsed.clarifying_question || "";
          return parsed.final_markdown || parsed.clarifying_question || "";
        }
      } catch {
        // not JSON
      }
    }
    return raw;
  }

  if (obj?.action) {
    if (obj.action === "FINAL_ANSWER") return obj.final_markdown || "";
    if (obj.action === "ASK_CLARIFICATION") return obj.clarifying_question || "";
    return obj.final_markdown || obj.clarifying_question || "";
  }

  return String(raw);
}

export default function FloatingChatbot({ organization, project, role }) {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

  const [open, setOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const previousSizeRef = useRef({ w: 360, h: 460 });

  const [messages, setMessages] = useState([
    { from: "bot", text: "Hi 👋 I’m Mira. Ask me about bugs, builds, test runs." },
  ]);

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [attachments, setAttachments] = useState([]);
  // each: { id, name, status: "uploading"|"ready"|"error", error?: string }

  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [autoScroll, setAutoScroll] = useState(true);
  const [size, setSize] = useState({ w: 360, h: 460 });

  const MIN_W = 320;
  const MIN_H = 380;
  const MAX_W = Math.min(window.innerWidth * 0.92, 1400);
  const MAX_H = Math.min(window.innerHeight * 0.75, 1800);

  const toggleMaximize = () => {
    setIsMaximized((current) => {
      if (!current) {
        previousSizeRef.current = size;
        return true;
      }

      const prev = previousSizeRef.current;
      setSize(prev);
      return false;
    });
  };

  // ✅ Stable session id
  const sessionId = useMemo(() => {
    const key = "qa_chat_session_id";
    let id = localStorage.getItem(key);
    if (!id) {
      id = (crypto?.randomUUID?.() || `sess_${Date.now()}_${Math.random()}`).toString();
      localStorage.setItem(key, id);
    }
    return id;
  }, []);

  const openFilePicker = () => fileInputRef.current?.click();

  const removeAttachment = (id) => {
    setAttachments((p) => p.filter((a) => a.id !== id));
    inputRef.current?.focus();
  };

  const getAuthHeaders = async (extraHeaders = {}) => {
    const token = await getBackendApiTokenAsync();

    if (!token) {
      throw new Error("Backend API token is not available");
    }

    return {
      ...extraHeaders,
      Authorization: `Bearer ${token}`,
    };
  };

  const uploadFile = async (file) => {
    if (!file) return;

    // NOTE: backend supports pdf/docx/text. .doc is NOT supported unless you add Tika.
    const tempId = crypto?.randomUUID?.() || `tmp_${Date.now()}`;

    setAttachments((p) => [...p, { id: tempId, name: file.name, status: "uploading" }]);
    setIsUploadingFile(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("sessionId", sessionId);

      // optional if you want these later (not required)
      // fd.append("project", project ?? "");
      // fd.append("organization", organization ?? "");

      const resp = await fetch(`${API_BASE}/api/chat/upload`, {
        method: "POST",
        headers: await getAuthHeaders(),
        body: fd,
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Upload failed (HTTP ${resp.status}) ${t}`);
      }

      const json = await resp.json();
      // expected: { fileId: "...", fileName: "..." }

      if (!json?.fileId) {
        throw new Error("Upload response missing fileId");
      }

      setAttachments((p) =>
        p.map((a) =>
          a.id === tempId
            ? { id: json.fileId, name: json.fileName || file.name, status: "ready" }
            : a
        )
      );

      setMessages((p) => [
        ...p,
        { from: "bot", text: `✅ Attached: **${json.fileName || file.name}**. Now ask your question.` },
      ]);
    } catch (e) {
      setAttachments((p) =>
        p.map((a) =>
          a.id === tempId ? { ...a, status: "error", error: e?.message || "Upload error" } : a
        )
      );
      setMessages((p) => [
        ...p,
        { from: "bot", text: `⚠️ File upload error: ${e?.message || "Unknown"}` },
      ]);
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      inputRef.current?.focus();
    }
  };

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow reselect same file
    for (const f of files) {
      // sequential upload (simple + safe)
      // you can parallelize later if needed
      await uploadFile(f);
    }
  };

  const canSend = useMemo(() => !!input.trim() && !isSending, [input, isSending]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const threshold = 60;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < threshold);
  };

  useEffect(() => {
    if (!autoScroll) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, autoScroll]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const MAX_HE = 220;

  const autoGrow = (el) => {
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, MAX_HE) + "px";
  };

  const resetInputHeight = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "35px";
  };

  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || isSending) return;

    inputRef.current?.focus();

    setMessages((p) => [...p, { from: "user", text: msg }]);
    setInput("");
    setIsSending(true);
    resetInputHeight();
    inputRef.current?.focus();

    try {
      // ✅ ONLY ready fileIds
      const fileIds = attachments
        .filter((a) => a.status === "ready")
        .map((a) => a.id);

      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: await getAuthHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          message: msg,
          sessionId,
          role,      // ✅ include role
          fileIds,   // ✅ include attachments
          // org/project optional (if you later want)
          // organization,
          // project,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${errText}`);
      }

      const data = await resp.json();
      const botText = data?.text ?? "(no response)";
      setMessages((p) => [...p, { from: "bot", text: botText }]);
    } catch (e) {
      setMessages((p) => [
        ...p,
        { from: "bot", text: `⚠️ Chat error: ${e?.message || "Unknown error"}` },
      ]);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const onEnter = (e) => {
    if (e.key === "Enter" && e.shiftKey) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (canSend) sendMessage();
    }
  };

  // -------------------------------
  // Custom resizing (LEFT + TOP only)
  // -------------------------------
  const resizeRef = useRef({
    dragging: false,
    mode: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
  });

  const startResize = (mode) => (e) => {
    e.preventDefault();
    e.stopPropagation();

    resizeRef.current = {
      dragging: true,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
    };

    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", stopResize);
  };

  const onResizeMove = (e) => {
    const r = resizeRef.current;
    if (!r.dragging) return;

    const dx = e.clientX - r.startX;
    const dy = e.clientY - r.startY;

    let newW = r.startW;
    let newH = r.startH;

    if (r.mode === "left" || r.mode === "corner") newW = r.startW - dx;
    if (r.mode === "top" || r.mode === "corner") newH = r.startH - dy;

    newW = Math.max(MIN_W, Math.min(MAX_W, newW));
    newH = Math.max(MIN_H, Math.min(MAX_H, newH));

    setSize({ w: newW, h: newH });
  };

  const stopResize = () => {
    resizeRef.current.dragging = false;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", stopResize);
  };

  useEffect(() => () => stopResize(), []);

  useEffect(() => {
    if (!open) {
      setIsMaximized(false);
      setSize(previousSizeRef.current);
    }
  }, [open]);

  return createPortal(
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="
          fixed cursor-pointer bottom-14 right-10 z-[9999]
          h-14 w-14 rounded-full
          bg-indigo-600 text-white shadow-lg
          hover:bg-indigo-700
          flex items-center justify-center
          transition active:scale-95
        "
        aria-label="Open chatbot"
        title="Chat"
      >
        💬
      </button>

      {open && (
        <div className={isMaximized ? "fixed inset-4 z-[9999]" : "fixed bottom-14 right-6 z-[9999]"}>
          <div
            className={`relative overflow-hidden bg-white shadow-2xl ring-1 ring-black/5 flex flex-col ${
              isMaximized ? "rounded-2xl h-full w-full" : "rounded-2xl"
            }`}
            style={{
              width: isMaximized ? "100%" : `${size.w}px`,
              height: isMaximized ? "100%" : `${size.h}px`,
              maxWidth: isMaximized ? "none" : "92vw",
              maxHeight: isMaximized ? "none" : "75vh",
            }}
          >
            {!isMaximized && (
              <>
                <div
                  onMouseDown={startResize("left")}
                  className="absolute left-0 top-10 bottom-12 w-2 cursor-ew-resize z-20"
                  title="Resize"
                />
                <div
                  onMouseDown={startResize("top")}
                  className="absolute top-0 left-12 right-12 h-2 cursor-ns-resize z-20"
                  title="Resize"
                />
                <div
                  onMouseDown={startResize("corner")}
                  className="absolute top-0 left-0 h-3 w-3 cursor-nwse-resize z-30"
                  title="Drag Top/Left to Resize"
                />
              </>
            )}

            <div className="px-4 py-3 border-b bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center">
                    🧠
                  </div>
                  <div className="leading-tight">
                    <div className="font-semibold tracking-wide">Mira • QA Assistant</div>
                    <div className="text-[11px] text-white/80">
                      {isSending ? "Analyzing…" : "Online"} 
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <button
                      onClick={toggleMaximize}
                      className="h-9 w-9 cursor-pointer rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/20 transition flex items-center justify-center"
                      aria-label={isMaximized ? "Minimize chat" : "Maximize chat"}
                      title={isMaximized ? "Minimize" : "Maximize"}
                    >
                      {isMaximized ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M8 3v5H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M16 21v-5h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 8l6-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M21 16l-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M9 3H3v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M15 21h6v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M3 9l7-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M21 15l-7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                    <div className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                      {isMaximized ? "Minimize" : "Maximize"}
                    </div>
                  </div>

                  <button
                    onClick={() => setOpen(false)}
                    className="h-9 w-9 cursor-pointer rounded-xl bg-white/10 hover:bg-white/15 ring-1 ring-white/20 transition flex items-center justify-center"
                    aria-label="Close chat"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <div
              ref={listRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50"
            >
              {messages.map((m, i) => {
                const isUser = m.from === "user";

                return (
                  <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`
                        max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
                        break-words
                        ${isUser
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white text-gray-800 ring-1 ring-gray-200 shadow-sm"}
                      `}
                    >
                      {isUser ? (
                        <span className="whitespace-pre-wrap">{getAssistantDisplayText(m.text)}</span>
                      ) : (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h3: (props) => <h3 className="mt-2 mb-2 text-base font-semibold" {...props} />,
                              h4: (props) => <h4 className="mt-2 mb-1 text-sm font-semibold" {...props} />,
                              p: (props) => <p className="mb-2 last:mb-0" {...props} />,
                              ul: (props) => <ul className="mb-2 list-disc pl-5" {...props} />,
                              ol: (props) => <ol className="mb-2 list-decimal pl-5" {...props} />,
                              li: (props) => <li className="mb-1" {...props} />,
                              table: (props) => (
                                <div className="my-2 overflow-x-auto">
                                  <table className="w-full text-left text-xs border border-gray-200" {...props} />
                                </div>
                              ),
                              thead: (props) => <thead className="bg-gray-50" {...props} />,
                              th: (props) => (
                                <th className="px-2 py-2 border-b border-gray-200 font-semibold" {...props} />
                              ),
                              td: (props) => (
                                <td className="px-2 py-2 border-b border-gray-100 align-top" {...props} />
                              ),
                              strong: (props) => <strong className="font-semibold" {...props} />,
                              code: (props) => (
                                <code className="px-1 py-0.5 rounded bg-gray-100 text-gray-900" {...props} />
                              ),
                            }}
                          >
                            {getAssistantDisplayText(m.text)}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-white ring-1 ring-gray-200 rounded-2xl px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!autoScroll && (
              <div className="px-4 pb-2 bg-gray-50">
                <button
                  onClick={() => {
                    setAutoScroll(true);
                    const el = listRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                    inputRef.current?.focus();
                  }}
                  className="w-full text-xs rounded-xl border bg-white hover:bg-gray-50 py-2"
                >
                  Jump to latest ↓
                </button>
              </div>
            )}

            <div className="border-t bg-white px-3 py-3">
              {/* Attachments chips */}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div
                      key={a.id}
                      className={[
                        "flex items-center gap-2 rounded-xl border px-2 py-1 text-xs",
                        a.status === "ready" ? "bg-gray-50" : "",
                        a.status === "uploading" ? "bg-indigo-50 border-indigo-200" : "",
                        a.status === "error" ? "bg-red-50 border-red-200" : "",
                      ].join(" ")}
                      title={a.error || a.name}
                    >
                      <span className="max-w-[180px] truncate">{a.name}</span>
                      {a.status === "uploading" && <span className="text-indigo-600">Uploading…</span>}
                      {a.status === "error" && <span className="text-red-600">Error</span>}

                      <button
                        type="button"
                        className="h-5 w-5 rounded-md hover:bg-black/5 flex items-center justify-center"
                        onClick={() => removeAttachment(a.id)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.md,.docx"
                  multiple
                  onChange={onPickFiles}
                />

                {/* Plus button */}
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={isUploadingFile}
                  className={[
                    "h-10 w-10 rounded-xl border flex items-center justify-center transition active:scale-[0.98]",
                    isUploadingFile ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white hover:bg-gray-50",
                  ].join(" ")}
                  title="Attach file"
                  aria-label="Attach file"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  placeholder="Type a message…"
                  rows={1}
                  onChange={(e) => {
                    setInput(e.target.value);
                    autoGrow(e.target);
                  }}
                  onKeyDown={(e) => {
                    onEnter(e);
                    if (e.key === "Enter" && e.shiftKey) requestAnimationFrame(() => autoGrow(e.currentTarget));
                  }}
                  className="
                    flex-1 px-4 py-2.5 text-sm rounded-xl
                    border border-gray-200 bg-white
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                    resize-none
                    min-h-[35px] max-h-[160px]
                  "
                />

                <button
                  onClick={sendMessage}
                  disabled={!canSend}
                  className={`
                    px-4 py-2.5 rounded-xl text-sm font-medium text-white
                    transition active:scale-[0.98]
                    ${canSend ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-300 cursor-not-allowed"}
                  `}
                >
                  Send
                </button>
              </div>

              <div className="mt-2 text-[11px] text-gray-500 flex items-center justify-between">
                <span className="text-gray-400">Enter ↵ to send • Shift+Enter for new line</span>
              </div>
            </div>

            <div className="pointer-events-none absolute top-2 left-2 text-white/60 text-xs">
              ↖
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
