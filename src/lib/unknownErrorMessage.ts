/**
 * Supabase/PostgREST thường reject bằng plain object, không phải `Error` — `String(e)` → "[object Object]".
 */
export function unknownErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e != null && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.length > 0) return o.message;
    if (typeof o.error_description === 'string') return o.error_description;
    if (typeof o.details === 'string' && o.details.length > 0) return o.details;
    if (typeof o.hint === 'string' && o.hint.length > 0) return o.hint;
  }
  try {
    const s = JSON.stringify(e);
    if (s && s !== '{}') return s;
  } catch {
    /* empty */
  }
  return 'Unknown error';
}
