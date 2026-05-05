import type { SupabaseClient } from "@supabase/supabase-js";

/** Thông tin hiển thị từ bảng `profiles` (nguồn chuẩn cho user trong app). */
export type ProfileLite = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  email: string | null;
};

/**
 * Lấy map profiles theo danh sách id (UUID).
 * Dùng để gắn tên/SĐT vào booking, withdrawal, lịch… thay vì chỉ hiện raw id.
 */
export async function fetchProfilesByIds(
  supabase: SupabaseClient,
  ids: string[],
): Promise<Map<string, ProfileLite>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, ProfileLite>();
  if (unique.length === 0) {
    return map;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, phone_number, email")
    .in("id", unique);
  if (error || !data) {
    return map;
  }
  for (const row of data as ProfileLite[]) {
    map.set(row.id, row);
  }
  return map;
}
