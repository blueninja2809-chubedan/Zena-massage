import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";

type TechnicianRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
  role: string | null;
  is_available: boolean;
};

export const dynamic = "force-dynamic";

export default async function TechniciansPage() {
  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  const supabase = createSupabaseClient();
  // Nguồn chuẩn: `profiles` (role=therapist); trạng thái sẵn sàng từ `therapists` embed.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone_number, email, role, therapists(is_available)")
    .eq("role", "therapist")
    .order("display_name", { ascending: true });

  const rows: TechnicianRow[] = (data ?? []).map((r) => {
    const t = (r as { therapists?: { is_available?: boolean } | null }).therapists;
    return {
      id: r.id,
      display_name: r.display_name,
      phone_number: r.phone_number,
      email: r.email,
      role: r.role,
      is_available: t?.is_available ?? false,
    };
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kỹ thuật viên</h1>
        <p className="text-slate-600">Danh sách từ bảng profiles (vai trò therapist).</p>
        {error && (
          <p className="text-sm text-red-600">Không tải được dữ liệu: {error.message}</p>
        )}
      </div>
      <div className="overflow-x-auto admin-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              {["Tên", "Số điện thoại", "Email", "Sẵn sàng", "ID"].map((h) => (
                <th key={h} className="admin-th">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="admin-td py-6 text-slate-500">
                  {error ? "—" : "Chưa có dữ liệu."}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="admin-td">
                    <p className="font-medium text-slate-900">{row.display_name || "—"}</p>
                    <p className="text-xs text-slate-500">{row.role || ""}</p>
                  </td>
                  <td className="admin-td text-slate-800">{row.phone_number || "—"}</td>
                  <td className="admin-td text-slate-800 break-all">{row.email || "—"}</td>
                  <td className="admin-td text-slate-800">{row.is_available ? "Có" : "Không"}</td>
                  <td className="admin-td font-mono text-xs text-slate-500">{row.id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
