export * from "./generated/api";
export * from "./generated/api.schemas";
import { setBaseUrl } from "./custom-fetch";
export { setBaseUrl, setAuthTokenGetter } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";

declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
  };
};

// Auto-configure base URL from Expo environment
const apiUrl = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;
if (apiUrl) {
  setBaseUrl(apiUrl);
}
