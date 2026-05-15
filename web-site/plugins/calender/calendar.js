/**
 * カレンダープラグイン（配布版 / ランタイムロード対応エントリ）
 *
 * ホスト側 (`src/main.tsx`) で `window.InkNelPluginAPI` に React + 主要フックが
 * 露出されているので、ここから取り出して React コンポーネントを構築する。
 *
 * 本ファイルが export するもの:
 *   - manifest (必須)
 *   - activityBarItem (アクティビティバーへのアイコンボタン)
 *   - sidebarPanel (サイドバーパネル本体)
 *   - 補助関数群 (re-export)
 */

import { generateJapaneseHolidays } from './holidays.js';
import { generateSpecialEvents } from './calendarEvents.js';
import {
  formatDate,
  computeNotePathForDate,
  buildCalendarNoteBody,
} from './dateClickHandler.js';
import { buildCalendarGrid } from './calendarGrid.js';
import { CALENDAR_I18N, getCalendarStrings } from './i18n.js';

// 補助関数を外向きにも公開（他プラグインや開発者ツールで利用可能）
export {
  generateJapaneseHolidays,
  generateSpecialEvents,
  formatDate,
  computeNotePathForDate,
  buildCalendarNoteBody,
  buildCalendarGrid,
  CALENDAR_I18N,
  getCalendarStrings,
};

// ----- ホストから React + フックを取得 -----
// window.InkNelPluginAPI は host (`src/main.tsx`) が renderer 起動時にセット。
const { React, useState, useMemo, h, Fragment } = window.InkNelPluginAPI;

// ============================================================
// manifest
// ============================================================
export const manifest = {
  id: 'calendar',
  label: 'カレンダー',
  description:
    'アクティビティバーにカレンダーを追加し、日付タップでノートを作成・開きます。祝祭日 / イベントの色分け表示、新規ノート本文への祝日名挿入に対応。',
};

// ============================================================
// アクティビティバー用アイコン（カレンダー風 SVG）
// ============================================================
function CalendarIcon() {
  return h(
    'svg',
    {
      width: 22,
      height: 22,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
    },
    h('rect', { x: 3, y: 4, width: 18, height: 17, rx: 2 }),
    h('line', { x1: 3, y1: 9, x2: 21, y2: 9 }),
    h('line', { x1: 8, y1: 3, x2: 8, y2: 5 }),
    h('line', { x1: 16, y1: 3, x2: 16, y2: 5 }),
  );
}

export const activityBarItem = {
  mode: 'calendar',
  label: 'カレンダー',
  Icon: CalendarIcon,
};

