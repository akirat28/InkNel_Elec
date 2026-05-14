/**
 * カレンダープラグイン。
 *
 * 有効化するとアクティビティバーにカレンダーアイコンを追加し、
 * クリックでサイドバーに当年当月のカレンダーを表示する。
 * 日付をタップすると、設定の "ノートタイトル(フォルダ)" 配下に
 * "日付の書式" でフォーマットされたタイトルのノートを作成、または
 * 既存があれば開く。
 *
 * このプラグインは UI 拡張型のため renderFence / renderInPreview は
 * 実装しない（manifest と SettingsComponent だけを公開）。
 * App.tsx / Sidebar.tsx / ActivityBar.tsx 側で
 * `enabledPlugins.includes('calendar')` を判定して UI を出し分けする。
 */

import {
  CALENDAR_TITLE_FORMAT_OPTIONS,
  DEFAULT_CALENDAR_PLUGIN_SETTINGS,
} from '../settings';
import type { PluginModule, PluginSettingsProps } from './types';

export const manifest: PluginModule['manifest'] = {
  id: 'calendar',
  label: 'カレンダー',
  description:
    'アクティビティバーにカレンダーアイコンを追加。日付をタップするとそのコマ用のノートを作成・開きます。',
};

/**
 * カレンダープラグインの個別設定 UI。
 * PluginsPanel が各プラグイン行に「設定 UI 提供あり」を検出してインライン描画する。
 */
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
            // 空欄で離れたら既定値に戻す（フォルダ名は空にできない）
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

// PluginModule.SettingsComponent として公開
export const SettingsComponent = CalendarSettings;
