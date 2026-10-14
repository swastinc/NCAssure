import React, { useEffect, useMemo, useRef, useState } from "react";

export default function AutocompleteInput({
  value,
  onChange,
  placeholder = "Select Project",
  suggestions = [],
  getSuggestions = null, // optional async
  minChars = 1,
  maxResults = 8,
  onSelect = null, // full item callback
  allowFreeText = false, // keep false (your requirement)
  clearOnInvalid = false, // if true -> clears selection when invalid; else reverts to last selected
  getKey = (it) =>
    typeof it === "string"
      ? it
      : it?.id ?? it?.projectId ?? it?.key ?? it?.name ?? it?.label ?? JSON.stringify(it),
}) {
  const containerRef = useRef(null);
  const listboxId = useRef(`listbox-${Math.random().toString(36).slice(2, 9)}`);
  const debounceRef = useRef(null);

  // selected label (derived from value)
  const [selectedLabel, setSelectedLabel] = useState(value || "");

  // query text (what user types)
  const [query, setQuery] = useState(value || "");

  const [open, setOpen] = useState(false);  
  const [items, setItems] = useState([]); // original shape (string|object)
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const displayLabel = (it) =>
    typeof it === "string" ? it : it?.label ?? it?.name ?? it?.value ?? String(it);

  // sync when external selected value changes
  useEffect(() => {
    const v = value || "";
    setSelectedLabel(v);
    setQuery(v);
  }, [value]);

  // close on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        commitOrRevert();
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selectedLabel, items]);

  // helper: check if query exactly equals any suggestion label (case-insensitive)
  const exactMatchItem = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    if (!q) return null;
    return items.find((it) => displayLabel(it).trim().toLowerCase() === q) || null;
    // note: items is the current filtered list; we also validate against full suggestions in commitOrRevert()
  }, [query, items]);

  // filter/fetch suggestions based on query
  useEffect(() => {
    const q = (query || "").trim();
    if (!q || q.length < minChars) {
      setItems([]);
      setOpen(false);
      setHighlight(-1);
      setLoading(false);
      return;
    }

    // local list
    if (Array.isArray(suggestions) && suggestions.length) {
      const filtered = suggestions
        .filter((s) => displayLabel(s).toLowerCase().includes(q.toLowerCase()))
        .slice(0, maxResults);

      setItems(filtered);
      setOpen(filtered.length > 0);
      setHighlight(-1);
      setLoading(false);
      return;
    }

    // async list
    if (!getSuggestions) {
      setItems([]);
      setOpen(false);
      setHighlight(-1);
      setLoading(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await getSuggestions(q);
        const arr = Array.isArray(res) ? res.slice(0, maxResults) : [];
        setItems(arr);
        setOpen(arr.length > 0);
        setHighlight(-1);
      } catch (err) {
        console.error("Autocomplete getSuggestions error:", err);
        setItems([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, suggestions, getSuggestions, minChars, maxResults]);

  const handleSelect = (item) => {
    const label = displayLabel(item);

    setSelectedLabel(label);
    setQuery(label);

    // ✅ only here we emit selected value
    onChange?.(label);
    onSelect?.(item);

    setOpen(false);
    setHighlight(-1);
  };

  const commitOrRevert = () => {
    setOpen(false);
    setHighlight(-1);

    const q = (query || "").trim();

    // empty query -> either clear or revert
    if (!q) {
      if (clearOnInvalid) {
        setSelectedLabel("");
        setQuery("");
        onChange?.(""); // optional: comment out if you don't want clearing to propagate
      } else {
        setQuery(selectedLabel || "");
      }
      return;
    }

    // If allowFreeText is false, enforce exact match against full suggestions (not just filtered items)
    if (!allowFreeText) {
      const match =
        (Array.isArray(suggestions) ? suggestions : items).find(
          (it) => displayLabel(it).trim().toLowerCase() === q.toLowerCase()
        ) || null;

      if (match) {
        // normalize to official label (case, spacing)
        handleSelect(match);
      } else {
        // invalid text typed -> revert or clear
        if (clearOnInvalid) {
          setSelectedLabel("");
          setQuery("");
          onChange?.("");
        } else {
          setQuery(selectedLabel || "");
        }
      }
    } else {
      // free text allowed (not your use-case)
      setSelectedLabel(q);
      onChange?.(q);
    }
  };

  const onInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    // ❌ do NOT call onChange here (prevents plain text being stored)
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown" && items.length > 0) {
        setOpen(true);
        setHighlight(0);
        e.preventDefault();
      }
      if (e.key === "Enter") {
        // commit selection rules on enter
        commitOrRevert();
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      setHighlight((h) => Math.min(h + 1, items.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      setHighlight((h) => Math.max(h - 1, 0));
      e.preventDefault();
    } else if (e.key === "Enter") {
      if (highlight >= 0 && highlight < items.length) {
        handleSelect(items[highlight]);
      } else {
        commitOrRevert();
      }
      e.preventDefault();
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
      e.preventDefault();
    } else if (e.key === "Tab") {
      commitOrRevert();
    }
  };

  return (
    <div ref={containerRef} className="relative col-span-1">
      <label className="text-xs text-gray-600">Project name</label>

      <input
        aria-autocomplete="list"
        aria-controls={open ? listboxId.current : undefined}
        aria-expanded={open}
        role="combobox"
        value={query}
        onChange={onInputChange}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // blur fires before click sometimes; outside mousedown handler already commits.
          // still safe to commit on blur
          commitOrRevert();
        }}
        className="mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder={placeholder}
        required
      />

      {open && (
        <ul
          id={listboxId.current}
          role="listbox"
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {loading && (
            <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>
          )}

          {!loading && items.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-500">No matches</li>
          )}

          {!loading &&
            items.map((it, idx) => {
              const isHighlighted = idx === highlight;
              const label = displayLabel(it);
              return (
                <li
                  key={getKey(it) + "-" + idx}
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(it);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    isHighlighted ? "bg-blue-50" : "hover:bg-gray-50"
                  }`}
                >
                  {label}
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