// ============================================================
// サイドバーパネル（カレンダー UI 本体）
// ============================================================
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatYmd(year, monthIndex0, day) {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

function CalendarPanel({ notes, settings, onSelectNote, onCreateNote }) {
  const cfg = settings.calendarPlugin ?? {
    folder: 'カレンダー',
    titleFormat: 'YYYY-MM-DD',
  };
  const langCode =
    settings.language && settings.language !== 'auto' ? settings.language : 'ja';
  const i18n = getCalendarStrings(langCode);

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [pendingCreate, setPendingCreate] = useState(null);

  const grid = useMemo(
    () =>
      buildCalendarGrid({
        year,
        month,
        notes,
        baseFolder: cfg.folder,
        titleFormat: cfg.titleFormat,
        todayRef: today,
      }),
    [year, month, notes, cfg.folder, cfg.titleFormat, today],
  );

  const goPrev = () => {
    setMonth((m) => (m === 0 ? (setYear((y) => y - 1), 11) : m - 1));
  };
  const goNext = () => {
    setMonth((m) => (m === 11 ? (setYear((y) => y + 1), 0) : m + 1));
  };
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const handleCellClick = (cell) => {
    if (!cell.day || !cell.ymd || !cell.date) return;
    const info = {
      holidayName: cell.holidayName,
      eventName: cell.eventName,
    };
    if (cell.hasNote) {
      // 既存ノートを開く
      const { folder, title } = computeNotePathForDate(
        cell.date,
        cfg.folder,
        cfg.titleFormat,
      );
      const existing = notes.find(
        (n) => n.folder === folder && n.title === title,
      );
      if (existing) onSelectNote(existing.id);
      return;
    }
    setPendingCreate({ date: cell.date, ymd: cell.ymd, info });
  };

  const confirmCreate = async () => {
    if (!pendingCreate) return;
    const { date, ymd, info } = pendingCreate;
    setPendingCreate(null);
    const { folder, title } = computeNotePathForDate(
      date,
      cfg.folder,
      cfg.titleFormat,
    );
    const body = buildCalendarNoteBody(ymd, info);
    await onCreateNote({ title, folder, body });
  };
  const cancelCreate = () => setPendingCreate(null);

  const yearMonthTitle = `${year}年 ${pad2(month + 1)}月`;

  return h(
    'div',
    { className: 'calendar-panel' },
    h(
      'header',
      { className: 'calendar-panel__header' },
      h(
        'button',
        {
          type: 'button',
          className: 'calendar-panel__nav',
          onClick: goPrev,
          title: i18n.prevMonth,
          'aria-label': i18n.prevMonth,
        },
        '◀',
      ),
      h(
        'div',
        { className: 'calendar-panel__title' },
        yearMonthTitle,
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'calendar-panel__nav',
          onClick: goNext,
          title: i18n.nextMonth,
          'aria-label': i18n.nextMonth,
        },
        '▶',
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'calendar-panel__today',
          onClick: goToday,
          title: i18n.todayTooltip,
        },
        i18n.today,
      ),
    ),
    h(
      'div',
      { className: 'calendar-panel__weekrow', 'aria-hidden': true },
      ...i18n.weekdays.map((w, i) =>
        h(
          'span',
          {
            key: `${w}-${i}`,
            className:
              'calendar-panel__weekday ' +
              (i === 0
                ? 'calendar-panel__weekday--sun'
                : i === 6
                  ? 'calendar-panel__weekday--sat'
                  : ''),
          },
          w,
        ),
      ),
    ),
    h(
      'div',
      { className: 'calendar-panel__grid', role: 'grid' },
      ...grid.map((cell, idx) => {
        if (!cell.day || !cell.ymd || !cell.date) {
          return h('div', {
            key: idx,
            className: 'calendar-panel__cell-empty',
          });
        }
        const weekday = idx % 7;
        const isSun = weekday === 0;
        const isSat = weekday === 6;
        const parts = [];
        if (cell.holidayName)
          parts.push(`${i18n.holidayPrefix}: ${cell.holidayName}`);
        if (cell.eventName)
          parts.push(`${i18n.eventPrefix}: ${cell.eventName}`);
        const dayInfo = parts.length > 0 ? ` (${parts.join(' / ')})` : '';
        const tmpl = cell.hasNote
          ? i18n.tooltipOpenExisting
          : i18n.tooltipCreate;
        const title = tmpl
          .replace('{{date}}', cell.ymd)
          .replace('{{info}}', dayInfo);
        return h(
          'button',
          {
            key: idx,
            type: 'button',
            className:
              'calendar-panel__day ' +
              (cell.isToday ? 'is-today ' : '') +
              (isSun ? 'is-sun ' : '') +
              (isSat ? 'is-sat ' : '') +
              (cell.holidayName ? 'is-holiday ' : '') +
              (cell.hasNote ? 'has-note ' : ''),
            onClick: () => handleCellClick(cell),
            title,
          },
          h('span', { className: 'calendar-panel__day-num' }, cell.day),
          cell.hasNote
            ? h('span', {
                className: 'calendar-panel__day-dot',
                'aria-label': i18n.hasNoteLabel,
              })
            : null,
        );
      }),
    ),
    pendingCreate
      ? h(
          'div',
          {
            className: 'calendar-panel__create-confirm',
            role: 'dialog',
            'aria-live': 'polite',
          },
          h(
            'span',
            { className: 'calendar-panel__create-confirm-text' },
            i18n.confirmCreateText
              .replace(
                '{{date}}',
                `${pendingCreate.date.getMonth() + 1}/${pendingCreate.date.getDate()}`,
              )
              .replace(
                '{{info}}',
                pendingCreate.info.holidayName
                  ? ` (${pendingCreate.info.holidayName})`
                  : pendingCreate.info.eventName
                    ? ` (${pendingCreate.info.eventName})`
                    : '',
              ),
          ),
          h(
            'div',
            { className: 'calendar-panel__create-confirm-actions' },
            h(
              'button',
              {
                type: 'button',
                className:
                  'calendar-panel__create-confirm-btn calendar-panel__create-confirm-btn--ok',
                onClick: confirmCreate,
              },
              'OK',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'calendar-panel__create-confirm-btn',
                onClick: cancelCreate,
              },
              i18n.cancel,
            ),
          ),
        )
      : null,
  );
}

export const sidebarPanel = {
  mode: 'calendar',
  Component: CalendarPanel,
};
