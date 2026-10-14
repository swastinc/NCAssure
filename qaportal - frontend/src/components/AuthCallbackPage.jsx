import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import {
  handleAuthRedirect,
  primeUserAccessTokenCache,
  getMsalAccount,
} from "../config/msalConfig";

import { registerUser } from "../api/userFromEmail";

export function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const ok = await handleAuthRedirect();
      if (!ok) {
        navigate("/", { replace: true });
        return;
      }

      try {
        await primeUserAccessTokenCache();

        const account = getMsalAccount();
        await registerUser(account?.username, account?.name);

        navigate("/home", { replace: true });
      } catch (e) {
        console.error("[AuthCallbackPage] error:", e);
        navigate("/", { replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Signing you in…</h2>
      <p>Please wait while authentication completes.</p>
    </div>
  );
}
    
