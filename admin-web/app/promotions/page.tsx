"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useMemo, useState } from "react";

type PromotionRow = {
  id: string;
  code: string;
  description: string;
  discount_percent: number;
  max_discount_amount: number;
  min_order_amount: number;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expiry_date: string;
  created_at: string;
};

export default function PromotionsPage() {
  const [rows, setRows] = useState<PromotionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discount_percent: 10,
    max_discount_amount: 100000,
    min_order_amount: 0,
    expiry_date: "",
  });

  const load = useCallback(async () => {
    const supabase = createSupabaseClient();
    const { data } = await supabase
      .from("promotions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as PromotionRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => rows.filter((x) => x.is_active).length, [rows]);

  async function createPromotion() {
    if (!form.code.trim() || !form.description.trim() || !form.expiry_date) {
      setStatus("Nhập đầy đủ mã, mô tả, ngày hết hạn.");
      return;
    }
    setBusy(true);
    const supabase = createSupabaseClient();
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim(),
      discount_percent: Number(form.discount_percent),
      max_discount_amount: Number(form.max_discount_amount),
      min_order_amount: Number(form.min_order_amount),
      max_uses: 1,
      current_uses: 0,
      conditions: [],
      is_active: true,
      expiry_date: new Date(form.expiry_date).toISOString(),
    };
    const { error } = await supabase.from("promotions").insert(payload);
    if (error) setStatus(error.message);
    else {
      setStatus("Tạo mã khuyến mãi thành công.");
      setForm({
        code: "",
        description: "",
        discount_percent: 10,
        max_discount_amount: 100000,
        min_order_amount: 0,
        expiry_date: "",
      });
      await load();
    }
    setBusy(false);
  }

  async function toggleActive(id: string, active: boolean) {
    const supabase = createSupabaseClient();
    await supabase.from("promotions").update({ is_active: !active }).eq("id", id);
    await load();
  }

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <header className="admin-page-header mb-0">
          <h1 className="admin-page-title">Khuyến mãi</h1>
          <p className="admin-page-sub">Mỗi mã một lượt dùng — tạo nhiều mã nếu cần nhiều lượt.</p>
        </header>
        <p className="shrink-0 text-sm font-medium text-slate-500">
          Tổng: {rows.length} mã · Đang bật: {activeCount}
        </p>
      </div>

      <div className="admin-surface-elevated p-5 sm:p-6">
        <p className="text-base font-bold text-slate-900">Tạo mã mới</p>
        <p className="mt-1 text-sm text-slate-600">
          Mỗi mã chỉ dùng đúng một lần. Muốn nhiều lượt ưu đãi, hãy tạo nhiều mã (mỗi mã một lần).
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={form.code}
            onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
            placeholder="Mã (VD: ZENA03)"
            className="admin-input"
          />
          <input
            type="number"
            value={form.discount_percent}
            onChange={(e) =>
              setForm((s) => ({ ...s, discount_percent: Number(e.target.value) }))
            }
            placeholder="Giảm %"
            className="admin-input"
          />
          <input
            type="number"
            value={form.max_discount_amount}
            onChange={(e) =>
              setForm((s) => ({ ...s, max_discount_amount: Number(e.target.value) }))
            }
            placeholder="Tối đa"
            className="admin-input"
          />
          <input
            type="number"
            value={form.min_order_amount}
            onChange={(e) =>
              setForm((s) => ({ ...s, min_order_amount: Number(e.target.value) }))
            }
            placeholder="Đơn tối thiểu"
            className="admin-input"
          />
          <input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm((s) => ({ ...s, expiry_date: e.target.value }))}
            className="admin-input"
          />
          <div className="md:col-span-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void createPromotion()}
              className="admin-btn-primary w-full disabled:opacity-60"
            >
              {busy ? "Đang tạo..." : "Tạo mã mới"}
            </button>
          </div>
        </div>
        <textarea
          value={form.description}
          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          placeholder="Mô tả khuyến mãi..."
          rows={3}
          className="admin-input mt-3 resize-y"
        />
        {status ? <p className="mt-3 text-sm text-slate-600">{status}</p> : null}
      </div>

      <div className="admin-table-wrap overflow-x-auto">
        <table className="admin-table min-w-[920px]">
          <thead className="admin-thead">
            <tr>
              <th className="px-4 py-3 font-medium">Mã</th>
              <th className="px-4 py-3 font-medium">Mô tả</th>
              <th className="px-4 py-3 font-medium">Giảm</th>
              <th className="px-4 py-3 font-medium">Tối đa</th>
              <th className="px-4 py-3 font-medium">Đơn tối thiểu</th>
              <th className="px-4 py-3 font-medium">Lượt (0/1)</th>
              <th className="px-4 py-3 font-medium">Hết hạn</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-rose-50/30">
                <td className="px-4 py-3 font-semibold text-slate-800">{row.code}</td>
                <td className="px-4 py-3 text-slate-600">{row.description}</td>
                <td className="px-4 py-3 text-slate-600">{row.discount_percent}%</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.max_discount_amount.toLocaleString("vi-VN")} đ
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.min_order_amount.toLocaleString("vi-VN")} đ
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {row.current_uses >= 1 ? "Đã dùng" : "Chưa dùng"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {new Date(row.expiry_date).toLocaleDateString("vi-VN")}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void toggleActive(row.id, row.is_active)}
                    className={`rounded-full px-3 py-1 text-xs ${
                      row.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.is_active ? "Đang bật" : "Đã tắt"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
