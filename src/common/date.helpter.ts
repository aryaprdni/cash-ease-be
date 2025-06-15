export function normalizeMonth(input: string): string {
  const monthMap: Record<string, string> = {
    januari: 'January',
    febuari: 'February',
    februari: 'February',
    maret: 'March',
    april: 'April',
    mei: 'May',
    juni: 'June',
    juli: 'July',
    agustus: 'August',
    september: 'September',
    oktober: 'October',
    nopember: 'November',
    november: 'November',
    desember: 'December',
  };

  let normalized = input.toLowerCase();

  for (const [indo, eng] of Object.entries(monthMap)) {
    if (normalized.includes(indo)) {
      normalized = normalized.replace(indo, eng);
    }
  }

  return normalized;
}
