"use client";

import { EnvMissing } from "@/components/EnvMissing";
import { createSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TherapistRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  working_city: string | null;
};

type ChatMessageRow = {
  id: string;
  room_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  created_at: string;
};

type OpenThread = {
  therapistId: string;
  therapistName: string;
  roomId: string | null;
  messages: ChatMessageRow[];
  loading: boolean;
  error: string | null;
};

/** Chuẩn hoá lỗi Postgres constraint khi DB chưa cho phép sender_role = admin. */
function friendlyChatSendError(raw: string): string {
  const m = raw.trim();
  if (
    m.includes("chat_messages_sender_role_check") ||
    (m.includes("sender_role") && m.includes("check constraint"))
  ) {
    return (
      "Cơ sở dữ liệu chưa cho phép vai trò «admin» trong bảng chat. Mở Supabase → SQL Editor và chạy migration " +
      "038 (hoặc script supabase/sql/fix_chat_messages_allow_admin_sender_role.sql), sau đó thử gửi lại."
    );
  }
  return m;
}

function getAdminFromEnv(): { id: string; name: string } | null {
  const id = process.env.NEXT_PUBLIC_ADMIN_USER_ID?.trim();
  if (!id) return null;
  return {
    id,
    name: process.env.NEXT_PUBLIC_ADMIN_DISPLAY_NAME?.trim() || "Admin",
  };
}

