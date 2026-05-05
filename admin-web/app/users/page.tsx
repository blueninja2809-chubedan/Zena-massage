"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProfileRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
  role: string;
  partner_application_status: string | null;
  is_vip_member: boolean | null;
  vip_expires_at: string | null;
  working_city: string | null;
  selected_city: string | null;
  created_at: string;
};

function roleLabel(role: string) {
  if (role === "therapist") return "Kỹ thuật viên";
  if (role === "admin") return "Quản trị";
  return "Khách hàng";
}

export default function UsersPage() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "customer" | "therapist" | "admin">("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ProfileRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabaseEnv()) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseClient();
    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, phone_number, email, role, partner_application_status, is_vip_member, vip_expires_at, working_city, selected_city, created_at",
      )
      .order("created_at", { ascending: false });
    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as ProfileRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "customer") list = list.filter((r) => r.role === "customer");
    if (filter === "therapist") list = list.filter((r) => r.role === "therapist");
    if (filter === "admin") list = list.filter((r) => r.role === "admin");
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((r) => {
      const name = (r.display_name ?? "").toLowerCase();
      const phone = (r.phone_number ?? "").toLowerCase();
      const email = (r.email ?? "").toLowerCase();
      return name.includes(s) || phone.includes(s) || email.includes(s);
    });
  }, [rows, filter, q]);

  async function changeRole(
    userId: string,
    role: "customer" | "therapist" | "admin",
  ) {
    if (role === "admin") {
      const ok = window.confirm(
        "Bạn chắc chắn cấp quyền Quản trị cho tài khoản này? Họ sẽ có quyền tương tự tài khoản admin (xử lý cẩn thận).",
      );
      if (!ok) return;
    }
    setBusy(true);
    setActionError(null);
    const supabase = createSupabaseClient();
    const { error: rpcErr } = await supabase.rpc("update_user_role", {
      p_user_id: userId,
      p_role: role,
    });
    setBusy(false);
    if (rpcErr) {
      setActionError(rpcErr.message);
      return;
    }
    setSelected((prev) =>
      prev && prev.id === userId ? { ...prev, role } : prev,
    );
    await load();
  }

  async function grantVipMonth(userId: string) {
    setBusy(true);
    setActionError(null);
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);
    const supabase = createSupabaseClient();
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        is_vip_member: true,
        vip_expires_at: expires.toISOString(),
        vip_plan_id: "admin_1month",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setBusy(false);
    if (upErr) {
      setActionError(upErr.message);
      return;
    }
    setSelected((prev) =>
      prev && prev.id === userId
        ? {
            ...prev,
            is_vip_member: true,
            vip_expires_at: expires.toISOString(),
          }
        : prev,
    );
    await load();
  }

  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Quản lý người dùng</h1>
        <p className="admin-page-sub">
          Đổi vai trò qua RPC <code className="rounded bg-slate-100 px-1 font-mono text-xs text-rose-800">update_user_role</code> (migration
          019 + 025: admin, therapist, customer).
        </p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          placeholder="Tìm theo tên, SĐT, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="admin-input max-w-md"
        />
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "Tất cả"],
              ["customer", "Khách hàng"],
              ["therapist", "Kỹ thuật viên"],
              ["admin", "Quản trị"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={filter === key ? "admin-filter-chip admin-filter-chip-active" : "admin-filter-chip"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="admin-surface border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-800">{error}</div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="admin-table min-w-[800px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">Người dùng</th>
              <th className="px-4 py-3 font-medium">SĐT</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Đối tác</th>
              <th className="px-4 py-3 font-medium">VIP</th>
              <th className="px-4 py-3 font-medium">Thành phố</th>
              <th className="px-4 py-3 font-medium">Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="admin-td py-10 text-center text-slate-500">
                  Đang tải…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="admin-td py-10 text-center text-slate-500">
                  Không có dữ liệu
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(r);
                    setActionError(null);
                  }}
                >
                  <td className="admin-td font-medium text-slate-900">{r.display_name || "—"}</td>
                  <td className="admin-td text-slate-600">{r.phone_number || "—"}</td>
                  <td className="admin-td text-slate-600">{r.email || "—"}</td>
                  <td className="admin-td text-slate-800">{roleLabel(r.role)}</td>
                  <td className="admin-td text-slate-600">{r.partner_application_status || "—"}</td>
                  <td className="admin-td">
                    {r.is_vip_member ? (
                      <span className="admin-badge-amber">Có</span>
                    ) : (
                      <span className="text-slate-400">Không</span>
                    )}
                  </td>
                  <td className="admin-td text-slate-600">{r.working_city || r.selected_city || "—"}</td>
                  <td className="admin-td text-slate-500">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("vi-VN")
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="admin-modal-overlay">
          <div
            className="absolute inset-0"
            aria-hidden
            onClick={() => !busy && setSelected(null)}
          />
          <div className="admin-modal max-h-[90vh] overflow-y-auto p-6 sm:rounded-2xl">
            <h2 className="text-lg font-bold text-slate-900">Chi tiết người dùng</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p className="text-lg font-semibold text-slate-900">{selected.display_name || "—"}</p>
              <p className="font-mono text-xs text-slate-500">{selected.id}</p>
              <p className="text-slate-600">SĐT: {selected.phone_number || "—"}</p>
              <p className="text-slate-600">Thành phố: {selected.working_city || selected.selected_city || "—"}</p>
              <p className="text-slate-500">
                Tạo:{" "}
                {selected.created_at
                  ? new Date(selected.created_at).toLocaleString("vi-VN")
                  : "—"}
              </p>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">Phân quyền</p>
              <p className="mt-2 inline-block rounded-full bg-rose-50 px-3 py-1 text-sm font-medium text-rose-800">
                {roleLabel(selected.role)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Vai trò <strong className="text-slate-700">Kỹ thuật viên</strong> đồng bộ bảng{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">therapists</code>.
              </p>
              <div className="mt-3 flex max-w-md flex-col gap-2">
                <label className="text-xs font-medium text-slate-600" htmlFor="user-role">
                  Đổi vai trò
                </label>
                <select
                  id="user-role"
                  disabled={busy}
                  className="admin-input disabled:opacity-50"
                  value={
                    selected.role === "therapist" ||
                    selected.role === "customer" ||
                    selected.role === "admin"
                      ? selected.role
                      : "customer"
                  }
                  onChange={(e) => {
                    const next = e.target.value as "customer" | "therapist" | "admin";
                    if (next === selected.role) return;
                    void changeRole(selected.id, next);
                  }}
                >
                  <option value="customer">Khách hàng</option>
                  <option value="therapist">Kỹ thuật viên</option>
                  <option value="admin">Quản trị</option>
                </select>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="text-sm font-semibold text-slate-800">Quản lý VIP</p>
              <p className="mt-2 text-sm text-slate-600">
                {selected.is_vip_member && selected.vip_expires_at
                  ? `VIP đến ${new Date(selected.vip_expires_at).toLocaleString("vi-VN")}`
                  : "Chưa có VIP"}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void grantVipMonth(selected.id)}
                className="mt-3 admin-btn-secondary w-full sm:w-auto"
              >
                Cấp VIP (1 tháng)
              </button>
            </div>

            {actionError ? (
              <p className="mt-4 text-sm text-rose-600">{actionError}</p>
            ) : null}

            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(null)}
              className="mt-6 w-full admin-btn-primary"
            >
              Đóng
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
