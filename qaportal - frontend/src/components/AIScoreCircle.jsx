import React, { useEffect, useState } from "react";

export default function AIScoreCircle({
  score,
  size = 90,
  stroke = 12,
  label = "",
  activetb = () => {}
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setProgress(score), 300);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = (size - stroke) / 2.4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  const color =
    score >= 90 ? "#22C55E" : score >= 70 ? "#F59E0B" : "#DC2626";

  return (
    <div className="relative isolate z-0 flex items-start justify-between">
      {/* Circle */}
      <div
        className="relative z-0 flex items-center justify-center ml-8"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          className="relative z-0 transform -rotate-90 transition-all duration-1000 ease-out"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#E5E7EB"
            strokeWidth={stroke}
            fill="none"
          />

          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-in-out"
          />
        </svg>

        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center text-center">
          <p className="text-2xl font-bold text-gray-800">{progress}%</p>
          <span className="text-sm text-gray-500">{label}</span>
        </div>
      </div>

      {/* ✅ Signoff Button visible only when score ≥ 90 */}
    {score >= 90 && (
      <button
        onClick={activetb}
        className="relative z-0 ml-6 -mt-1 px-4 py-1.5 rounded-full bg-green-600 text-white text-sm font-semibold cursor-pointer hover:bg-green-700 transition"
      >
        Signoff
      </button>
    )}
    </div>
  );
}
