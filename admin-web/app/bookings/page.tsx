import { EnvMissing } from "@/components/EnvMissing";
import { fetchProfilesByIds } from "@/lib/profiles";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function BookingsPage() {
  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, status, created_at, user_id, therapist_id, payload")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="admin-surface border-rose-200 bg-rose-50/80 p-6 text-rose-800">
        {error.message}
      </div>
    );
  }

  const rows = data ?? [];
  const profileIds = [
    ...new Set(rows.flatMap((b) => [b.user_id, b.therapist_id].filter(Boolean).map(String))),
  ];
  const profileMap = await fetchProfilesByIds(supabase, profileIds);

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Đơn hàng &amp; booking</h1>
        <p className="admin-page-sub">
          100 đơn mới nhất; tên từ <span className="font-medium">profiles</span>, payload bổ sung nếu thiếu.
        </p>
      </header>
      <div className="admin-table-wrap">
        <table className="admin-table min-w-[900px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Khách</th>
              <th className="px-4 py-3 font-medium">KTV</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Ngày</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-td py-10 text-center text-slate-500">
                  Chưa có đơn hàng
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const p = (row.payload || {}) as Record<string, unknown>;
                const u = row.user_id ? profileMap.get(String(row.user_id)) : undefined;
                const t = row.therapist_id ? profileMap.get(String(row.therapist_id)) : undefined;
                const customer =
                  u?.display_name?.trim() ||
                  (p.customerName as string) ||
                  (p.customer_name as string) ||
                  (row.user_id ? String(row.user_id).slice(0, 8) + "…" : "—");
                const therapist =
                  t?.display_name?.trim() ||
                  (p.therapistName as string) ||
                  (p.therapist_name as string) ||
                  (row.therapist_id ? String(row.therapist_id).slice(0, 8) + "…" : "—");
                return (
                <tr key={row.id}>
                  <td className="admin-td font-mono text-xs text-slate-500">
                    {String(row.id).slice(0, 8)}…
                  </td>
                  <td className="admin-td text-slate-800">
                    <div className="font-medium">{customer}</div>
                    {u?.phone_number && (
                      <div className="text-xs text-slate-500">{u.phone_number}</div>
                    )}
                  </td>
                  <td className="admin-td text-slate-800">
                    <div className="font-medium">{therapist}</div>
                    {t?.phone_number && (
                      <div className="text-xs text-slate-500">{t.phone_number}</div>
                    )}
                  </td>
                  <td className="admin-td">
                    <span className="admin-badge-slate capitalize">{row.status}</span>
                  </td>
                  <td className="admin-td text-slate-500">
                    {row.created_at
                      ? new Date(row.created_at).toLocaleString("vi-VN")
                      : "—"}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
