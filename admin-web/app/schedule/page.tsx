"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { fetchProfilesByIds } from "@/lib/profiles";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type ShiftRow = {
  user_id: string;
  display_name: string;
  shift_date: string;
  slots: string[];
  updated_at: string;
};

export default function SchedulePage() {
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseClient();
    const { data } = await supabase
      .from("therapist_shifts")
      .select("user_id, shift_date, slots, updated_at")
      .order("shift_date", { ascending: false })
      .limit(200);
    const raw = (data ?? []) as Omit<ShiftRow, "display_name">[];
    const ids = [...new Set(raw.map((r) => r.user_id).filter(Boolean))] as string[];
    const profMap = await fetchProfilesByIds(supabase, ids);
    setRows(
      raw.map((r) => ({
        ...r,
        display_name: profMap.get(String(r.user_id))?.display_name?.trim() || "—",
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.display_name ?? "").toLowerCase().includes(q) ||
        String(r.user_id).toLowerCase().includes(q),
    );
  }, [rows, query]);

  const stats = useMemo(() => {
    const therapists = new Set(filtered.map((x) => x.user_id)).size;
    const totalSlots = filtered.reduce((sum, row) => sum + (row.slots?.length ?? 0), 0);
    return { therapists, shifts: filtered.length, totalSlots };
  }, [filtered]);

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Lịch làm việc</h1>
        <p className="admin-page-sub">Lịch đăng ký ca của kỹ thuật viên, lọc nhanh theo tên.</p>
      </header>

      <div className="admin-surface-elevated p-4 sm:p-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên KTV hoặc user id..."
          className="admin-input"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">KTV có lịch</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats.therapists}</p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Tổng ca làm</p>
          <p className="mt-1 text-3xl font-bold text-slate-900">{stats.shifts}</p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Tổng slot</p>
          <p className="mt-1 text-3xl font-bold text-rose-600">{stats.totalSlots}</p>
        </div>
      </div>

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[700px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">KTV</th>
              <th className="px-4 py-3 font-medium">Ngày</th>
              <th className="px-4 py-3 font-medium">Slots</th>
              <th className="px-4 py-3 font-medium">Cập nhật</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="admin-td py-8 text-slate-500">
                  Đang tải...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-td py-8 text-slate-500">
                  Không có lịch làm việc.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={`${row.user_id}-${row.shift_date}`}>
                  <td className="admin-td">
                    <p className="font-medium text-slate-900">{row.display_name || "N/A"}</p>
                    <p className="font-mono text-xs text-slate-500">{row.user_id}</p>
                  </td>
                  <td className="admin-td text-slate-600">
                    {new Date(row.shift_date).toLocaleDateString("vi-VN")}
                  </td>
                  <td className="admin-td text-slate-800">{(row.slots ?? []).join(", ")}</td>
                  <td className="admin-td text-slate-500">
                    {new Date(row.updated_at).toLocaleString("vi-VN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
