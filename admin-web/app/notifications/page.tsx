"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type NotificationRow = {
  id: string;
  user_id: string;
  is_read: boolean;
  payload: Record<string, unknown>;
  created_at: string;
};

export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [userCount, setUserCount] = useState(0);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("promotion");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createSupabaseClient();
    const [{ data: list }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id, user_id, is_read, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(60),
      supabase.from("profiles").select("*", { count: "exact", head: true }),
    ]);
    setRows((list ?? []) as NotificationRow[]);
    setUserCount(count ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = useMemo(() => rows.filter((x) => !x.is_read).length, [rows]);
  const userIds = useMemo(() => [...new Set(rows.map((x) => x.user_id))].length, [rows]);

  async function sendAll() {
    if (!title.trim() || !message.trim()) {
      setStatus("Vui lòng nhập tiêu đề và nội dung.");
      return;
    }
    setBusy(true);
    setStatus("Đang gửi thông báo...");

    const supabase = createSupabaseClient();
    const { data: users, error: userErr } = await supabase.from("profiles").select("id");
    if (userErr) {
      setStatus(userErr.message);
      setBusy(false);
      return;
    }
    const now = new Date().toISOString();
    const ids = (users ?? []).map((u) => String(u.id));
    const batchSize = 200;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const payload = batch.map((id) => ({
        user_id: id,
        is_read: false,
        payload: {
          userId: id,
          title,
          titleEn: title,
          message,
          messageEn: message,
          type,
          createdAt: now,
        },
        created_at: now,
        updated_at: now,
      }));
      const { error: insertErr } = await supabase.from("notifications").insert(payload);
      if (insertErr) {
        setStatus(`Lỗi gửi batch: ${insertErr.message}`);
        setBusy(false);
        return;
      }
    }

    setStatus(`Đã gửi thông báo tới ${ids.length} users.`);
    setBusy(false);
    setTitle("");
    setMessage("");
    await load();
  }

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Thông báo</h1>
        <p className="admin-page-sub">Gửi thông báo hàng loạt tới toàn bộ người dùng (trong app).</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Tổng thông báo</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{rows.length}</p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">Chưa đọc</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-rose-600">{unread}</p>
        </div>
        <div className="admin-surface-elevated p-5">
          <p className="text-sm font-medium text-slate-500">User (mẫu / tổng)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{userIds || userCount}</p>
        </div>
      </div>

      <div className="admin-surface-elevated p-5 sm:p-6">
        <p className="text-base font-bold text-slate-900">Gửi thông báo mới</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề"
            className="admin-input"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="admin-input"
          >
            <option value="promotion">Khuyến mãi</option>
            <option value="booking">Đặt lịch</option>
            <option value="review">Đánh giá</option>
            <option value="job">Việc mới</option>
            <option value="system">Hệ thống</option>
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void sendAll()}
            className="admin-btn-primary disabled:opacity-60"
          >
            {busy ? "Đang gửi..." : "Gửi tới tất cả users"}
          </button>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Nội dung thông báo..."
          rows={4}
          className="admin-input mt-3 resize-y"
        />
        {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
      </div>

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[780px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">Loại</th>
              <th className="px-4 py-3 font-medium">Tiêu đề</th>
              <th className="px-4 py-3 font-medium">Nội dung</th>
              <th className="px-4 py-3 font-medium">User ID</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="px-4 py-3 font-medium">Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-rose-50/30">
                <td className="px-4 py-3 text-slate-600">{String(row.payload?.type ?? "—")}</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  {String(row.payload?.title ?? "")}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {String(row.payload?.message ?? "")}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {String(row.user_id).slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-slate-600">{row.is_read ? "Đã đọc" : "Chưa đọc"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {new Date(row.created_at).toLocaleString("vi-VN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
