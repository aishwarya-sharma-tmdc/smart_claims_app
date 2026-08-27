import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, Users, PanelLeftClose, PanelLeftOpen, ShieldCheck } from "lucide-react";
import { AccountMenu } from "./AccountMenu";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/claimants", label: "Claimant Bundle Status", icon: Users, end: false },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem("sc.sidebar") === "1"
  );
  useEffect(() => {
    localStorage.setItem("sc.sidebar", collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="relative min-h-screen bg-bg-primary text-fg-primary" data-app-root>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div
        style={{ willChange: "padding-left" }}
        className={[
          "flex min-h-screen min-w-0 flex-col transition-[padding] duration-[240ms] ease-out",
          collapsed ? "md:pl-[84px]" : "md:pl-[288px]",
        ].join(" ")}
      >
        <main className="min-w-0 flex-1 px-6 py-8 lg:px-10">
          <div className="mx-auto w-full max-w-[1360px] animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const itemClass = ({ isActive }: { isActive: boolean }) =>
    [
      "group relative flex items-center overflow-hidden rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors duration-150",
      collapsed ? "justify-center" : "gap-3",
      isActive
        ? "bg-bg-primary text-fg-primary shadow-card"
        : "text-fg-secondary hover:bg-bg-primary hover:text-fg-primary",
    ].join(" ");

  return (
    <aside
      style={{ width: collapsed ? "84px" : "288px", transition: "width 240ms ease-out", willChange: "width" }}
      className="fixed left-0 top-0 z-30 hidden h-screen flex-col overflow-hidden border-r border-divider bg-bg-secondary md:flex"
    >
      <div className={collapsed ? "px-3 pb-5 pt-5" : "px-5 pb-5 pt-5"}>
        <Link
          to="/"
          className={[
            "inline-flex w-full items-center overflow-hidden rounded-lg text-fg-primary",
            collapsed ? "justify-center" : "gap-3",
          ].join(" ")}
          aria-label="Smart Claims home"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-action-primary text-white shadow-[0_6px_18px_rgba(0,146,147,0.28)]">
            <ShieldCheck size={22} />
          </span>
          {!collapsed && (
            <span className="animate-fade-in flex flex-col leading-tight">
              <span className="whitespace-nowrap font-serif text-[1.35rem] font-semibold tracking-tight">
                Smart Claims
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium text-fg-secondary">
                SSA disability bundles
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav className={`flex flex-1 flex-col gap-1 pt-2 ${collapsed ? "px-3" : "px-4"}`} aria-label="Primary">
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={itemClass} title={collapsed ? n.label : undefined}>
            <n.icon size={17} className="shrink-0" />
            {!collapsed && <span className="animate-fade-in whitespace-nowrap">{n.label}</span>}
          </NavLink>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        className={[
          "mx-3 mb-2 inline-flex items-center overflow-hidden rounded-lg px-3 py-2 text-[14px] font-medium text-fg-secondary transition-colors hover:bg-bg-primary hover:text-fg-primary",
          collapsed ? "justify-center" : "gap-2",
        ].join(" ")}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={17} className="shrink-0" /> : <PanelLeftClose size={17} className="shrink-0" />}
        {!collapsed && <span className="animate-fade-in whitespace-nowrap">Collapse</span>}
      </button>

      <div className="mx-4 mb-4 border-t border-divider" />
      <AccountMenu collapsed={collapsed} />
    </aside>
  );
}
