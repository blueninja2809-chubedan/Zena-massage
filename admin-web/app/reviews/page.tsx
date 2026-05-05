"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReviewPayload = {
  bookingId?: string;
  therapistId?: string;
  therapistName?: string;
  customerPhone?: string;
  customerName?: string;
  rating?: number;
  comment?: string;
  service?: string;
  createdAt?: string;
};

type ReviewRow = {
  id: string;
  user_id: string | null;
  therapist_id: string | null;
  service_id: string | null;
  payload: ReviewPayload;
  created_at: string;
};

function payloadFromRow(raw: Record<string, unknown>): ReviewPayload {
  const p = raw.payload;
  if (!p || typeof p !== "object") return {};
  return p as ReviewPayload;
}

export default function ReviewsPage() {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editComment, setEditComment] = useState("");

  const [createForm, setCreateForm] = useState({
    therapist_id: "",
    therapist_name: "",
    customer_name: "",
    customer_phone: "",
    service: "",
    booking_id: "",
    rating: 5,
    comment: "",
    user_id: "",
  });

  const load = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("reviews")
      .select("id, user_id, therapist_id, service_id, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      setStatus(error.message);
      setRows([]);
      return;
    }
    const mapped = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      user_id: r.user_id != null ? String(r.user_id) : null,
      therapist_id: r.therapist_id != null ? String(r.therapist_id) : null,
      service_id: r.service_id != null ? String(r.service_id) : null,
      payload: payloadFromRow(r),
      created_at: String(r.created_at ?? ""),
    }));
    setRows(mapped);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const avgRating = useMemo(() => {
    const nums = rows.map((r) => Number(r.payload?.rating ?? 0)).filter((n) => n > 0);
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }, [rows]);

  async function deleteReview(id: string) {
    if (!confirm("Xóa đánh giá này? Thao tác không hoàn tác.")) return;
    setBusy(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) setStatus(error.message);
    else {
      setStatus("Đã xóa.");
      setEditingId(null);
      await load();
    }
    setBusy(false);
  }

  function startEdit(row: ReviewRow) {
    setEditingId(row.id);
    setEditRating(Math.min(5, Math.max(1, Number(row.payload?.rating) || 5)));
    setEditComment(String(row.payload?.comment ?? ""));
  }

  async function saveEdit(row: ReviewRow) {
    setBusy(true);
    const supabase = createSupabaseClient();
    const nextPayload: ReviewPayload = {
      ...row.payload,
      rating: editRating,
      comment: editComment.trim(),
    };
    const { error } = await supabase
      .from("reviews")
      .update({
        payload: nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) setStatus(error.message);
    else {
      setStatus("Đã cập nhật đánh giá.");
      setEditingId(null);
      await load();
    }
    setBusy(false);
  }

  async function createManual() {
    const tid = createForm.therapist_id.trim();
    const tname = createForm.therapist_name.trim();
    const comment = createForm.comment.trim();
    if (!tid || !tname || !comment) {
      setStatus("Nhập ít nhất: ID KTV, tên KTV và nội dung đánh giá.");
      return;
    }
    setBusy(true);
    const supabase = createSupabaseClient();
    const bookingId =
      createForm.booking_id.trim() ||
      `admin_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const uid = createForm.user_id.trim() || "admin_manual";
    const payload: ReviewPayload = {
      bookingId,
      therapistId: tid,
      therapistName: tname,
      customerPhone: createForm.customer_phone.trim(),
      customerName: createForm.customer_name.trim() || "—",
      rating: Math.min(5, Math.max(1, Number(createForm.rating) || 5)),
      comment,
      service: createForm.service.trim() || "(admin)",
      createdAt: new Date().toISOString(),
    };
    const { error } = await supabase.from("reviews").insert({
      user_id: uid,
      therapist_id: tid,
      service_id: createForm.service.trim() || "admin",
      payload,
    });
    if (error) setStatus(error.message);
    else {
      setStatus("Đã thêm đánh giá.");
      setCreateForm({
        therapist_id: "",
        therapist_name: "",
        customer_name: "",
        customer_phone: "",
        service: "",
        booking_id: "",
        rating: 5,
        comment: "",
        user_id: "",
      });
      await load();
    }
    setBusy(false);
  }

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <header className="admin-page-header">
        <h1 className="admin-page-title">Đánh giá dịch vụ</h1>
        <p className="admin-page-sub">
          Dữ liệu trong <span className="font-medium">reviews.payload</span> (giống app). Xem / sửa / xóa / thêm thủ
          công — cần biết{" "}
          <span className="font-medium">therapist_id</span> (UUID trong bảng therapists hoặc profiles).
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <span>
          Tổng: <strong className="text-slate-900">{rows.length}</strong> đánh giá
        </span>
        {avgRating != null ? (
          <span>
            Điểm TB (payload): <strong className="text-slate-900">{avgRating.toFixed(2)}</strong> ★
          </span>
        ) : null}
      </div>

      <div className="admin-surface-elevated p-5 sm:p-6">
        <p className="text-base font-bold text-slate-900">Thêm đánh giá (thủ công)</p>
        <p className="mt-1 text-sm text-slate-600">
          Dùng khi cần nhập hộ hoặc nhập từ CSKH — không gắn cập nhật booking trừ khi bạn tự sửa booking trong Supabase.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            value={createForm.therapist_id}
            onChange={(e) => setCreateForm((s) => ({ ...s, therapist_id: e.target.value }))}
            placeholder="therapist_id (UUID)"
            className="admin-input font-mono text-sm"
          />
          <input
            value={createForm.therapist_name}
            onChange={(e) => setCreateForm((s) => ({ ...s, therapist_name: e.target.value }))}
            placeholder="Tên KTV hiển thị"
            className="admin-input"
          />
          <input
            type="number"
            min={1}
            max={5}
            value={createForm.rating}
            onChange={(e) =>
              setCreateForm((s) => ({ ...s, rating: Number(e.target.value) }))
            }
            placeholder="Sao 1–5"
            className="admin-input"
          />
          <input
            value={createForm.customer_name}
            onChange={(e) => setCreateForm((s) => ({ ...s, customer_name: e.target.value }))}
            placeholder="Tên khách (tuỳ chọn)"
            className="admin-input"
          />
          <input
            value={createForm.customer_phone}
            onChange={(e) => setCreateForm((s) => ({ ...s, customer_phone: e.target.value }))}
            placeholder="SĐT khách (tuỳ chọn)"
            className="admin-input"
          />
          <input
            value={createForm.service}
            onChange={(e) => setCreateForm((s) => ({ ...s, service: e.target.value }))}
            placeholder="Tên dịch vụ"
            className="admin-input"
          />
          <input
            value={createForm.booking_id}
            onChange={(e) => setCreateForm((s) => ({ ...s, booking_id: e.target.value }))}
            placeholder="booking_id gốc (tuỳ chọn)"
            className="admin-input font-mono text-sm md:col-span-2"
          />
          <input
            value={createForm.user_id}
            onChange={(e) => setCreateForm((s) => ({ ...s, user_id: e.target.value }))}
            placeholder="user_id (UUID khách, tuỳ chọn)"
            className="admin-input font-mono text-sm md:col-span-3"
          />
        </div>
        <textarea
          value={createForm.comment}
          onChange={(e) => setCreateForm((s) => ({ ...s, comment: e.target.value }))}
          placeholder="Nội dung đánh giá..."
          rows={3}
          className="admin-input mt-3 resize-y"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void createManual()}
          className="admin-btn-primary mt-3 disabled:opacity-60"
        >
          {busy ? "Đang lưu..." : "Thêm đánh giá"}
        </button>
      </div>

      {status ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700">{status}</p>
      ) : null}

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[980px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">Thời gian</th>
              <th className="px-4 py-3 font-medium">KTV</th>
              <th className="px-4 py-3 font-medium">Khách</th>
              <th className="px-4 py-3 font-medium">★</th>
              <th className="px-4 py-3 font-medium">Nội dung</th>
              <th className="px-4 py-3 font-medium">Booking</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="admin-td py-10 text-center text-slate-500">
                  Chưa có đánh giá
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const p = row.payload || {};
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="align-top hover:bg-rose-50/30">
                    <td className="admin-td text-xs text-slate-500">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString("vi-VN")
                        : "—"}
                    </td>
                    <td className="admin-td">
                      <div className="font-medium text-slate-800">{p.therapistName || "—"}</div>
                      <div className="font-mono text-[11px] text-slate-400">{row.therapist_id || p.therapistId}</div>
                    </td>
                    <td className="admin-td text-sm text-slate-700">
                      <div>{p.customerName || "—"}</div>
                      <div className="text-xs text-slate-500">{p.customerPhone}</div>
                    </td>
                    <td className="admin-td">
                      {isEditing ? (
                        <select
                          value={editRating}
                          onChange={(e) => setEditRating(Number(e.target.value))}
                          className="admin-input py-1 text-sm"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-semibold text-amber-600">{p.rating ?? "—"}</span>
                      )}
                    </td>
                    <td className="admin-td max-w-[280px]">
                      {isEditing ? (
                        <textarea
                          value={editComment}
                          onChange={(e) => setEditComment(e.target.value)}
                          rows={3}
                          className="admin-input w-full resize-y text-sm"
                        />
                      ) : (
                        <p className="text-sm leading-snug text-slate-700">{p.comment || "—"}</p>
                      )}
                    </td>
                    <td className="admin-td font-mono text-[11px] text-slate-500">
                      {(p.bookingId || "").slice(0, 10)}
                      {(p.bookingId || "").length > 10 ? "…" : ""}
                    </td>
                    <td className="admin-td whitespace-nowrap">
                      {isEditing ? (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void saveEdit(row)}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                          >
                            Huỷ
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteReview(row.id)}
                            className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 disabled:opacity-60"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-slate-500">
        <strong>Cách test luồng trên app:</strong> đăng nhập khách → đặt lịch → trong admin hoặc app KTV đặt trạng thái
        booking <code className="rounded bg-slate-100 px-1">completed</code> → mở tab Lịch sử → lọc Hoàn thành → bấm{" "}
        <strong>Đánh giá</strong>. Sau khi gửi, app ghi <code className="rounded bg-slate-100 px-1">reviews</code> và đánh
        dấu booking đã review trong payload.
      </p>
    </div>
  );
}
