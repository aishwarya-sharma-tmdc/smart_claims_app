// Client-side auth gate for the DataOS deployment (mirrors customer-health-app).
//
// Before the app renders, we require that a DataOS OIDC session object AND the
// signed-in user's `userInfo` are present in localStorage, and that the session
// is not expired. If any of that is missing, the user is sent to the DataOS FQDN
// (homepage) to sign in. This runs on every full page load and is invoked from
// the app's boot gate (SplashScreen.tsx), which mounts before any route. While
// the app is open, the expiry is also watched live so the user is redirected the
// moment the token expires (mirroring DataOS itself).
//
// The user's OIDC `access_token` is what the backend uses to query the semantic
// layer, so governance (masking + row-level security) is applied per user. The
// token is read fresh from localStorage on every request, so a re-login (which
// rewrites the OIDC object) is picked up automatically.
//
// NOTE: this is UX-level gating only. It keeps unauthenticated users out of the
// UI, but is bypassable client-side; real network enforcement is the DataOS
// gateway/ingress in front of the app.

// The DataOS instance this app is deployed against.
export const DATAOS_FQDN = "https://leidos-sandbox.instance.dataos.cloud";

// The exact key DataOS writes for the signed-in user's OIDC session.
const OIDC_KEY = `modern-oidc.user:${DATAOS_FQDN}/oidc:dataos_generic`;

// The key DataOS writes for the signed-in user's profile.
const USER_INFO_KEY = "userInfo";

// Dev host = Vite dev server or a localhost origin. ONLY on a dev host do we
// expose a "stop redirect" control (so a token can be pasted manually). The
// deployed build is served from the DataOS FQDN, so this is false there and the
// redirect is strict.
export const IS_DEV_HOST =
  (import.meta.env?.DEV ?? false) ||
  (typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname));

interface OidcSession {
  expires_at?: number; // epoch SECONDS (oidc-client convention)
  access_token?: string;
}

function readSession(): OidcSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OIDC_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OidcSession;
  } catch (err) {
    console.warn("[Smart Claims] Auth: failed to parse session object —", err);
    return null;
  }
}

function hasUserInfo(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(USER_INFO_KEY);
  return typeof raw === "string" && raw.trim().length > 0;
}

// The session's expiry as epoch MILLISECONDS, or null if there's no session /
// no expiry field. Used to schedule a live redirect the instant it expires.
export function getExpiryMs(): number | null {
  const s = readSession();
  if (s && typeof s.expires_at === "number") return s.expires_at * 1000;
  return null;
}

// The user's OIDC access_token, read fresh from localStorage. Returns null when
// there's no session, no token, or the token has expired — the backend requires
// a live token, so we don't send a stale one.
export function getAccessToken(): string | null {
  const s = readSession();
  if (!s || typeof s.access_token !== "string" || !s.access_token) return null;
  const expMs = typeof s.expires_at === "number" ? s.expires_at * 1000 : null;
  if (expMs !== null && expMs <= Date.now()) return null;
  return s.access_token;
}

export function isAuthenticated(): boolean {
  // No DOM (SSR/build) — don't block rendering.
  if (typeof window === "undefined") return true;

  if (!hasUserInfo()) {
    console.warn(`[Smart Claims] Auth: no "${USER_INFO_KEY}" in localStorage.`);
    return false;
  }

  const s = readSession();
  if (!s) {
    console.warn(`[Smart Claims] Auth: no DataOS session at "${OIDC_KEY}".`);
    return false;
  }
  const expMs = typeof s.expires_at === "number" ? s.expires_at * 1000 : null;
  if (expMs !== null && expMs <= Date.now()) {
    console.warn("[Smart Claims] Auth: DataOS token has expired.");
    return false;
  }
  return true;
}

export function redirectToLogin(): void {
  // replace() so the unauthenticated view isn't left in browser history.
  window.location.replace(DATAOS_FQDN);
}
