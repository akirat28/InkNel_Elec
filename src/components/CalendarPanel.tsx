import { useMemo, useState } from 'react';

interface Props {
  /**
   * 日付がタップされた時のコールバック。
   * - date: クリックされた日付（時刻部分はローカル 0:00 固定）
   * - ymd:  内部で計算済みの `YYYY-MM-DD` 文字列（既存ノートの存在判定用）
   * App 側でユーザー設定の書式を適用してノート作成する。
   */
  onDateClick: (date: Date, ymd: string) => void;
}

/** 月の頭出し(常に 1 日)を返す */
function firstOfMonth(year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0, 1);
}

/** 月内の日数 */
function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** YYYY-MM-DD 形式に整形 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatYmd(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * サイドバー用の月別カレンダー。
 * - 起動時は当年当月
 * - ◀ / ▶ で前後の月へ移動
 * - 「今月」ボタンで今月へ即時復帰
 * - 日付クリックで onDateClick(YYYY-MM-DD) を呼ぶ
 */
export default function CalendarPanel({ onDateClick }: Props) {
  // 当初表示は「今日が含まれる月」
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // 月のレイアウト計算: 先頭の空きセル数 + その月の日数
  // 日曜始まり (Date#getDay() の規約に従う)
  const grid = useMemo(() => {
    const start = firstOfMonth(year, month).getDay(); // 0=Sun .. 6=Sat
    const len = daysInMonth(year, month);
    const cells: Array<{
      day: number | null;
      ymd: string | null;
      date: Date | null;
    }> = [];
    for (let i = 0; i < start; i++)
      cells.push({ day: null, ymd: null, date: null });
    for (let d = 1; d <= len; d++) {
      cells.push({
        day: d,
        ymd: formatYmd(year, month, d),
        date: new Date(year, month, d, 0, 0, 0, 0),
      });
    }
    // 行を 7 セル単位に揃える（末尾埋め）
    while (cells.length % 7 !== 0)
      cells.push({ day: null, ymd: null, date: null });
    return cells;
  }, [year, month]);

  const todayYmd = useMemo(
    () =>
      formatYmd(today.getFullYear(), today.getMonth(), today.getDate()),
    [today],
  );

  const goPrev = () => {
    setMonth((m) => {
      if (m === 0) {
        setYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  };
  const goNext = () => {
    setMonth((m) => {
      if (m === 11) {
        setYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  return (
    <div className="calendar-panel">
      <header className="calendar-panel__header">
        <button
          type="button"
          className="calendar-panel__nav"
          onClick={goPrev}
          title="前の月"
          aria-label="前の月"
        >
          ◀
        </button>
        <div
          className="calendar-panel__title"
          aria-live="polite"
          aria-atomic="true"
        >
          {year}年 {pad2(month + 1)}月
        </div>
        <button
          type="button"
          className="calendar-panel__nav"
          onClick={goNext}
          title="次の月"
          aria-label="次の月"
        >
          ▶
        </button>
        <button
          type="button"
          className="calendar-panel__today"
          onClick={goToday}
          title="今月へ戻る"
        >
          今月
        </button>
      </header>
      <div className="calendar-panel__weekrow" aria-hidden="true">
        {WEEKDAY_LABELS_JA.map((w, i) => (
          <span
            key={w}
            className={
              'calendar-panel__weekday ' +
              (i === 0
                ? 'calendar-panel__weekday--sun'
                : i === 6
                  ? 'calendar-panel__weekday--sat'
                  : '')
            }
          >
            {w}
          </span>
        ))}
      </div>
      <div className="calendar-panel__grid" role="grid">
        {grid.map((cell, idx) => {
          const weekday = idx % 7;
          if (!cell.day || !cell.ymd || !cell.date) {
            return <div key={idx} className="calendar-panel__cell-empty" />;
          }
          const isToday = cell.ymd === todayYmd;
          const isSun = weekday === 0;
          const isSat = weekday === 6;
          return (
            <button
              key={idx}
              type="button"
              className={
                'calendar-panel__day ' +
                (isToday ? 'is-today ' : '') +
                (isSun ? 'is-sun ' : '') +
                (isSat ? 'is-sat ' : '')
              }
              onClick={() => onDateClick(cell.date!, cell.ymd!)}
              title={`${cell.ymd} のノートを開く`}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
