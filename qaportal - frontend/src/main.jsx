// src/main.jsx
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { Provider } from "react-redux";

import LoginPage from "./components/Login";
import HomePage from "./components/Home";
import ProtectedRoute from "./config/ProtectedRoute";
import { store } from "./config/store";
import {
  msalInstance,
  getMsalAccount,
  initializeMsal,
} from "./config/msalConfig";

import "./index.css";
// import { IdleLogoutHandler } from "./config/logoutSession";

function AuthCallbackPage() {
  const { inProgress } = useMsal();
  const navigate = useNavigate();
  const startedRef = useRef(false);

  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (startedRef.current) return;

    startedRef.current = true;

    async function completeLogin() {
      try {
        await initializeMsal();

        /**
         * Never use accounts[0] here.
         * The selected Microsoft account is captured from redirect result
         * inside initializeMsal().
         */
        const account = getMsalAccount();

        if (!account) {
          navigate("/login?reason=session_expired", { replace: true });
          return;
        }

        navigate("/home", { replace: true });
      } catch (err) {
        console.error("[AuthCallbackPage] auth callback failed:", err);
        navigate("/login?reason=session_expired", { replace: true });
      }
    }

    completeLogin();
  }, [inProgress, navigate]);

  return (
    <div className="min-h-screen grid place-items-center text-sm text-gray-600">
      Signing you in...
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      {/* <IdleLogoutHandler /> */}

      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route path="/login" element={<LoginPage />} />

        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  );
}

async function bootstrapApp() {
  try {
    await initializeMsal();
  } catch (err) {
    console.error("[main] MSAL initialization failed:", err);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <Provider store={store}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </Provider>
      </MsalProvider>
    </React.StrictMode>
  );
}

bootstrapApp();
