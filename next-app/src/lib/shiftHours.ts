// Vardiya kodu → saat hesabı — güvenlik biriminin gerçek bordro kuralı.
// web/guvenlik/vardiyalar/page.tsx ile aynı mantık; Raporlama sayfasının da
// aynı hesabı kullanması için paylaşılan bir yere çıkarıldı.
//
// 1/2/3 normal vardiya (8s - 30dk mola), 5/6 uzun vardiya, 7/8 gece/en uzun
// vardiya; T216 (Yıllık İzin) ve T241 (Rapor) çalışmamış ama 7,5s olarak
// sayılır, T245 (Ücretsiz İzin) hiç sayılmaz. T211 (hafta tatili) ayda 4'e
// kadar 0 saat, 5. ve sonrası 7,5s eklenir. Ay eşiği: (ay gün sayısı - 4
// hafta tatili) × 7,5 saat — 30 günlük ayda 195s, 31 günlük ayda 202,5s.

export interface ShiftTypeLike {
  code: string;
  is_day_off: boolean;
  duration_hours: number | null;
}

export const KNOWN_CODE_HOURS: Record<string, number> = {
  "1": 7.5, "2": 7.5, "3": 7.5,
  "5": 11, "6": 11,
  "7": 15, "8": 15,
  T216: 7.5,
  T241: 7.5,
  T245: 0,
};

export const WEEKLY_REST_CODE = "T211";
export const WEEKLY_REST_ALLOWANCE = 4;
export const WEEKLY_REST_EXTRA_HOURS = 7.5;

export const ANNUAL_LEAVE_CODE = "T216";
export const SICK_REPORT_CODE = "T241";
export const UNPAID_LEAVE_CODE = "T245";

export function hoursForShiftCode(code: string, shiftTypes: ShiftTypeLike[]): number {
  if (code in KNOWN_CODE_HOURS) return KNOWN_CODE_HOURS[code];
  const st = shiftTypes.find(s => s.code === code);
  if (!st) return 0;
  if (st.is_day_off) return 0;
  return st.duration_hours ?? 0;
}

export function monthlyOvertimeThreshold(daysInPeriod: number): number {
  return (daysInPeriod - 4) * 7.5;
}

export function formatHours(h: number): string {
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}

export interface PersonPeriodStats {
  personnelId: string;
  totalHours: number;
  overtimeHours: number;
  deficitHours: number;
  annualLeaveDays: number;
  unpaidLeaveDays: number;
  sickReportDays: number;
}

/**
 * `assignmentsByPerson`: personnel_id -> shift_code[] (o dönemdeki tüm atamalar).
 * `daysInPeriod`: eşik hesabı için dönemdeki gün sayısı (ör. ay gün sayısı).
 */
export function computePersonPeriodStats(
  personnelId: string,
  codes: string[],
  shiftTypes: ShiftTypeLike[],
  daysInPeriod: number
): PersonPeriodStats {
  let totalHours = 0;
  let weeklyRestCount = 0;
  let annualLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let sickReportDays = 0;

  for (const code of codes) {
    if (code === WEEKLY_REST_CODE) { weeklyRestCount++; continue; }
    if (code === ANNUAL_LEAVE_CODE) annualLeaveDays++;
    else if (code === UNPAID_LEAVE_CODE) unpaidLeaveDays++;
    else if (code === SICK_REPORT_CODE) sickReportDays++;
    totalHours += hoursForShiftCode(code, shiftTypes);
  }
  totalHours += Math.max(0, weeklyRestCount - WEEKLY_REST_ALLOWANCE) * WEEKLY_REST_EXTRA_HOURS;

  const threshold = monthlyOvertimeThreshold(daysInPeriod);
  return {
    personnelId,
    totalHours,
    overtimeHours: Math.max(0, totalHours - threshold),
    deficitHours: Math.max(0, threshold - totalHours),
    annualLeaveDays,
    unpaidLeaveDays,
    sickReportDays,
  };
}
