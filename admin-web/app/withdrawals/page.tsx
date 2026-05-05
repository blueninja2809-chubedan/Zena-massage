import { EnvMissing } from "@/components/EnvMissing";
import { fetchProfilesByIds } from "@/lib/profiles";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function WithdrawalsPage() {
  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select(
      "id, user_id, amount, bank_name, account_number, account_holder, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="admin-surface border-rose-200 bg-rose-50/80 p-6 text-rose-800">
        {error.message}
      </div>
    );
  }

  const wrRows = data ?? [];
  const userIds = [...new Set(wrRows.map((w) => w.user_id).filter(Boolean).map(String))];
  const profileMap = await fetchProfilesByIds(supabase, userIds);

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Duyệt rút tiền</h1>
        <p className="admin-page-sub">
          Yêu cầu mới nhất; tên người từ <span className="font-medium">profiles</span> (theo user_id).
        </p>
      </header>
      <div className="admin-table-wrap">
        <table className="admin-table min-w-[900px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Người rút</th>
              <th className="px-4 py-3 font-medium">Số tiền</th>
              <th className="px-4 py-3 font-medium">Ngân hàng</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Ngày</th>
            </tr>
          </thead>
          <tbody>
            {wrRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="admin-td py-10 text-center text-slate-500">
                  Chưa có yêu cầu
                </td>
              </tr>
            ) : (
              wrRows.map((row) => {
                const prof = row.user_id ? profileMap.get(String(row.user_id)) : undefined;
                return (
                <tr key={row.id}>
                  <td className="admin-td font-mono text-xs text-slate-500">
                    {String(row.id).slice(0, 8)}…
                  </td>
                  <td className="admin-td text-slate-800">
                    <div className="font-medium text-slate-900">
                      {prof?.display_name?.trim() || "—"}
                    </div>
                    {prof?.phone_number && (
                      <div className="text-xs text-slate-500">{prof.phone_number}</div>
                    )}
                    {row.user_id && (
                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {String(row.user_id).slice(0, 8)}…
                      </div>
                    )}
                  </td>
                  <td className="admin-td font-semibold text-slate-900">
                    {row.amount.toLocaleString("vi-VN")} ₫
                  </td>
                  <td className="admin-td text-slate-600">{row.bank_name}</td>
                  <td className="admin-td">
                    <span className="admin-badge-amber">{row.status}</span>
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
