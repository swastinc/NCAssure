import { useIdleTimer } from "react-idle-timer";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export function IdleLogoutHandler() {
  const { instance } = useMsal();
  const navigate = useNavigate();

  useIdleTimer({
    timeout: IDLE_TIMEOUT_MS,
    onIdle: async () => {
 
      const accounts = instance.getAllAccounts();
      if (accounts.length > 0) {
        try {
          await instance.logoutRedirect({
            account: accounts[0],
            postLogoutRedirectUri: `${window.location.origin}/login`,
          });
          return;
        } catch (err) {
          console.error("Idle logout redirect failed, falling back to login route:", err);
        }
      }

      navigate("/login", { replace: true });
    },
    debounce: 500,
  });

  return null;
}
