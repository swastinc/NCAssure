import React, { useEffect, useMemo, useState } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { useNavigate } from "react-router-dom";
import {
  ensureActiveAccount,
  loginWithRedirect,
} from "../config/msalConfig";
import qaPortalLoginLogo from "/ncassurelogo.png";
 
const ncLogo = "/nc-logo.png";
 
export default function LoginPage() {
  const { inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();
 
  const isForcedRelogin = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reason") === "session_expired";
  }, []);
 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionMessage, setSessionMessage] = useState("");
 
  const isMsalBusy = useMemo(() => {
    return (
      inProgress === InteractionStatus.Startup ||
      inProgress === InteractionStatus.Login ||
      inProgress === InteractionStatus.Logout ||
      inProgress === InteractionStatus.HandleRedirect ||
      inProgress === InteractionStatus.AcquireToken ||
      inProgress === InteractionStatus.SsoSilent
    );
  }, [inProgress]);
 
  const isCompletingRedirect =
    inProgress === InteractionStatus.Startup ||
    inProgress === InteractionStatus.HandleRedirect;
 
  useEffect(() => {
    document.title = "Login | QA Portal";
  }, []);
 
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) {
      return;
    }
 
    if (isForcedRelogin) {
      return;
    }
 
    const account = ensureActiveAccount();
 
    if (isAuthenticated && account) {
      navigate("/home", { replace: true });
    }
  }, [isAuthenticated, inProgress, isForcedRelogin, navigate]);
 
  useEffect(() => {
    if (inProgress === InteractionStatus.None) {
      setLoading(false);
    }
  }, [inProgress]);
 
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("reason");
 
    if (reason === "session_expired") {
      setSessionMessage("Your session has expired. Please log in again.");
    }
  }, []);
 
  const handleClick = async () => {
    if (loading || isMsalBusy) {
      return;
    }
 
    try {
      setError("");
      setSessionMessage("");
      setLoading(true);
 
      await loginWithRedirect();
    } catch (e) {
      console.error("MSAL redirect login failed:", e);
 
      setError(e?.message || "Sign-in failed. Please try again.");
      setLoading(false);
    }
  };
 
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <main className="min-h-screen">
        <div className="grid min-h-screen w-full overflow-hidden bg-white md:grid-cols-[40fr_60fr]">
          {/* Left section */}
          <section className="relative min-h-screen overflow-hidden bg-[#061a3f] px-8 py-10 text-white">
            {/* Left background decoration */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden"
            >
              <div className="absolute -left-28 -top-28 h-80 w-80 rounded-full bg-sky-500/25 blur-3xl" />
 
              <div className="absolute bottom-[-120px] right-[-120px] h-96 w-96 rounded-full bg-blue-500/25 blur-3xl" />
 
              <div className="absolute left-[20%] top-[38%] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
 
              <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.08)_1px,transparent_1px)] bg-[size:46px_46px]" />
 
              <div className="absolute -left-20 top-28 h-[1px] w-[520px] rotate-[28deg] bg-gradient-to-r from-transparent via-sky-300/35 to-transparent" />
 
              <div className="absolute left-20 top-56 h-[1px] w-[420px] rotate-[28deg] bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
 
              <div className="absolute -right-24 bottom-36 h-[1px] w-[560px] rotate-[28deg] bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />
 
              <div className="absolute left-10 top-20 h-24 w-24 rotate-12 rounded-3xl border border-sky-300/20 bg-white/5 backdrop-blur-sm" />
 
              <div className="absolute right-16 top-32 h-16 w-16 rotate-45 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 backdrop-blur-sm" />
 
              <div className="absolute bottom-32 left-20 h-20 w-20 rounded-full border border-sky-300/25 bg-sky-300/10 backdrop-blur-sm" />
 
              <svg
                viewBox="0 0 520 520"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute bottom-8 right-[-60px] h-[420px] w-[420px] opacity-70"
              >
                <path
                  d="M80 360C150 250 250 290 290 180C325 85 430 100 465 170"
                  stroke="url(#blueLineGradient)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="8 12"
                />
 
                <circle cx="80" cy="360" r="6" fill="#38BDF8" />
                <circle cx="290" cy="180" r="6" fill="#60A5FA" />
                <circle cx="465" cy="170" r="6" fill="#22D3EE" />
 
                <defs>
                  <linearGradient
                    id="blueLineGradient"
                    x1="80"
                    y1="360"
                    x2="465"
                    y2="170"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#22D3EE" stopOpacity="0.15" />
 
                    <stop
                      offset="0.5"
                      stopColor="#38BDF8"
                      stopOpacity="0.75"
                    />
 
                    <stop
                      offset="1"
                      stopColor="#2563EB"
                      stopOpacity="0.2"
                    />
                  </linearGradient>
                </defs>
              </svg>
 
              <div className="absolute -right-28 bottom-8 h-80 w-80 rounded-full border border-sky-400/20" />
 
              <div className="absolute -right-14 bottom-20 h-64 w-64 rounded-full border border-sky-400/20" />
 
              <div className="absolute bottom-0 right-0 h-72 w-72 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.28)_0,rgba(14,165,233,0.12)_32%,transparent_68%)]" />
            </div>
 
            {/* Left content */}
            <div className="relative z-10 mx-auto flex min-h-full w-full max-w-xl items-start justify-center">
              <div className="w-full max-w-md text-left">
                {/* Nathcorp logo */}
                <div className="flex w-full justify-center">
                  <img
                    src={ncLogo}
                    alt="Nathcorp"
                    className="h-32 w-auto max-w-full object-contain sm:h-36 lg:h-40"
                    loading="lazy"
                    decoding="async"
                    draggable="false"
                  />
                </div>
 
                {/* Main heading */}
                <h1 className="mt-[10px] whitespace-nowrap text-3xl font-bold leading-tight sm:text-4xl">
                  AI-Powered{" "}
                  <span className="text-sky-400">QA Intelligence</span>
                </h1>
 
                {/* Divider */}
                <div className="mt-6 h-px w-full bg-gradient-to-r from-sky-300/60 via-sky-300/40 to-transparent" />
 
                {/* Feature list */}
                <div className="mt-8 w-full space-y-4 text-left text-base text-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ▣
                    </span>
                    <span>QA Analytics Dashboard</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ⌁
                    </span>
                    <span>Build Confidence Score</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ✓
                    </span>
                    <span>AI-Driven Insights</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ✦
                    </span>
                    <span>Smart Build Releases</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ✓
                    </span>
                    <span>Automated Sign-offs</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ∞
                    </span>
                    <span>ADO Integration</span>
                  </div>
 
                  <div className="flex items-center gap-3">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-sky-300/60 text-sky-300">
                      ✦
                    </span>
                    <span>Teams Notifications</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
 
          {/* Right section */}
          <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white via-slate-50 to-blue-50 px-8 py-10">
            {/* Right background decoration */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
            >
              <div className="absolute right-[-160px] top-[-140px] h-[520px] w-[520px] rounded-full bg-blue-200/35 blur-3xl" />
 
              <div className="absolute bottom-[-180px] left-[-120px] h-[460px] w-[460px] rounded-full bg-cyan-200/35 blur-3xl" />
 
              <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.055)_1px,transparent_1px)] bg-[size:42px_42px]" />
 
              <div className="absolute right-[8%] top-[12%] h-32 w-56 rotate-[-8deg] rounded-2xl border border-blue-200/70 bg-white/50 shadow-[0_20px_60px_rgba(37,99,235,0.14)] backdrop-blur-md">
                <div className="flex items-center gap-2 px-5 pt-5">
                  <span className="h-3 w-3 rounded-full bg-blue-500/70" />
                  <span className="h-3 w-3 rounded-full bg-cyan-400/70" />
                  <span className="h-3 w-3 rounded-full bg-slate-300/80" />
                </div>
 
                <div className="mt-5 space-y-2 px-5">
                  <div className="h-2 w-28 rounded-full bg-blue-300/70" />
                  <div className="h-2 w-40 rounded-full bg-slate-300/70" />
                  <div className="h-2 w-32 rounded-full bg-slate-300/60" />
                </div>
              </div>
 
              <div className="absolute left-[9%] top-[18%] h-40 w-40 rotate-[10deg] rounded-3xl border border-cyan-200/70 bg-white/45 shadow-[0_20px_60px_rgba(14,165,233,0.13)] backdrop-blur-md">
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[10px] border-blue-200/70" />
 
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[10px] border-transparent border-r-cyan-400/70 border-t-blue-500/70" />
 
                <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80 shadow-inner" />
              </div>
 
              <div className="absolute bottom-[14%] right-[12%] h-44 w-64 rotate-[7deg] rounded-3xl border border-blue-200/70 bg-white/50 p-5 shadow-[0_20px_60px_rgba(37,99,235,0.14)] backdrop-blur-md">
                <div className="mb-5 h-3 w-28 rounded-full bg-blue-300/80" />
 
                <div className="flex h-24 items-end gap-3">
                  <div className="h-10 w-8 rounded-t-lg bg-blue-300/70" />
                  <div className="h-16 w-8 rounded-t-lg bg-cyan-300/70" />
                  <div className="h-12 w-8 rounded-t-lg bg-blue-400/70" />
                  <div className="h-20 w-8 rounded-t-lg bg-cyan-400/70" />
                  <div className="h-14 w-8 rounded-t-lg bg-blue-300/70" />
                </div>
              </div>
 
              <div className="absolute bottom-[18%] left-[12%] h-28 w-52 rotate-[-6deg] rounded-2xl border border-cyan-200/70 bg-white/50 p-5 shadow-[0_20px_60px_rgba(14,165,233,0.13)] backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-600">
                    ✦
                  </div>
 
                  <div className="space-y-2">
                    <div className="h-2.5 w-24 rounded-full bg-blue-300/80" />
                    <div className="h-2 w-32 rounded-full bg-slate-300/70" />
                  </div>
                </div>
 
                <div className="mt-5 h-2 w-full rounded-full bg-slate-200">
                  <div className="h-2 w-2/3 rounded-full bg-blue-400/80" />
                </div>
              </div>
 
              <svg
                viewBox="0 0 900 700"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 h-full w-full opacity-[0.22]"
              >
                <circle cx="145" cy="250" r="5" fill="#2563EB" />
                <circle cx="450" cy="110" r="5" fill="#2563EB" />
                <circle cx="755" cy="250" r="5" fill="#2563EB" />
 
                <path
                  d="M105 520C230 430 350 455 455 535C570 622 690 595 810 485"
                  stroke="#06B6D4"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="10 14"
                />
 
                <circle cx="105" cy="520" r="5" fill="#06B6D4" />
                <circle cx="455" cy="535" r="5" fill="#06B6D4" />
                <circle cx="810" cy="485" r="5" fill="#06B6D4" />
              </svg>
            </div>
 
            {/* Login content */}
            <div className="relative z-10 flex w-full max-w-md flex-col items-center">
              {/* NCAssure logo above the welcome card */}
              <img
                src={qaPortalLoginLogo}
                alt="NCAssure"
                className="mb-6 h-14 w-auto max-w-[340px] object-contain sm:h-16"
                loading="eager"
                decoding="async"
                draggable="false"
              />
 
              {/* Welcome card */}
              <div className="w-full rounded-[24px] border border-white/70 bg-white/75 px-8 py-[3.25rem] text-center shadow-[0_20px_60px_rgba(15,23,42,0.14)] ring-1 ring-white/70 backdrop-blur-xl">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-700">
                  Welcome back
                </h2>
 
                <p className="mt-2 text-sm text-slate-500">
                  Sign in to continue
                </p>
 
                {sessionMessage && (
                  <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {sessionMessage}
                  </div>
                )}
 
                {error && (
                  <div className="mt-5 break-words rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
 
                {isCompletingRedirect ? (
                  <div className="mt-8 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Completing sign-in, please wait...
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleClick}
                    disabled={loading || isMsalBusy}
                    aria-busy={loading || isMsalBusy}
                    className={`mt-8 inline-flex w-full items-center justify-center gap-3 rounded-md bg-[#1557e7] px-5 py-3.5 text-sm font-semibold text-white shadow-md transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                      loading || isMsalBusy
                        ? "cursor-not-allowed bg-blue-300"
                        : "cursor-pointer hover:bg-[#0f4dd2]"
                    }`}
                  >
                    <span>
                      {loading || isMsalBusy ? "Signing in..." : "Sign in"}
                    </span>
                  </button>
                )}
 
                <div className="mt-8 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
                  <span>Secure · Trusted · Enterprise Ready</span>
                </div>
              </div>
 
              <p className="mt-6 text-center text-xs text-slate-500">
                © 2026 Nathcorp · Secure authentication powered by Microsoft
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
 