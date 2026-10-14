import React from "react";

/**
 * options supports:
 * 1) string[]  -> ["Project A", "Project B"]
 * 2) object[]  -> [{ value: "projA", label: "Project A" }, ...]
 */
export default function SimpleSelectForBR({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  label = null,
  required = false,
  disabled = false,
  className = "",
}) {
  const isObjectOption =
    options.length > 0 && typeof options[0] === "object" && options[0] !== null;

  const normalized = isObjectOption
    ? options.map((o) => ({
        value: String(o.value ?? o.id ?? o.key ?? ""),
        label: String(o.label ?? o.name ?? o.value ?? ""),
      }))
    : options.map((s) => ({ value: String(s), label: String(s) }));

  return (
    <div className="col-span-1">
      {label ? <label className="text-xs text-gray-600">{label}</label> : null}
<span className="text-red-500"> *</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        required={required}
        className={
          "mt-1 block w-full px-3 py-2 border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 " +
          className
        }
      >
        <option value="" disabled>
          {placeholder}
        </option>

        {normalized.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
