/** ISO 时间 → YYYYMMDD */
export function isoToUploadDate(iso: string): string | undefined {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