export default function CoordinationPage() {
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [q, setQ] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [openThreads, setOpenThreads] = useState<OpenThread[]>([]);
  const [activeTherapistId, setActiveTherapistId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const openThreadsRef = useRef<OpenThread[]>([]);
  useEffect(() => {
    openThreadsRef.current = openThreads;
  }, [openThreads]);

  const admin = useMemo(() => getAdminFromEnv(), []);

  const loadTherapists = useCallback(async () => {
    if (!hasSupabaseEnv()) return;
    setLoadingList(true);
    setListError(null);
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, phone_number, working_city")
      .eq("role", "therapist")
      .order("display_name", { ascending: true });
    if (error) {
      setListError(error.message);
      setTherapists([]);
    } else {
      setTherapists((data ?? []) as TherapistRow[]);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    void loadTherapists();
  }, [loadTherapists]);

  const filteredTherapists = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return therapists;
    return therapists.filter((t) => {
      const name = (t.display_name ?? "").toLowerCase();
      const phone = (t.phone_number ?? "").toLowerCase();
      const city = (t.working_city ?? "").toLowerCase();
      return name.includes(s) || phone.includes(s) || city.includes(s);
    });
  }, [therapists, q]);

  const ensureRoom = useCallback(
    async (therapistId: string, therapistName: string): Promise<string> => {
      if (!admin) throw new Error("Chưa cấu hình NEXT_PUBLIC_ADMIN_USER_ID");
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.rpc("admin_get_or_create_therapist_chat_room", {
        p_admin_id: admin.id,
        p_admin_name: admin.name,
        p_therapist_id: therapistId,
        p_therapist_name: therapistName,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Không tạo được phòng chat");
      return data as string;
    },
    [admin],
  );

  const loadMessages = useCallback(async (roomId: string) => {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, room_id, sender_id, sender_role, content, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ChatMessageRow[];
  }, []);

  const openChat = useCallback(
    async (t: TherapistRow) => {
      if (!admin) return;
      const name = t.display_name?.trim() || "KTV";
      if (openThreadsRef.current.some((o) => o.therapistId === t.id)) {
        setActiveTherapistId(t.id);
        return;
      }
      setOpenThreads((prev) => {
        if (prev.some((o) => o.therapistId === t.id)) {
          return prev;
        }
        return [
          ...prev,
          {
            therapistId: t.id,
            therapistName: name,
            roomId: null,
            messages: [],
            loading: true,
            error: null,
          },
        ];
      });
      setActiveTherapistId(t.id);
      try {
        const roomId = await ensureRoom(t.id, name);
        const messages = await loadMessages(roomId);
        setOpenThreads((prev) =>
          prev.map((o) =>
            o.therapistId === t.id
              ? { ...o, roomId, messages, loading: false, error: null }
              : o,
          ),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setOpenThreads((prev) =>
          prev.map((o) =>
            o.therapistId === t.id
              ? { ...o, loading: false, error: msg }
              : o,
          ),
        );
      }
    },
    [admin, ensureRoom, loadMessages],
  );

  const closeThread = (therapistId: string) => {
    setOpenThreads((prev) => {
      const next = prev.filter((o) => o.therapistId !== therapistId);
      if (activeTherapistId === therapistId) {
        setActiveTherapistId(next.length ? next[next.length - 1]!.therapistId : null);
      }
      return next;
    });
  };

  const subscribedRoomIds = useMemo(
    () =>
      [...new Set(openThreads.map((o) => o.roomId).filter((id): id is string => Boolean(id)))].sort().join(
        ",",
      ),
    [openThreads],
  );

  // Realtime: subscribe when room set changes (not on every new message)
  useEffect(() => {
    if (!hasSupabaseEnv() || !admin) return;
    const supabase = createSupabaseClient();
    for (const ch of channelsRef.current) {
      void supabase.removeChannel(ch);
    }
    channelsRef.current = [];
    const roomIds = subscribedRoomIds
      ? subscribedRoomIds.split(",").filter((id) => id.length > 0)
      : [];
    for (const roomId of roomIds) {
      const channel = supabase
        .channel(`admin-chat-${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            const row = payload.new as ChatMessageRow;
            setOpenThreads((prev) =>
              prev.map((o) => {
                if (o.roomId !== roomId) return o;
                if (o.messages.some((m) => m.id === row.id)) return o;
                return { ...o, messages: [...o.messages, row] };
              }),
            );
          },
        )
        .subscribe();
      channelsRef.current.push(channel);
    }
    return () => {
      for (const ch of channelsRef.current) {
        void supabase.removeChannel(ch);
      }
      channelsRef.current = [];
    };
  }, [subscribedRoomIds, admin]);

  const active = openThreads.find((o) => o.therapistId === activeTherapistId) ?? null;

  const sendMessage = async () => {
    if (!admin || !active?.roomId || !draft.trim() || sendBusy) return;
    setSendError(null);
    setSendBusy(true);
    const supabase = createSupabaseClient();
    const { error } = await supabase.rpc("send_chat_message", {
      p_room_id: active.roomId,
      p_sender_id: admin.id,
      p_sender_role: "admin",
      p_content: draft.trim(),
      p_message_type: "text",
    });
    if (error) {
      setSendError(friendlyChatSendError(error.message));
    } else {
      setDraft("");
    }
    setSendBusy(false);
  };

  useEffect(() => {
    setSendError(null);
  }, [activeTherapistId]);

  useEffect(() => {
    if (!listScrollRef.current || !active?.messages.length) return;
    listScrollRef.current.scrollTop = listScrollRef.current.scrollHeight;
  }, [active?.messages.length, activeTherapistId]);

  if (!hasSupabaseEnv()) {
    return <EnvMissing />;
  }

  if (!admin) {
    return (
      <div className="space-y-4">
        <header className="admin-page-header">
          <h1 className="admin-page-title">Điều phối &amp; chat KTV</h1>
          <p className="admin-page-sub">Cấu hình tài khoản admin để bắt đầu trò chuyện.</p>
        </header>
        <div className="admin-surface border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/90 p-5 text-amber-950">
          <p className="text-sm leading-relaxed">
            Thêm vào <code className="rounded bg-white/90 px-1.5 font-mono text-xs">admin-web/.env.local</code>:{" "}
            <code className="rounded bg-white/90 px-1.5 font-mono text-xs">NEXT_PUBLIC_ADMIN_USER_ID</code> (UUID
            tài khoản admin trong bảng <code className="rounded bg-white/90 px-1.5 font-mono text-xs">profiles</code>
            ) và tùy chọn <code className="rounded bg-white/90 px-1.5 font-mono text-xs">NEXT_PUBLIC_ADMIN_DISPLAY_NAME</code>
            . Có thể copy từ <code className="rounded bg-white/90 px-1.5 font-mono text-xs">admin-web/.env.example</code> rồi sửa URL/key. Trên Supabase cần đã chạy migration{" "}
            <code className="rounded bg-white/90 px-1.5 font-mono text-xs">025</code> hoặc{" "}
            <code className="rounded bg-white/90 px-1.5 font-mono text-xs">037</code> (RPC{" "}
            <code className="rounded bg-white/90 px-1.5 font-mono text-xs">admin_get_or_create_therapist_chat_room</code>
            ); kiểm tra bằng file <code className="rounded bg-white/90 px-1.5 font-mono text-xs">supabase/sql/verify_admin_chat_migrations.sql</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-6 lg:min-h-[calc(100vh-5rem)] lg:flex-row">
      <div className="lg:w-80 lg:shrink-0">
        <header className="admin-page-header mb-4 lg:mb-0">
          <h1 className="admin-page-title">Điều phối &amp; chat</h1>
          <p className="admin-page-sub">
            Mở nhiều tab để trao đổi cùng lúc với nhiều kỹ thuật viên (lịch, hỗ trợ, điều phối).
          </p>
        </header>
        <input
          type="search"
          placeholder="Tìm KTV (tên, SĐT, thành phố)…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="admin-input mt-2 lg:mt-4"
        />
        <div className="mt-3 max-h-[50vh] overflow-auto admin-surface lg:max-h-[calc(100vh-16rem)]">
          {loadingList ? (
            <p className="p-4 text-sm text-slate-500">Đang tải danh sách KTV…</p>
          ) : listError ? (
            <p className="p-4 text-sm text-rose-600">{listError}</p>
          ) : filteredTherapists.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Không có KTV nào</p>
          ) : (
            <ul>
              {filteredTherapists.map((t) => (
                <li
                  key={t.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <button
                    type="button"
                    onClick={() => void openChat(t)}
                    className="w-full px-4 py-3 text-left text-sm transition hover:bg-rose-50/80"
                  >
                    <span className="block font-semibold text-slate-900">{t.display_name || "—"}</span>
                    <span className="text-xs text-slate-500">
                      {t.phone_number || "—"} · {t.working_city || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="admin-surface-elevated flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden">
        {openThreads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="text-3xl" aria-hidden>
              💬
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-slate-500">
              Chọn kỹ thuật viên bên trái để mở cuộc trò chuyện. Có thể mở nhiều tab cùng lúc.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/80 p-2">
              {openThreads.map((o) => {
                const isActive = o.therapistId === activeTherapistId;
                return (
                  <div
                    key={o.therapistId}
                    className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1.5 pl-3 text-xs shadow-sm ${
                      isActive
                        ? "border-rose-300 bg-white text-rose-900 ring-1 ring-rose-200/80"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    <button
                      type="button"
                      className="max-w-[140px] truncate font-semibold"
                      onClick={() => setActiveTherapistId(o.therapistId)}
                    >
                      {o.therapistName}
                      {o.loading ? " …" : o.error ? " (!)" : ""}
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Đóng"
                      onClick={() => closeThread(o.therapistId)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {active ? (
              <div className="flex min-h-0 flex-1 flex-col">
                {active.error ? (
                  <div className="p-4 text-sm text-rose-600">{active.error}</div>
                ) : active.loading ? (
                  <div className="p-4 text-sm text-slate-500">Đang mở phòng chat…</div>
                ) : (
                  <>
                    <div
                      ref={listScrollRef}
                      className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50/50 p-4"
                    >
                      {active.messages.length === 0 ? (
                        <p className="pt-4 text-center text-sm text-slate-500">
                          Chưa có tin nhắn — gửi lời chào để điều phối.
                        </p>
                      ) : (
                        active.messages.map((m) => {
                          const mine = m.sender_id === admin.id;
                          return (
                            <div
                              key={m.id}
                              className={`flex ${mine ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                  mine
                                    ? "bg-gradient-to-br from-rose-600 to-rose-500 text-white"
                                    : "border border-slate-200 bg-white text-slate-800"
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{m.content}</p>
                                <p
                                  className={`mt-1.5 text-[10px] ${mine ? "text-rose-100" : "text-slate-400"}`}
                                >
                                  {m.sender_role === "admin"
                                    ? "Admin"
                                    : m.sender_role === "therapist"
                                      ? "KTV"
                                      : m.sender_role}
                                  {" · "}
                                  {new Date(m.created_at).toLocaleString("vi-VN")}
                                </p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="border-t border-slate-100 bg-white p-4">
                      {sendError ? (
                        <p className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                          {sendError}
                        </p>
                      ) : null}
                      <div className="flex gap-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void sendMessage();
                            }
                          }}
                          rows={2}
                          placeholder="Nhập tin nhắn (Enter gửi, Shift+Enter xuống dòng)…"
                          className="admin-input min-h-[44px] flex-1 resize-y"
                        />
                        <button
                          type="button"
                          disabled={sendBusy || !draft.trim() || !active.roomId}
                          onClick={() => void sendMessage()}
                          className="self-end admin-btn-primary px-5 disabled:opacity-50"
                        >
                          Gửi
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
