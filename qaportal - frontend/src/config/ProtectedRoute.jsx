// src/config/ProtectedRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { validateSessionOrLogout } from "./msalConfig";

export default function ProtectedRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const isValid = await validateSessionOrLogout({
          redirect: false,
        });

        if (!cancelled) {
          setAllowed(isValid);
          setChecking(false);
        }
      } catch (error) {
        console.error("[ProtectedRoute] session validation failed:", error);

        if (!cancelled) {
          setAllowed(false);
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
   <div className="min-h-screen grid place-items-center text-sm text-gray-600">
        
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/login?reason=session_expired" replace />;
  }

  return children;
}