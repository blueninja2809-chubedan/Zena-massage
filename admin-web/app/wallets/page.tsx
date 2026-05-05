"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type WalletRow = {
  id: string;
  user_id: string;
  balance: number;
  updated_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  role: string;
};

export default function WalletsPage() {
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createSupabaseClient();
    const { data: walletData, error: walletError } = await supabase
      .from("wallets")
      .select("id, user_id, balance, updated_at")
      .order("balance", { ascending: false });

    if (walletError) {
      setError(walletError.message);
      setLoading(false);
      return;
    }

    const rows = (walletData ?? []) as WalletRow[];
    setWallets(rows);

    const ids = rows.map((x) => x.user_id);
    if (ids.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, display_name, phone_number, role")
        .in("id", ids);
      const map: Record<string, ProfileRow> = {};
      for (const p of (profileData ?? []) as ProfileRow[]) map[p.id] = p;
      setProfiles(map);
    } else {
      setProfiles({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const key = query.trim().toLowerCase();
    if (!key) return wallets;
    return wallets.filter((row) => {
      const p = profiles[row.user_id];
      return (
        row.user_id.toLowerCase().includes(key) ||
        (p?.display_name ?? "").toLowerCase().includes(key) ||
        (p?.phone_number ?? "").toLowerCase().includes(key)
      );
    });
  }, [wallets, profiles, query]);

  const total = useMemo(
    () => wallets.reduce((sum, item) => sum + Number(item.balance ?? 0), 0),
    [wallets],
  );

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header className="admin-page-header mb-0">
          <h1 className="admin-page-title">Ví người dùng</h1>
          <p className="admin-page-sub">Số dư tài khoản, tìm nhanh theo tên hoặc SĐT.</p>
        </header>
        <button type="button" onClick={() => void load()} className="admin-btn-secondary shrink-0 self-start sm:self-end">
          Làm mới
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Tổng số ví</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{wallets.length}</p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Tổng số dư</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">
            {total.toLocaleString("vi-VN")} đ
          </p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Kết quả tìm</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{filtered.length}</p>
        </div>
      </div>

      <div className="admin-surface-elevated p-4 sm:p-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên, SĐT, user id..."
          className="admin-input"
        />
      </div>

      {error ? (
        <div className="admin-surface border-rose-200 bg-rose-50/80 p-4 text-rose-800">{error}</div>
      ) : null}

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[780px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">SĐT</th>
              <th className="px-4 py-3 font-medium">Vai trò</th>
              <th className="px-4 py-3 font-medium">Số dư</th>
              <th className="px-4 py-3 font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="admin-td py-8 text-slate-500" colSpan={5}>
                  Đang tải...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="admin-td py-8 text-slate-500" colSpan={5}>
                  Không có dữ liệu ví
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const p = profiles[row.user_id];
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{p?.display_name || "N/A"}</p>
                      <p className="font-mono text-xs text-slate-500">{row.user_id}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{p?.phone_number || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{p?.role || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">
                      {Number(row.balance).toLocaleString("vi-VN")} đ
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(row.updated_at).toLocaleString("vi-VN")}
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
