import { useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { getExpiryMs, isAuthenticated, redirectToLogin, IS_DEV_HOST } from "../lib/auth";

// Session-scoped so the splash shows once when the app is opened, but NOT on a
// refresh within the same tab session.
const SESSION_KEY = "sc.splashShown";
const DURATION_MS = 2400;
// Signed-out users are bounced quickly; an expired session gets a longer,
// dedicated notice so the user understands why they're being redirected.
const REDIRECT_SECONDS = 6;
const EXPIRED_REDIRECT_SECONDS = 8;

export function BootGate({ children }: { children: ReactNode }) {
  const [authed] = useState<boolean>(() => isAuthenticated());
  const [ready, setReady] = useState<boolean>(
    () => authed && typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1"
  );

  useEffect(() => {
    if (!authed || ready) return;
    const t = setTimeout(() => {
      sessionStorage.setItem(SESSION_KEY, "1");
      setReady(true);
    }, DURATION_MS);
    return () => clearTimeout(t);
  }, [authed, ready]);

  if (!authed) return <AuthRedirectSplash reason="signed-out" />;
  return <AuthExpiryGuard>{ready ? <>{children}</> : <Splash />}</AuthExpiryGuard>;
}

// Watches the live OIDC expiry and swaps the app for the redirect splash the
// instant the token expires.
function AuthExpiryGuard({ children }: { children: ReactNode }) {
  const [expired, setExpired] = useState<boolean>(false);
  useEffect(() => {
    const expMs = getExpiryMs();
    if (expMs === null) return;
    const delay = expMs - Date.now();
    if (delay <= 0) {
      setExpired(true);
      return;
    }
    const t = setTimeout(() => setExpired(true), delay);
    return () => clearTimeout(t);
  }, []);
  if (expired) return <AuthRedirectSplash reason="expired" />;
  return <>{children}</>;
}

function SplashShell({
  subtitle,
  footer,
  progressMs,
  progressEasing = "ease-in-out",
  showProgress = true,
  action,
}: {
  subtitle: string;
  footer: ReactNode;
  progressMs: number;
  progressEasing?: string;
  showProgress?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      data-app-root
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg-primary text-fg-primary"
    >
      <div className="flex flex-col items-center animate-fade-in">
        <span
          className="grid h-20 w-20 place-items-center rounded-2xl bg-action-primary text-white shadow-[0_12px_34px_rgba(0,146,147,0.35)]"
          style={{ animation: "boot-bob 2.4s ease-in-out infinite" }}
        >
          <ShieldCheck size={40} />
        </span>
        <h1 className="mt-6 font-serif text-3xl font-semibold tracking-tight">Smart Claims</h1>
        <p className="mt-1.5 text-sm text-fg-secondary">{subtitle}</p>
        {showProgress && (
          <div className="mt-9 h-1 w-56 overflow-hidden rounded-pill bg-bg-secondary">
            <div
              className="h-full rounded-pill bg-action-primary"
              style={{ animation: `boot-progress ${progressMs}ms ${progressEasing} forwards` }}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-fg-secondary">{footer}</p>
        {action && <div className="mt-6 flex items-center gap-3">{action}</div>}
      </div>
    </div>
  );
}

function Splash() {
  return (
    <SplashShell
      subtitle="SSA disability case bundles"
      footer="Loading governed claim data…"
      progressMs={DURATION_MS}
    />
  );
}

function AuthRedirectSplash({ reason }: { reason: "signed-out" | "expired" }) {
  const totalSeconds = reason === "expired" ? EXPIRED_REDIRECT_SECONDS : REDIRECT_SECONDS;
  const [secs, setSecs] = useState<number>(totalSeconds);
  const [paused, setPaused] = useState<boolean>(false);

  useEffect(() => {
    if (paused) return;
    const tick = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    const t = setTimeout(redirectToLogin, totalSeconds * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(t);
    };
  }, [paused, reason, totalSeconds]);

  const subtitle =
    reason === "expired" ? "Your DataOS session has expired" : "You're not signed in to DataOS";
  const footer = paused
    ? "Redirect paused (dev) — paste a valid token, then reload."
    : reason === "expired"
      ? `Your session timed out — redirecting you to sign in again… (${secs}s)`
      : `Redirecting you to sign in… (${secs}s)`;

  const action = IS_DEV_HOST ? (
    paused ? (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        Reload app
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setPaused(true)}
        className="rounded-lg border border-divider bg-bg-elevated px-4 py-2 text-sm font-medium text-fg-primary transition hover:opacity-80"
      >
        Stop redirect (dev)
      </button>
    )
  ) : undefined;

  return (
    <SplashShell
      subtitle={subtitle}
      footer={footer}
      progressMs={totalSeconds * 1000}
      progressEasing="linear"
      showProgress={!paused}
      action={action}
    />
  );
}
