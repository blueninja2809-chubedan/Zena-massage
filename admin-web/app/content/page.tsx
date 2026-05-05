"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

type PartnerApp = {
  id: string;
  user_id: string | null;
  phone_number: string;
  status: "pending" | "approved" | "rejected";
  image_moderation_status: "pending" | "approved" | "rejected";
  reviewed_by_admin: boolean;
  payload: Record<string, unknown>;
  created_at: string;
};

function getImageUris(payload: Record<string, unknown>): string[] {
  const raw = payload.imageUris;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

export default function ContentPage() {
  const [rows, setRows] = useState<PartnerApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createSupabaseClient();
    const { data, error: fetchError } = await supabase
      .from("partner_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (fetchError) {
      setError(fetchError.message);
      setRows([]);
    } else {
      setError(null);
      setRows((data ?? []) as PartnerApp[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateApp(app: PartnerApp, status: "approved" | "rejected") {
    if (!app.user_id) return;
    setBusyId(app.id);
    const supabase = createSupabaseClient();
    const now = new Date().toISOString();

    const { error: appError } = await supabase
      .from("partner_applications")
      .update({
        status,
        reviewed_by_admin: true,
        approved_at: status === "approved" ? now : null,
        updated_at: now,
      })
      .eq("id", app.id);

    if (!appError) {
      await supabase
        .from("profiles")
        .update({
          role: status === "approved" ? "therapist" : "customer",
          partner_application_status: status,
          partner_role_approved_at: status === "approved" ? now : null,
          updated_at: now,
        })
        .eq("id", app.user_id);
    } else {
      setError(appError.message);
    }
    await load();
    setBusyId(null);
  }

  async function updateImageStatus(appId: string, imageStatus: "approved" | "rejected") {
    setBusyId(appId);
    const supabase = createSupabaseClient();
    const { error: updateError } = await supabase
      .from("partner_applications")
      .update({
        image_moderation_status: imageStatus,
        reviewed_by_admin: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId);
    if (updateError) setError(updateError.message);
    await load();
    setBusyId(null);
  }

  if (!hasSupabaseEnv()) return <EnvMissing />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header className="admin-page-header mb-0">
          <h1 className="admin-page-title">Duyệt hồ sơ &amp; ảnh đối tác</h1>
          <p className="admin-page-sub">Partner applications và ảnh bucket partner-applications.</p>
        </header>
        <button type="button" onClick={() => void load()} className="admin-btn-secondary self-start sm:self-end">
          Làm mới
        </button>
      </div>

      {error ? (
        <div className="admin-surface border-rose-200 bg-rose-50/80 p-4 text-rose-800">{error}</div>
      ) : null}

      {loading ? (
        <div className="admin-surface-elevated p-8 text-center text-slate-500">Đang tải hồ sơ...</div>
      ) : rows.length === 0 ? (
        <div className="admin-surface-elevated p-8 text-center text-slate-500">Chưa có hồ sơ đăng ký.</div>
      ) : (
        rows.map((row) => {
          const images = getImageUris(row.payload ?? {});
          const displayName = String((row.payload?.displayName as string) ?? "Không tên");
          const city = String((row.payload?.workingCity as string) ?? "—");
          return (
            <div key={row.id} className="admin-surface-elevated p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{displayName}</p>
                  <p className="text-sm text-slate-500">
                    {row.phone_number} · {city}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {new Date(row.created_at).toLocaleString("vi-VN")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="admin-badge-slate">Hồ sơ: {row.status}</span>
                  <span className="admin-badge-slate">Ảnh: {row.image_moderation_status}</span>
                </div>
              </div>

              {images.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {images.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="partner"
                        className="h-32 w-full rounded-xl border border-slate-200 object-cover hover:opacity-90"
                      />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-400">Không có ảnh trong payload.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void updateApp(row, "approved")}
                  className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                >
                  Duyệt hồ sơ
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void updateApp(row, "rejected")}
                  className="inline-flex rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-60"
                >
                  Từ chối hồ sơ
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void updateImageStatus(row.id, "approved")}
                  className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                >
                  Duyệt ảnh
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void updateImageStatus(row.id, "rejected")}
                  className="inline-flex rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                >
                  Từ chối ảnh
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
