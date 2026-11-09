import { describe, it, expect } from 'vitest';
import { formatDate, formatDateShort, monthLabel, timeAgo, yearOf } from '../../src/lib/date';

const NOW = new Date('2026-11-09T12:00:00Z');
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const MIN = 60;
const HOUR = 3600;
const DAY = 24 * HOUR;

describe('timeAgo (now được truyền vào)', () => {
  it('dưới 1 phút là "vừa xong" (cả hai chiều)', () => {
    expect(timeAgo(NOW, NOW)).toBe('vừa xong');
    expect(timeAgo(ago(59), NOW)).toBe('vừa xong');
    expect(timeAgo(ago(-30), NOW)).toBe('vừa xong');
  });

  it('phút', () => {
    expect(timeAgo(ago(MIN), NOW)).toBe('1 phút trước');
    expect(timeAgo(ago(5 * MIN), NOW)).toBe('5 phút trước');
    expect(timeAgo(ago(45 * MIN), NOW)).toBe('45 phút trước');
  });

  it('giờ', () => {
    expect(timeAgo(ago(HOUR), NOW)).toBe('1 giờ trước');
    expect(timeAgo(ago(3 * HOUR), NOW)).toBe('3 giờ trước');
    expect(timeAgo(ago(23 * HOUR), NOW)).toBe('23 giờ trước');
  });

  it('hôm qua (so không phân biệt hoa/thường — xem test casing bên dưới)', () => {
    expect(timeAgo(ago(DAY), NOW).toLocaleLowerCase('vi')).toBe('hôm qua');
    expect(timeAgo(ago(30 * HOUR), NOW).toLocaleLowerCase('vi')).toBe('hôm qua');
  });

  // CLDR trả "Hôm qua" viết hoa; timeAgo hạ chữ cái đầu để dùng được giữa câu ("· cập nhật hôm qua").
  it('hôm qua viết thường để dùng được giữa câu', () => {
    expect(timeAgo(ago(DAY), NOW)).toBe('hôm qua');
  });

  it('không làm tròn lên đơn vị kế tiếp (59 phút 50 giây ≠ "60 phút")', () => {
    expect(timeAgo(ago(59 * MIN + 50), NOW)).toBe('59 phút trước');
    expect(timeAgo(ago(23 * HOUR + 50 * MIN), NOW)).toBe('23 giờ trước');
  });

  it('ngày', () => {
    expect(timeAgo(ago(3 * DAY), NOW)).toBe('3 ngày trước');
  });

  it('tuần', () => {
    expect(timeAgo(ago(7 * DAY), NOW)).toBe('tuần trước');
    expect(timeAgo(ago(8 * DAY), NOW)).toBe('tuần trước');
    expect(timeAgo(ago(14 * DAY), NOW)).toBe('2 tuần trước');
    expect(timeAgo(ago(21 * DAY), NOW)).toBe('3 tuần trước');
  });

  it('tháng và năm', () => {
    expect(timeAgo(ago(60 * DAY), NOW)).toBe('2 tháng trước');
    expect(timeAgo(ago(400 * DAY), NOW)).toBe('năm ngoái');
    expect(timeAgo(ago(3 * 365 * DAY), NOW)).toBe('3 năm trước');
  });

  it('dùng thời điểm hiện tại khi không truyền now', () => {
    expect(timeAgo(new Date())).toBe('vừa xong');
  });
});

describe('formatDate / formatDateShort — luôn theo giờ Việt Nam (UTC+7)', () => {
  // 16:59 UTC ngày 8 = 23:59 giờ VN ngày 8; 17:00 UTC ngày 8 = 00:00 giờ VN ngày 9.
  const beforeMidnightVN = new Date('2026-11-08T16:59:59Z');
  const afterMidnightVN = new Date('2026-11-08T17:00:00Z');

  it('qua ranh giới nửa đêm UTC+7 (khi UTC vẫn là ngày hôm trước)', () => {
    expect(formatDate(beforeMidnightVN)).toBe('8 tháng 11, 2026');
    expect(formatDate(afterMidnightVN)).toBe('9 tháng 11, 2026');
  });

  it('dạng ngắn dd/mm/yyyy', () => {
    expect(formatDateShort(beforeMidnightVN)).toBe('08/11/2026');
    expect(formatDateShort(afterMidnightVN)).toBe('09/11/2026');
  });

  it('ngày chỉ có ngày tháng trong frontmatter (UTC 00:00) vẫn giữ đúng ngày ở VN', () => {
    // `pubDate: 2026-11-01` → 2026-11-01T00:00:00Z = 07:00 sáng giờ VN cùng ngày.
    expect(formatDate(new Date('2026-11-01'))).toBe('1 tháng 11, 2026');
  });

  it('năm và tháng cũng đổi theo giờ VN ở giao thừa', () => {
    const newYearVN = new Date('2025-12-31T17:30:00Z'); // 00:30 ngày 1/1/2026 giờ VN
    expect(yearOf(newYearVN)).toBe(2026);
    // Nhãn nhóm ở trang Lưu trữ — đứng đầu dòng nên viết hoa là đúng.
    expect(monthLabel(newYearVN)).toBe('Tháng 1');
    expect(formatDateShort(newYearVN)).toBe('01/01/2026');
  });
});
