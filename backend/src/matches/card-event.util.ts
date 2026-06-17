export type CardEventColor = 'YELLOW' | 'RED';

export function parseCardEventType(
  payload: unknown,
): CardEventColor | null {
  if (!payload || typeof payload !== 'object') {
    return 'YELLOW';
  }
  const raw = String(
    (payload as Record<string, unknown>).cardType ??
      (payload as Record<string, unknown>).color ??
      (payload as Record<string, unknown>).cardColor ??
      '',
  )
    .trim()
    .toLowerCase();
  if (
    raw.includes('red') ||
    raw.includes('крас') ||
    raw === 'r'
  ) {
    return 'RED';
  }
  if (
    !raw ||
    raw.includes('yellow') ||
    raw.includes('желт') ||
    raw === 'y'
  ) {
    return 'YELLOW';
  }
  return null;
}
