/** Loose match for Vietnamese province/city labels (GPS vs profile vs picker). */
export function cityLooseMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) {
    return false;
  }
  return na.includes(nb) || nb.includes(na);
}
