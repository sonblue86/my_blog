/** Date formatting in Vietnamese. Timezone is pinned so build output is stable. */

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const longFmt = new Intl.DateTimeFormat('vi-VN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const shortFmt = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

/** 9 tháng 11, 2026 */
export function formatDate(date: Date): string {
  return longFmt.format(date);
}

/** 09/11/2026 */
export function formatDateShort(date: Date): string {
  return shortFmt.format(date);
}

/** "tháng 11 năm 2026" style label used for archive grouping. */
export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat('vi-VN', { month: 'long', timeZone: TIME_ZONE }).format(date);
}

export function yearOf(date: Date): number {
  return Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: TIME_ZONE }).format(date));
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });

/** "3 ngày trước", "hôm qua", "vừa xong". `now` is injectable for tests. */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const diff = (date.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'vừa xong';
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds) {
      const label = rtf.format(Math.trunc(diff / seconds), unit);
      return label.charAt(0).toLocaleLowerCase('vi') + label.slice(1);
    }
  }
  return 'vừa xong';
}
