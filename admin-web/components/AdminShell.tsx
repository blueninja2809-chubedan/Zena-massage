"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav: { href: string; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { href: "/", label: "Dashboard", Icon: IconHome },
  { href: "/bookings", label: "Đơn hàng", Icon: IconCalendar },
  { href: "/reviews", label: "Đánh giá", Icon: IconStar },
  { href: "/technicians", label: "Kỹ thuật viên", Icon: IconUsers },
  { href: "/coordination", label: "Điều phối & chat", Icon: IconMessage },
  { href: "/wallets", label: "Ví người dùng", Icon: IconWallet },
  { href: "/withdrawals", label: "Duyệt rút tiền", Icon: IconBank },
  { href: "/content", label: "Nội dung", Icon: IconImage },
  { href: "/users", label: "Quản lý Users", Icon: IconUserCog },
  { href: "/schedule", label: "Lịch làm việc", Icon: IconClock },
  { href: "/promotions", label: "Khuyến mãi", Icon: IconTag },
  { href: "/notifications", label: "Thông báo", Icon: IconBell },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div className="flex min-h-screen admin-bg-mesh text-slate-900">
      {/* Mobile top bar */}
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 shadow-md shadow-rose-500/25">
            <span className="text-lg" aria-hidden>
              🌸
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Zena Admin</p>
            <p className="text-[10px] text-slate-500">Bảng điều khiển</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm"
          aria-label={open ? "Đóng menu" : "Mở menu"}
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile overlay + drawer */}
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={[
          "fixed bottom-0 left-0 top-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-white/5 bg-[var(--admin-sidebar)] shadow-2xl transition-transform duration-200 ease-out lg:static lg:z-0 lg:w-64 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="border-b border-white/5 px-5 pb-4 pt-6 lg:pt-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 text-xl shadow-lg shadow-rose-900/40">
              🌸
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
                Zena
              </p>
              <p className="text-lg font-bold tracking-tight text-white">Admin Panel</p>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Điều hành dịch vụ, người dùng và kỹ thuật viên.
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = pathname === item.href;
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={[
                  "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-white/10 text-white shadow-inner shadow-white/5"
                    : "text-slate-400 hover:bg-[var(--admin-sidebar-hover)] hover:text-white",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition",
                    active
                      ? "bg-rose-500/20 text-rose-300"
                      : "bg-white/5 text-slate-500 group-hover:bg-white/10 group-hover:text-slate-200",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="leading-tight">{item.label}</span>
                {active ? (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/5 p-4">
          <p className="text-center text-xs text-slate-600">
            Đăng xuất từ app Zena
            <br />
            <span className="text-slate-500">(tích hợp sau)</span>
          </p>
        </div>
      </aside>

      <main className="min-h-screen flex-1 overflow-auto px-4 pb-8 pt-20 lg:px-8 lg:pb-10 lg:pt-10">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}
function IconClose({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
    </svg>
  );
}
function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}
function IconStar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l2.4 5.5L20 9.3l-4.5 4 1.2 5.7L12 16.9 7.3 19l1.2-5.7-4.5-4 5.6-.8L12 3z"
      />
    </svg>
  );
}
function IconUsers({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" d="M16 11a3 3 0 10-3-3M8 11a3 3 0 10-3-3" />
      <path strokeLinecap="round" d="M3 19.5C3 16 5.5 14 8 14h.5M21 19.5C21 16 18.5 14 16 14h-.5" />
    </svg>
  );
}
function IconMessage({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h6M5 4h14a1 1 0 011 1v11a1 1 0 01-1 1H9l-4 3v-3H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
    </svg>
  );
}
function IconWallet({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path strokeLinecap="round" d="M16 12h.01M3 10h18" />
    </svg>
  );
}
function IconBank({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 10v8h14v-8M9 8V6l3-2 3 2v2" />
    </svg>
  );
}
function IconImage({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path strokeLinecap="round" d="M21 16l-5-5-4 4-2-2-4 4" />
    </svg>
  );
}
function IconUserCog({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" d="M12 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
      <path strokeLinecap="round" d="M3 19.5C3 16 5.5 14 8 14h.5M20 14l1 1-1 1M18 10l-1-1" />
    </svg>
  );
}
function IconClock({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" d="M12 7.5V12l3 2" />
    </svg>
  );
}
function IconTag({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h7l8 8v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2H8a1 1 0 01-1-1V5z" />
    </svg>
  );
}
function IconBell({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" d="M6 8a6 6 0 1012 0c0 5 2 5 2 7H4c0-2 2-2 2-7M10 20h4" />
    </svg>
  );
}
