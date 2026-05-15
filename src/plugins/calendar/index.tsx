/**
 * カレンダープラグイン。
 *
 * 有効化するとアクティビティバーにカレンダーアイコンを追加し、
 * クリックでサイドバーに当年当月のカレンダーを表示する。
 * 日付をタップすると、設定の "ノートタイトル(フォルダ)" 配下に
 * "日付の書式" でフォーマットされたタイトルのノートを作成、または
 * 既存があれば開く。書式に '/' が含まれる場合(例: YYYY/MM/DD)は
 * '/' をフォルダ階層として展開し、最後のセグメントだけがタイトルになる。
 *
 * 本プラグインは新プラグイン契約 (PluginModule) に従い、
 *   - activityBarItem: アクティビティバーへのアイコン宣言
 *   - sidebarPanel: サイドバーパネル本体
 *   - SettingsComponent: 設定画面のインライン設定 UI
 * を export してアプリ本体に対するインタフェースを完結させる。
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CALENDAR_TITLE_FORMAT_OPTIONS,
  DEFAULT_CALENDAR_PLUGIN_SETTINGS,
} from '../../settings';
import { formatDate } from '../../utils/dateFormat';
import type {
  PluginActivityBarItem,
  PluginManifest,
  PluginModule,
  PluginSettingsProps,
  PluginSidebarPanelDecl,
  PluginSidebarPanelProps,
} from '../types';
import { getJapaneseHolidays } from './holidays';
import type { NoteMeta } from '../../global';

// ============================================================
// manifest
// ============================================================
export const manifest: PluginManifest = {
  id: 'calendar',
  label: 'カレンダー',
  description:
    'アクティビティバーにカレンダーアイコンを追加。日付をタップするとそのコマ用のノートを作成・開きます。',
};

// ============================================================
// ActivityBar Icon
// ============================================================
function CalendarIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 外枠 + 上部のリング止め金具 */}
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6" />
      <line x1="16" y1="3" x2="16" y2="6" />
      {/* 日付ドット */}
      <circle cx="8" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ============================================================
