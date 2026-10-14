import axios from "axios";
import { getBackendApiTokenAsync } from "../config/msalConfig";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function syncAdUsers(graphToken) {
    
  const backendToken = await getBackendApiTokenAsync();

  

  const response = await axios.post(
    `${API_BASE_URL}/api/ad-sync/sync-group-users`,
    {},
    {
      headers: {
        Authorization: `Bearer ${backendToken}`,
        "X-Graph-Access-Token": graphToken,
      },
    }
  );

  return response.data;
}