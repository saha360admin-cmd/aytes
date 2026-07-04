// SLA hesaplamaları — sadece client-side görsel uyarı, otomatik escalation yok.
const SLA_TARGET_MINUTES: Record<string, number> = {
  high: 30,
  medium: 240,
  low: 240,
};

export function isSlaBreached(severity: string, createdAt: string): boolean {
  const target = SLA_TARGET_MINUTES[severity] ?? SLA_TARGET_MINUTES.high; // bilinmeyen/critical → en sıkı eşik
  const elapsedMinutes = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return elapsedMinutes > target;
}
