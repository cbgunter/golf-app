// Parse a YYYY-MM-DD date string as local midnight (not UTC) to avoid off-by-one-day display
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}
