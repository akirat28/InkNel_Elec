/**
 * 日本の国民の祝日を計算するユーティリティ。
 *
 * 対応:
 *   - 固定日祝日(元日、建国記念の日、天皇誕生日、昭和の日、憲法記念日、
 *     みどりの日、こどもの日、山の日、文化の日、勤労感謝の日)
 *   - ハッピーマンデー(成人の日、海の日、敬老の日、スポーツの日)
 *   - 春分の日 / 秋分の日(国立天文台公式の近似式)
 *   - 振替休日(祝日が日曜の翌平日)
 *
 * 2024 年以降の現行法体系を前提に実装している。
 */

/** 1 月 = 0、12 月 = 11 の Date 規約 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function ymdKey(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

/**
 * 指定月の n 番目の指定曜日の日(1-based の n)。
 * weekday: 0=Sun .. 6=Sat
 */
function nthWeekday(
  year: number,
  monthIndex0: number,
  weekday: number,
  n: number,
): number {
  const firstWeekday = new Date(year, monthIndex0, 1).getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  return 1 + offset + 7 * (n - 1);
}

/** 春分の日(国立天文台が暦要項で公表する数値の近似式: 1980-2099 で有効) */
function vernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}
/** 秋分の日(同上、1980-2099) */
function autumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 指定年の祝日マップを生成する。キーは 'YYYY-MM-DD'、値は祝日名。
 * 振替休日も自動的に含む。
 */
export function getJapaneseHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>();
  const add = (m0: number, d: number, name: string) => {
    out.set(ymdKey(year, m0, d), name);
  };

  // ---- 固定日 ----
  add(0, 1, '元日');
  add(1, 11, '建国記念の日');
  add(1, 23, '天皇誕生日');
  add(3, 29, '昭和の日');
  add(4, 3, '憲法記念日');
  add(4, 4, 'みどりの日');
  add(4, 5, 'こどもの日');
  add(7, 11, '山の日');
  add(10, 3, '文化の日');
  add(10, 23, '勤労感謝の日');

  // ---- ハッピーマンデー (月曜日) ----
  add(0, nthWeekday(year, 0, 1, 2), '成人の日');
  add(6, nthWeekday(year, 6, 1, 3), '海の日');
  add(8, nthWeekday(year, 8, 1, 3), '敬老の日');
  add(9, nthWeekday(year, 9, 1, 2), 'スポーツの日');

  // ---- 春分の日 / 秋分の日 ----
  add(2, vernalEquinoxDay(year), '春分の日');
  add(8, autumnalEquinoxDay(year), '秋分の日');

  // ---- 振替休日 ----
  // 祝日が日曜の場合、その後の最初の平日(さらに祝日なら次へ)が振替休日。
  const keys = Array.from(out.keys()).sort();
  for (const k of keys) {
    const d = new Date(k);
    if (d.getDay() !== 0) continue; // 日曜のみ
    // 翌日から、平日かつ祝日でない日まで進む
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    while (
      out.has(ymdKey(next.getFullYear(), next.getMonth(), next.getDate()))
    ) {
      next.setDate(next.getDate() + 1);
    }
    out.set(
      ymdKey(next.getFullYear(), next.getMonth(), next.getDate()),
      '振替休日',
    );
  }

  return out;
}
