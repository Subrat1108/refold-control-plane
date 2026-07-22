// Numeric, part-wise semver comparison so 3.10.0 > 3.9.0 (not string compare).
// Returns -1 if a < b, 0 if equal, 1 if a > b. Missing parts count as 0.
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

export function isUpgradeAvailable(current: string, latest: string): boolean {
  return compareSemver(latest, current) > 0
}
