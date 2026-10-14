// VersionSelect.jsx
import React from "react";

export default function VersionSelect({
  value,
  onChange,
  options = [],
  className = "",
  disabled = false,
}) {
  const hasOptions = Array.isArray(options) && options.length > 0;
  const isDisabled = disabled || !hasOptions;

  return (
    <select
      value={hasOptions ? value : "__NO_BUILDS__"}
      onChange={(e) => onChange(e.target.value)}
      disabled={isDisabled}
      className={`block w-16 sm:w-16 max-w-full px-1 py-1 m-0 sm:m-2 border cursor-pointer rounded-md bg-white pr-1 text-xs sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
    >
      {!hasOptions ? (
        <option value="__NO_BUILDS__">No Builds</option>
      ) : (
        options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))
      )}
    </select>
  );
}
