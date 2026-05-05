export function EnvMissing() {
  return (
    <div className="admin-surface max-w-2xl border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/80 p-8 shadow-card">
      <div className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-2xl">
          ⚙️
        </div>
        <div>
          <h2 className="text-lg font-bold text-amber-950">Chưa cấu hình Supabase</h2>
          <p className="mt-2 text-sm leading-relaxed text-amber-900/90">
            Tạo file <code className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-xs text-amber-950">admin-web/.env.local</code>{" "}
            từ <code className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-xs">.env.example</code> và điền{" "}
            <code className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
            cùng <code className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-amber-900/85">
            Sau khi deploy migration <code className="rounded bg-white/60 px-1 font-mono text-xs">019_admin_rpc_grants.sql</code>, RPC{" "}
            <code className="rounded bg-white/60 px-1 font-mono text-xs">update_user_role</code> mới gọi được từ client anon. Trang{" "}
            <strong>Điều phối &amp; chat KTV</strong> cần thêm{" "}
            <code className="rounded bg-white/60 px-1 font-mono text-xs">NEXT_PUBLIC_ADMIN_USER_ID</code> (xem{" "}
            <code className="rounded bg-white/60 px-1 font-mono text-xs">.env.example</code>) và migration{" "}
            <code className="rounded bg-white/60 px-1 font-mono text-xs">025_admin_therapist_chat_and_role.sql</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