// Calendar Sidebar Panel
// ============================================================
const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function formatYmd(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

function CalendarPanel({
  notes,
  settings,
  onSelectNote,
  onCreateNote,
}: PluginSidebarPanelProps) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  /**
   * 「ノート未作成の日付」がタップされたときに、誤クリックを防ぐため
   * カレンダー直下に「ノートを作成しますか?」確認バナーを表示する。
   *
   * `tags` には、その日の祝日名・同日に既存するノートのタグから自動収集した
   * 候補が入る。作成承諾時にそのままノートに付与される。
   */
  const [pendingCreate, setPendingCreate] = useState<{
    ymd: string;
    folder: string;
    title: string;
    body: string;
    tags: string[];
  } | null>(null);

  /**
   * 「ノート作成済み日付」がタップされたときの「表示しますか?」確認バナー。
   * `holiday` はその日の祝日名(なければ null)、
   * `eventTags` は対象ノート自身のタグ(イベント日表示用)。
   */
  const [pendingOpen, setPendingOpen] = useState<{
    ymd: string;
    noteId: string;
    holiday: string | null;
    eventTags: string[];
  } | null>(null);

  // 月間グリッド: 月初までの空セル + その月の日数
  const grid = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const len = new Date(year, month + 1, 0).getDate();
    const cells: Array<{
      day: number | null;
      ymd: string | null;
      date: Date | null;
    }> = [];
    for (let i = 0; i < firstWeekday; i++)
      cells.push({ day: null, ymd: null, date: null });
    for (let d = 1; d <= len; d++) {
      cells.push({
        day: d,
        ymd: formatYmd(year, month, d),
        date: new Date(year, month, d, 0, 0, 0, 0),
      });
    }
    while (cells.length % 7 !== 0)
      cells.push({ day: null, ymd: null, date: null });
    return cells;
  }, [year, month]);

  const todayYmd = useMemo(
    () => formatYmd(today.getFullYear(), today.getMonth(), today.getDate()),
    [today],
  );

  // ---- 祝日マップ（表示中の年） ----
  const holidayMap = useMemo(() => getJapaneseHolidays(year), [year]);

  // ---- イベント日(ノートがある日)の索引 ----
  // 設定の folder + titleFormat を元に、表示中の月の各日について
  // 「該当ノートがあるか」を判定する。書式に '/' を含む場合は
  // フォルダ階層化されるため、その点を考慮して title/folder 一致を取る。
  const cfg = settings.calendarPlugin ?? DEFAULT_CALENDAR_PLUGIN_SETTINGS;
  const noteByDate = useMemo(() => {
    const map = new Map<string, NoteMeta>();
    const baseFolder = cfg.folder.trim() || 'カレンダー';
    // 月のはじめ〜末まで走査(描画範囲だけで十分)
    const len = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= len; d++) {
      const date = new Date(year, month, d, 0, 0, 0, 0);
      const formatted = formatDate(date, cfg.titleFormat);
      const segments = formatted
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean);
      let folder: string;
      let title: string;
      if (segments.length >= 2) {
        title = segments[segments.length - 1];
        folder = [baseFolder, ...segments.slice(0, -1)].join('/');
      } else {
        title = formatted;
        folder = baseFolder;
      }
      const found = notes.find(
        (n) => n.folder === folder && n.title === title,
      );
      if (found) {
        map.set(formatYmd(year, month, d), found);
      }
    }
    return map;
  }, [year, month, notes, cfg.folder, cfg.titleFormat]);

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

  /**
   * 日付タップ時:
   *  - 書式適用結果に '/' が含まれていればフォルダ階層に展開し、最後のセグメントをタイトルとする
   *  - 既存ノートがあれば開く、なければ作成
   */
  const handleClickDate = (date: Date, ymd: string) => {
    const baseFolder = cfg.folder.trim() || 'カレンダー';
    const formatted = formatDate(date, cfg.titleFormat);
    const segments = formatted
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    let finalFolder: string;
    let title: string;
    if (segments.length >= 2) {
      title = segments[segments.length - 1];
      finalFolder = [baseFolder, ...segments.slice(0, -1)].join('/');
    } else {
      title = formatted;
      finalFolder = baseFolder;
    }
    const existing = notes.find(
      (n) => n.folder === finalFolder && n.title === title,
    );
    if (existing) {
      // 既存ノートは「表示しますか?」確認バナーを下部に出す
      setPendingCreate(null);
      const holidayName = holidayMap.get(ymd) ?? null;
      setPendingOpen({
        ymd,
        noteId: existing.id,
        holiday: holidayName,
        eventTags: existing.tags ?? [],
      });
      return;
    }

    // ---- タグ候補を自動収集 ----
    // 1) その日が祝日なら祝日名をタグに追加
    // 2) 同日(同じ ymd)で別フォルダ/別タイトルでも既存するノートがあれば、
    //    そのタグを「イベント日タグ」として継承(関連付けに使う)
    const tagSet = new Set<string>();
    const holidayName = holidayMap.get(ymd);
    if (holidayName) tagSet.add(holidayName);
    // 同日のノート(同フォルダの自分自身は除外)からタグ継承
    for (const n of notes) {
      if (n.folder === finalFolder && n.title === title) continue;
      // タイトルや本文に ymd を含むノートを「イベント日」候補として扱う
      // (重い検索を避けるため、ここではタイトル一致のみ)
      if (n.title.includes(ymd)) {
        for (const tg of n.tags ?? []) {
          if (tg) tagSet.add(tg);
        }
      }
    }
    const tags = Array.from(tagSet);

    // 新規作成は確認バナーを下部に出してユーザーに承諾を取る
    setPendingOpen(null);
    setPendingCreate({
      ymd,
      folder: finalFolder,
      title,
      body: `# ${ymd}\n\n`,
      tags,
    });
  };

  const handleConfirmOpen = () => {
    if (!pendingOpen) return;
    const noteId = pendingOpen.noteId;
    setPendingOpen(null);
    onSelectNote(noteId);
  };

  const handleCancelOpen = () => {
    setPendingOpen(null);
  };

  const handleConfirmCreate = () => {
    if (!pendingCreate) return;
    const p = pendingCreate;
    setPendingCreate(null);
    void onCreateNote({
      title: p.title,
      folder: p.folder,
      body: p.body,
      tags: p.tags,
    });
  };

  const handleCancelCreate = () => {
    setPendingCreate(null);
  };

  // 月を切り替えたら確認バナーは閉じる(別の月の日付確認が残ると混乱するため)
  useEffect(() => {
    setPendingCreate(null);
    setPendingOpen(null);
  }, [year, month]);

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
          const holidayName = holidayMap.get(cell.ymd) ?? null;
          const hasHoliday = !!holidayName;
          const note = noteByDate.get(cell.ymd);
          const hasNote = !!note;

          // ホバー時のツールチップ。祝日 + ノート両方あれば改行で連結。
          const tooltipLines: string[] = [cell.ymd];
          if (holidayName) tooltipLines.push(`祝日: ${holidayName}`);
          if (note) tooltipLines.push(`ノート: ${note.title || '無題'}`);
          if (!holidayName && !note) {
            tooltipLines.push('クリックでノートを作成');
          } else if (note) {
            tooltipLines.push('クリックで開く');
          }
          const tooltipText = tooltipLines.join('\n');

          return (
            <button
              key={idx}
              type="button"
              className={
                'calendar-panel__day ' +
                (isToday ? 'is-today ' : '') +
                (isSun ? 'is-sun ' : '') +
                (isSat ? 'is-sat ' : '') +
                (hasHoliday ? 'is-holiday ' : '') +
                (hasNote ? 'has-note ' : '')
              }
              onClick={() => handleClickDate(cell.date!, cell.ymd!)}
              title={tooltipText}
            >
              <span className="calendar-panel__day-num">{cell.day}</span>
              {hasNote && (
                <span
                  className="calendar-panel__day-dot"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      {pendingCreate && (
        <div
          className="calendar-panel__create-confirm"
          role="alertdialog"
          aria-live="polite"
        >
          <span className="calendar-panel__create-confirm-text">
            <strong>{pendingCreate.ymd}</strong>{' '}
            のノートを作成しますか?
            <br />
            <small>
              保存先: {pendingCreate.folder}/{pendingCreate.title}
            </small>
            {pendingCreate.tags.length > 0 && (
              <>
                <br />
                <small className="calendar-panel__create-confirm-tags">
                  付与タグ:{' '}
                  {pendingCreate.tags.map((t) => (
                    <span
                      key={t}
                      className="calendar-panel__create-confirm-tag"
                    >
                      #{t}
                    </span>
                  ))}
                </small>
              </>
            )}
          </span>
          <div className="calendar-panel__create-confirm-actions">
            <button
              type="button"
              className="calendar-panel__create-confirm-btn"
              onClick={handleCancelCreate}
              autoFocus
            >
              キャンセル
            </button>
            <button
              type="button"
              className="calendar-panel__create-confirm-btn calendar-panel__create-confirm-btn--orange"
              onClick={handleConfirmCreate}
            >
              作成
            </button>
          </div>
        </div>
      )}
      {pendingOpen &&
        (() => {
          // 「{祝祭日}・{イベント日}」の表示用文字列
          // - 祝日があれば祝日名
          // - イベント日 = ノート自身に付いているタグ(過去にカレンダー作成時に
          //   自動付与された祝日タグや、後からユーザーが付けたタグなど)
          //   ただし、祝日と重複するタグは祝日側に集約して 1 度だけ表示する。
          const labels: string[] = [];
          if (pendingOpen.holiday) labels.push(pendingOpen.holiday);
          for (const tg of pendingOpen.eventTags) {
            if (!labels.includes(tg)) labels.push(tg);
          }
          return (
            <div
              className="calendar-panel__create-confirm"
              role="alertdialog"
              aria-live="polite"
            >
              <span className="calendar-panel__create-confirm-text">
                <strong>{pendingOpen.ymd}</strong>{' '}
                のカレンダーは作成済みです、
                {labels.length > 0 && (
                  <>
                    <br />
                    <small>{labels.join('・')}</small>
                  </>
                )}
                <br />
                表示しますか?
              </span>
              <div className="calendar-panel__create-confirm-actions">
                <button
                  type="button"
                  className="calendar-panel__create-confirm-btn"
                  onClick={handleCancelOpen}
                  autoFocus
                >
                  いいえ
                </button>
                <button
                  type="button"
                  className="calendar-panel__create-confirm-btn calendar-panel__create-confirm-btn--ok"
                  onClick={handleConfirmOpen}
                >
                  はい
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

// ============================================================
// Settings (PreferencesModal のプラグインリストにインライン表示)
// ============================================================
function CalendarSettings({ settings, onChange }: PluginSettingsProps) {
  const current = settings.calendarPlugin ?? DEFAULT_CALENDAR_PLUGIN_SETTINGS;

  const updateFolder = (folder: string) => {
    onChange('calendarPlugin', { ...current, folder });
  };
  const updateTitleFormat = (titleFormat: string) => {
    onChange('calendarPlugin', { ...current, titleFormat });
  };

  return (
    <div className="plugins-panel__plugin-settings">
      <div className="plugins-panel__plugin-settings-row">
        <label
          className="plugins-panel__plugin-settings-label"
          htmlFor="plugin-cal-folder"
        >
          ノートタイトル
        </label>
        <input
          id="plugin-cal-folder"
          type="text"
          className="plugins-panel__plugin-settings-input"
          value={current.folder}
          placeholder="カレンダー"
          onChange={(e) => updateFolder(e.target.value)}
          onBlur={(e) => {
            if (!e.target.value.trim()) {
              updateFolder(DEFAULT_CALENDAR_PLUGIN_SETTINGS.folder);
            }
          }}
        />
      </div>
      <div className="plugins-panel__plugin-settings-row">
        <label
          className="plugins-panel__plugin-settings-label"
          htmlFor="plugin-cal-format"
        >
          日付の書式
        </label>
        <select
          id="plugin-cal-format"
          className="plugins-panel__plugin-settings-select"
          value={current.titleFormat}
          onChange={(e) => updateTitleFormat(e.target.value)}
        >
          {CALENDAR_TITLE_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <p className="plugins-panel__plugin-settings-hint">
        作成されるノートのパスは{' '}
        <code>{(current.folder || 'カレンダー') + '/' + current.titleFormat}</code>{' '}
        です。書式に <code>/</code> が含まれる場合 (例: <code>YYYY/MM/DD</code>)、
        その <code>/</code> はフォルダ階層として展開され、最後のセグメントだけが
        ノートのタイトルになります。
      </p>
    </div>
  );
}

// ============================================================
// PluginModule exports（registry が拾うのはここ）
// ============================================================
export const activityBarItem: PluginActivityBarItem = {
  mode: 'calendar',
  label: 'カレンダー',
  Icon: CalendarIcon,
};

export const sidebarPanel: PluginSidebarPanelDecl = {
  mode: 'calendar',
  Component: CalendarPanel,
};

export const SettingsComponent: PluginModule['SettingsComponent'] =
  CalendarSettings;
