import { EnvMissing } from "@/components/EnvMissing";
import { StatCard } from "@/components/StatCard";
import { fetchProfilesByIds } from "@/lib/profiles";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  const supabase = createSupabaseClient();

  const [
    usersRes,
    therapistsAsProfilesRes,
    bookingsRes,
    pendingRes,
    confirmedRes,
    completedRes,
    cancelledRes,
    withdrawalsPendingRes,
    partnersPendingRes,
    recentRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "therapist"),
    supabase.from("bookings").select("*", { count: "exact", head: true }),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "confirmed"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("bookings").select("*", { count: "exact", head: true }).eq("status", "cancelled"),
    supabase
      .from("withdrawal_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("partner_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("bookings")
      .select("id, status, created_at, payload, user_id")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const recentRows = recentRes.data ?? [];
  const recentUserIds = [...new Set(recentRows.map((r) => r.user_id).filter(Boolean))] as string[];
  const recentProfileMap = await fetchProfilesByIds(supabase, recentUserIds);

  const err =
    usersRes.error ||
    therapistsAsProfilesRes.error ||
    bookingsRes.error ||
    recentRes.error;

  if (err) {
    return (
      <div className="admin-surface border-rose-200 bg-rose-50/50 p-6 text-rose-800">
        <h1 className="text-lg font-bold">Lỗi truy vấn Supabase</h1>
        <p className="mt-2 font-mono text-sm text-rose-700">{err.message}</p>
      </div>
    );
  }

  const pendingCombined =
    (pendingRes.count ?? 0) + (confirmedRes.count ?? 0);

  return (
    <div className="space-y-8">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Dashboard</h1>
        <p className="admin-page-sub">Tổng quan người dùng, booking và tác vụ cần xử lý.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard title="Tổng người dùng" value={usersRes.count ?? 0} accent="blue" />
        <StatCard title="Kỹ thuật viên" value={therapistsAsProfilesRes.count ?? 0} accent="purple" />
        <StatCard
          title="Tổng booking"
          value={bookingsRes.count ?? 0}
          subtitle={`${pendingCombined} đang chờ`}
          accent="rose"
        />
        <StatCard
          title="Cần duyệt rút tiền"
          value={withdrawalsPendingRes.count ?? 0}
          accent="amber"
        />
        <StatCard title="Booking hoàn thành" value={completedRes.count ?? 0} accent="emerald" />
        <StatCard title="Booking đã hủy" value={cancelledRes.count ?? 0} accent="red" />
        <StatCard
          title="Đơn đăng ký đối tác"
          value={partnersPendingRes.count ?? 0}
          subtitle="Chờ duyệt"
          accent="yellow"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="admin-surface-elevated lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold text-slate-900">Đơn hàng gần đây</h2>
            <p className="mt-0.5 text-xs text-slate-500">8 đơn mới nhất</p>
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead className="admin-thead">
                <tr>
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-5 py-3 font-medium">Khách hàng</th>
                  <th className="px-5 py-3 font-medium">Ngày</th>
                  <th className="px-5 py-3 font-medium">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {(recentRes.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="admin-td py-10 text-center text-slate-500">
                      Chưa có đơn hàng nào
                    </td>
                  </tr>
                ) : (
                  recentRows.map((row) => {
                    const payload = row.payload as Record<string, unknown> | null;
                    const fromProfile = row.user_id
                      ? recentProfileMap.get(String(row.user_id))?.display_name?.trim() || undefined
                      : undefined;
                    const name =
                      fromProfile ||
                      (typeof payload?.customerName === "string" && payload.customerName) ||
                      (typeof payload?.customer_name === "string" && payload.customer_name) ||
                      row.user_id ||
                      "—";
                    return (
                      <tr key={row.id}>
                        <td className="admin-td font-mono text-xs text-slate-500">
                          {String(row.id).slice(0, 8)}…
                        </td>
                        <td className="admin-td font-medium text-slate-900">{name}</td>
                        <td className="admin-td text-slate-500">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString("vi-VN")
                            : "—"}
                        </td>
                        <td className="admin-td">
                          <span className="admin-badge-slate capitalize">{row.status}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="admin-surface-elevated flex flex-col p-5">
          <h2 className="text-base font-bold text-slate-900">Cần xử lý</h2>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">
            {(withdrawalsPendingRes.count ?? 0) > 0 ||
            (partnersPendingRes.count ?? 0) > 0 ? (
              <>
                <span className="font-semibold text-rose-700">{withdrawalsPendingRes.count ?? 0}</span> yêu cầu rút
                tiền; <span className="font-semibold text-amber-700">{partnersPendingRes.count ?? 0}</span> đơn đối
                tác chờ duyệt.
              </>
            ) : (
              <span className="text-slate-500">Không có mục nào cần xử lý. Mọi thứ ổn định.</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
