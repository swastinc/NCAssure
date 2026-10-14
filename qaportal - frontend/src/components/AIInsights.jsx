import React, { useMemo } from "react";

/**
 * AIInsights
 * Props:
 *  data: {
 *    tests: {
 *      total: number,
 *      passed: number,
 *      failed?: number,
 *      blocked?: number,
 *      flaky?: number,            // optional count of flaky tests
 *      coverage?: number          // 0..100, optional
 *    },
 *    bugs: {
 *      open: { critical: number, high?: number, medium?: number, low?: number },
 *      list?: Array<{ id?: string|number, title: string, severity: 'critical'|'high'|'medium'|'low', status?: 'open'|'resolved' }>
 *    }
 *  }
 *  weights?: {
 *    passRate: number,            // positive weight
 *    coverage: number,            // positive weight
 *    flakyPenalty: number,        // per % flaky
 *    openCriticalPenalty: number, // per critical open bug
 *    openHighPenalty: number,     // per high open bug
 *    openMediumPenalty: number,   // per medium open bug
 *  }
 *
 * Example:
 * <AIInsights data={sampleData} />
 */

const DEFAULT_WEIGHTS = {
  passRate: 0.55,            // 55% of score
  coverage: 0.20,            // 20% of score
  flakyPenalty: 0.6,         // -0.6 per % flaky (scaled)
  openCriticalPenalty: 10,   // -10 per critical open
  openHighPenalty: 3,        // -3 per high open
  openMediumPenalty: 1,      // -1 per medium open
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function percent(numerator, denominator) {
  const d = Number(denominator) || 0;
  if (!d) return 0;
  return clamp((Number(numerator) / d) * 100, 0, 100);
}

function useInsights(data, weights) {
  return useMemo(() => {
    const W = { ...DEFAULT_WEIGHTS, ...(weights || {}) };

    const total = Number(data?.tests?.total) || 0;
    const passed = Number(data?.tests?.passed) || 0;
    const failed = Number(data?.tests?.failed) || Math.max(0, total - passed);
    const blocked = Number(data?.tests?.blocked) || 0;
    const flakyCount = Number(data?.tests?.flaky) || 0;
    const coverage = clamp(Number(data?.tests?.coverage) || 0, 0, 100);

    const open = {
      critical: Number(data?.bugs?.open?.critical) || 0,
      high: Number(data?.bugs?.open?.high) || 0,
      medium: Number(data?.bugs?.open?.medium) || 0,
      low: Number(data?.bugs?.open?.low) || 0,
    };

    const passRate = percent(passed, total);
    const flakyPct = percent(flakyCount, total);

    // Base score = weighted pass rate + weighted coverage
    let score =
      (passRate * W.passRate) +
      (coverage * W.coverage);

    // Penalties
    let penalty =
      (open.critical * W.openCriticalPenalty) +
      (open.high * W.openHighPenalty) +
      (open.medium * W.openMediumPenalty) +
      (flakyPct * W.flakyPenalty);

    const finalScore = clamp(Math.round(score - penalty), 0, 100);

    // Verdict
    let verdict = { label: "Not Ready", tone: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-200" };
    if (finalScore >= 80 && open.critical === 0 && failed === 0 && blocked === 0) {
      verdict = { label: "Ready", tone: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-200" };
    } else if (finalScore >= 60 && open.critical === 0) {
      verdict = { label: "Caution", tone: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-200" };
    }

    return {
      kpis: { total, passed, failed, blocked, passRate, flakyPct, coverage, open },
      breakdown: { score: Math.round((passRate * W.passRate) + (coverage * W.coverage)), penalty: Math.round(penalty) },
      finalScore,
      verdict,
      list: Array.isArray(data?.bugs?.list) ? data.bugs.list.filter(b => b.severity === 'critical' && (b.status ?? 'open') === 'open') : [],
      weights: W,
    };
  }, [data, weights]);
}

function Gauge({ value }) {
  // Conic gradient radial gauge
  const pct = clamp(Number(value) || 0, 0, 100);
  const angle = (pct / 100) * 360;
  const color = pct >= 80 ? "#10B981" : pct >= 60 ? "#F59E0B" : "#EF4444"; // emerald / amber / rose

  return (
    <div className="relative h-44 w-44">
      <div
        className="h-full w-full rounded-full"
        style={{
          background: `conic-gradient(${color} ${angle}deg, #E5E7EB ${angle}deg 360deg)`,
        }}
      />
      <div className="absolute inset-3 bg-white rounded-full grid place-items-center shadow-inner">
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-800">{pct}%</div>
          <div className="text-xs text-gray-500">Confidence</div>
        </div>
      </div>
    </div>
  );
}

export default function AIInsights({ data, weights }) {
  const { kpis, breakdown, finalScore, verdict, list, weights: W } = useInsights(data, weights);

  return (
    <div className="w-full bg-white rounded-2xl p-6 shadow-sm ring-1 ring-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">AI Insights</h3>
          <p className="text-sm text-gray-500">Confidence score to release to Production</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${verdict.bg} ${verdict.tone} ring-1 ${verdict.ring}`}>
          {verdict.label}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gauge */}
        <div className="flex items-center justify-center">
          <Gauge value={finalScore} />
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500">Pass Rate</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{kpis.passRate.toFixed(0)}%</div>
            <div className="mt-1 text-xs text-gray-500">
              {kpis.passed}/{kpis.total} passed
            </div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500">Coverage</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{kpis.coverage.toFixed(0)}%</div>
            <div className="mt-1 text-xs text-gray-500">Test coverage</div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500">Flaky Rate</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{kpis.flakyPct.toFixed(0)}%</div>
            <div className="mt-1 text-xs text-gray-500">{kpis.failed} failed · {kpis.blocked} blocked</div>
          </div>
          <div className="rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500">Open Critical Bugs</div>
            <div className="mt-1 text-2xl font-semibold text-gray-800">{kpis.open.critical}</div>
            <div className="mt-1 text-xs text-gray-500">High: {kpis.open.high} · Med: {kpis.open.medium}</div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="text-sm font-medium text-gray-800">Score Breakdown</div>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Base (Pass Rate × {W.passRate})</span>
              <span className="font-semibold">{Math.round(kpis.passRate * W.passRate)} pts</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Coverage × {W.coverage}</span>
              <span className="font-semibold">{Math.round(kpis.coverage * W.coverage)} pts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-600">Critical bugs × {W.openCriticalPenalty}</span>
              <span className="font-semibold text-rose-600">-{kpis.open.critical * W.openCriticalPenalty} pts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-600">High bugs × {W.openHighPenalty}</span>
              <span className="font-semibold text-amber-600">-{kpis.open.high * W.openHighPenalty} pts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-amber-600">Medium bugs × {W.openMediumPenalty}</span>
              <span className="font-semibold text-amber-600">-{kpis.open.medium * W.openMediumPenalty} pts</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-rose-600">Flaky {kpis.flakyPct.toFixed(0)}% × {W.flakyPenalty}</span>
              <span className="font-semibold text-rose-600">-{Math.round(kpis.flakyPct * W.flakyPenalty)} pts</span>
            </div>
            <div className="border-t pt-2 flex items-center justify-between">
              <span>Total</span>
              <span className="font-semibold">{Math.round(breakdown.score - breakdown.penalty)} pts</span>
            </div>
          </div>

          {/* Recommendations */}
          <div className="mt-4 text-xs text-gray-600">
            {kpis.open.critical > 0 && (
              <div className="mb-2">
                🔴 Resolve critical bugs before release.
              </div>
            )}
            {kpis.passRate < 85 && <div className="mb-1">🟠 Improve pass rate (target ≥ 90%).</div>}
            {kpis.coverage < 70 && <div className="mb-1">🟡 Increase test coverage (target ≥ 80%).</div>}
            {kpis.flakyPct > 5 && <div>🟠 Reduce flakiness (target ≤ 2%).</div>}
          </div>
        </div>
      </div>

      {/* Critical bug list (optional) */}
      {list?.length ? (
        <>
          <div className="mt-6 text-sm font-medium text-gray-800">Open Critical Bugs</div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((b, idx) => (
              <div key={`${b.id ?? idx}`} className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
                <div className="text-xs text-rose-700 font-semibold">CRITICAL</div>
                <div className="mt-1 text-sm text-gray-800">{b.title}</div>
                {b.id && <div className="mt-1 text-xs text-gray-500">ID: {b.id}</div>}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
