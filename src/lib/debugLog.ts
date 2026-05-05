/**
 * Verbose logs for local debugging. Set EXPO_PUBLIC_DEBUG_LOGS=1 in `.env` and reload Metro.
 * No-op in production builds unless you explicitly set the env var in EAS secrets (not recommended).
 */
export function debugLog(scope: string, ...args: unknown[]): void {
  const on =
    process.env.EXPO_PUBLIC_DEBUG_LOGS === '1' || process.env.EXPO_PUBLIC_DEBUG_LOGS === 'true';
  if (!on) return;
  console.log(`[debug:${scope}]`, ...args);
}
