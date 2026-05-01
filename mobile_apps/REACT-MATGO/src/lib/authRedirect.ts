import * as ExpoLinking from "expo-linking";

export const APP_AUTH_URL = "foodgo://auth";
export const APP_AUTH_CALLBACK_URL = "foodgo://auth/callback";
export const EXPO_AUTH_CALLBACK_URL = ExpoLinking.createURL("/auth/callback");

type QueryValue = string | string[] | undefined;

type AuthRedirectParams = {
  code?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
};

const AUTH_REDIRECT_PREFIXES = [
  APP_AUTH_URL,
  APP_AUTH_CALLBACK_URL,
  EXPO_AUTH_CALLBACK_URL,
];

function getStringParam(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parseParamString(paramString: string) {
  const params = new URLSearchParams(paramString);
  const result: Record<string, string> = {};

  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

function extractParams(url: string) {
  const result: Record<string, string> = {};
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  if (queryIndex >= 0) {
    const queryEnd = hashIndex >= 0 && hashIndex > queryIndex ? hashIndex : url.length;
    Object.assign(result, parseParamString(url.slice(queryIndex + 1, queryEnd)));
  }

  if (hashIndex >= 0) {
    Object.assign(result, parseParamString(url.slice(hashIndex + 1)));
  }

  return result;
}

function collectCandidateUrls(url: string, seen = new Set<string>()) {
  if (seen.has(url)) return [];
  seen.add(url);

  const params = extractParams(url);
  const nestedUrl = params.url;
  const candidates = [url];

  if (nestedUrl) {
    candidates.push(...collectCandidateUrls(nestedUrl, seen));
  }

  return candidates;
}

function pickAuthParams(url: string) {
  for (const candidate of collectCandidateUrls(url)) {
    const params = extractParams(candidate);
    if (
      params.code ||
      params.token ||
      params.access_token ||
      params.refresh_token ||
      params.error ||
      params.error_description
    ) {
      return params;
    }
  }

  return extractParams(url);
}

export function isAuthRedirectUrl(url: string | null | undefined) {
  if (!url) return false;
  return AUTH_REDIRECT_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function parseAuthRedirect(url: string): AuthRedirectParams {
  const queryParams = pickAuthParams(url);

  return {
    code: getStringParam(queryParams.code),
    token: getStringParam(queryParams.token),
    accessToken: getStringParam(queryParams.access_token),
    refreshToken: getStringParam(queryParams.refresh_token),
    error:
      getStringParam(queryParams.error_description) ??
      getStringParam(queryParams.error),
  };
}
