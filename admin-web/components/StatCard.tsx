export function StatCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accent: "blue" | "purple" | "rose" | "amber" | "emerald" | "red" | "yellow";
}) {
  const styles = {
    blue: {
      ring: "ring-sky-100",
      bar: "from-sky-400 to-blue-500",
      iconBg: "bg-sky-50 text-sky-600",
    },
    purple: {
      ring: "ring-violet-100",
      bar: "from-violet-400 to-purple-600",
      iconBg: "bg-violet-50 text-violet-600",
    },
    rose: {
      ring: "ring-rose-100",
      bar: "from-rose-400 to-rose-600",
      iconBg: "bg-rose-50 text-rose-600",
    },
    amber: {
      ring: "ring-amber-100",
      bar: "from-amber-400 to-orange-500",
      iconBg: "bg-amber-50 text-amber-700",
    },
    emerald: {
      ring: "ring-emerald-100",
      bar: "from-emerald-400 to-teal-500",
      iconBg: "bg-emerald-50 text-emerald-700",
    },
    red: {
      ring: "ring-red-100",
      bar: "from-red-400 to-red-600",
      iconBg: "bg-red-50 text-red-600",
    },
    yellow: {
      ring: "ring-yellow-100",
      bar: "from-yellow-400 to-amber-500",
      iconBg: "bg-yellow-50 text-yellow-800",
    },
  }[accent];

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-card ring-1 ${styles.ring} transition hover:shadow-soft`}
    >
      <div
        className={`absolute right-0 top-0 h-24 w-24 -translate-y-6 translate-x-6 rounded-full bg-gradient-to-br opacity-20 blur-2xl ${styles.bar}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1.5 text-xs font-medium text-slate-400">{subtitle}</p>
          ) : null}
        </div>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconBg}`}
          aria-hidden
        >
          <span className="text-lg opacity-90">◎</span>
        </div>
      </div>
      <div
        className={`pointer-events-none absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r ${styles.bar} opacity-90`}
      />
    </div>
  );
}
