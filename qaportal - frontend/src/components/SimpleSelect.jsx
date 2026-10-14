// SimpleSelect.jsx
import React from "react";

export default function SimpleSelect({
    value,
    onChange,
    options,
    className = "",
    disabled = false,
}) {
    return (
        <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`block w-16 sm:w-16 max-w-full px-1 py-1 m-0 sm:m-2 cursor-pointer border rounded-md bg-white pr-1 text-xs sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
        >
        {options.map(opt => (
            <option key={opt.value} value={opt.value}>
            {opt.label}
            </option>
        ))}
        </select>
    );
    }

    
