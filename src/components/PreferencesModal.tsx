import { useEffect, useMemo, useState } from 'react';
import {
  DATE_FORMAT_OPTIONS,
  DEFAULT_SETTINGS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  isValidProtectionPassword,
  type AppSettings,
  type FontFamily,
  type FontSize,
  type SearchHistoryLimit,
  type SearchHistoryMode,
  type Theme,
} from '../settings';
import { SUPPORTED_HIGHLIGHT_LANGS } from '../utils/highlight';
import PinInput from './PinInput';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

type CategoryKey = 'general' | 'codeBlock' | 'protection';

interface Category {
  key: CategoryKey;
  label: string;
}

const CATEGORIES: Category[] = [
  { key: 'general', label: '基本' },
  { key: 'codeBlock', label: 'コードブロック' },
  { key: 'protection', label: 'セキュリティ' },
];

export default function PreferencesModal({
  open,
  onClose,
  settings,
  onChange,
}: Props) {
  const [active, setActive] = useState<CategoryKey>('general');

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal__backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--prefs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="preferences-title" className="modal__title">設定</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="prefs">
          <nav className="prefs__nav" aria-label="設定カテゴリ">
            <ul>
              {CATEGORIES.map((cat) => (
                <li key={cat.key}>
                  <button
                    type="button"
                    className={`prefs__nav-item ${active === cat.key ? 'is-active' : ''}`}
                    onClick={() => setActive(cat.key)}
                    aria-current={active === cat.key ? 'page' : undefined}
                  >
                    {cat.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="prefs__panel">
            {active === 'general' && (
              <GeneralPanel settings={settings} onChange={onChange} />
            )}
            {active === 'codeBlock' && (
              <CodeBlockPanel settings={settings} onChange={onChange} />
            )}
            {active === 'protection' && (
              <ProtectionPanel settings={settings} onChange={onChange} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ----- 基本 (General) パネル -----

interface PanelProps {
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}

function GeneralPanel({ settings, onChange }: PanelProps) {
  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">基本</h3>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label">テーマ</label>
          <p className="prefs__field-desc">
            UI 全体の配色を切り替えます。ダーク（黒背景）またはライト（白背景）から選択できます。
          </p>
        </div>
        <ThemeSegment
          value={settings.theme}
          onChange={(v) => onChange('theme', v)}
        />
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-font-family">
            メイン画面のフォント
          </label>
          <p className="prefs__field-desc">
            ノート本文（エディタ・プレビュー）の表示に使うフォントを選択します。
            コードブロックは常に等幅です。
          </p>
        </div>
        <select
          id="prefs-font-family"
          className="prefs__select"
          value={settings.fontFamily}
          onChange={(e) => onChange('fontFamily', e.target.value as FontFamily)}
        >
          {FONT_FAMILY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-font-size">
            メイン画面のフォントサイズ
          </label>
          <p className="prefs__field-desc">
            ノート本文の文字サイズです。エディタとプレビューの両方に適用されます。
          </p>
        </div>
        <select
          id="prefs-font-size"
          className="prefs__select"
          value={String(settings.fontSize)}
          onChange={(e) => onChange('fontSize', Number(e.target.value) as FontSize)}
        >
          {FONT_SIZE_OPTIONS.map((s) => (
            <option key={s} value={String(s)}>
              {s} px
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label
            className="prefs__field-label"
            htmlFor="prefs-sidebar-font-family"
          >
            サイドメニューのフォント
          </label>
          <p className="prefs__field-desc">
            サイドバー（ファイル一覧・検索結果・タグ一覧）の表示に使うフォントです。
          </p>
        </div>
        <select
          id="prefs-sidebar-font-family"
          className="prefs__select"
          value={settings.sidebarFontFamily}
          onChange={(e) =>
            onChange('sidebarFontFamily', e.target.value as FontFamily)
          }
        >
          {FONT_FAMILY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label
            className="prefs__field-label"
            htmlFor="prefs-sidebar-font-size"
          >
            サイドメニューのフォントサイズ
          </label>
          <p className="prefs__field-desc">
            サイドバー内のファイル名・検索結果・タグ名の文字サイズです。
          </p>
        </div>
        <select
          id="prefs-sidebar-font-size"
          className="prefs__select"
          value={String(settings.sidebarFontSize)}
          onChange={(e) =>
            onChange('sidebarFontSize', Number(e.target.value) as FontSize)
          }
        >
          {FONT_SIZE_OPTIONS.map((s) => (
            <option key={s} value={String(s)}>
              {s} px
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-date-format">
            日付フォーマット
          </label>
          <p className="prefs__field-desc">
            編集ツールバーの日付挿入ボタンが使うフォーマットです。
          </p>
        </div>
        <select
          id="prefs-date-format"
          className="prefs__select"
          value={settings.dateFormat}
          onChange={(e) => onChange('dateFormat', e.target.value)}
        >
          {DATE_FORMAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label">編集ボタンの表示</label>
          <p className="prefs__field-desc">
            編集画面の上部に、見出し（H1/H2/H3）や太字・斜体・リストなどのマークダウン挿入ボタンを表示します。
            オフにすると編集ツールバー全体が非表示になります。
          </p>
        </div>
        <ToggleSwitch
          checked={settings.showInsertButtons}
          onChange={(v) => onChange('showInsertButtons', v)}
          ariaLabel="編集ボタンの表示"
        />
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-history-mode">
            検索履歴の保存
          </label>
          <p className="prefs__field-desc">
            検索キーワードの履歴をアプリ再起動後も残すかどうかを選択します。
          </p>
        </div>
        <select
          id="prefs-history-mode"
          className="prefs__select"
          value={settings.searchHistoryMode}
          onChange={(e) =>
            onChange('searchHistoryMode', e.target.value as SearchHistoryMode)
          }
        >
          <option value="reset">アプリ再起動でリセット</option>
          <option value="persist">アプリ再起動後も保持</option>
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-history-limit">
            検索履歴の件数
          </label>
          <p className="prefs__field-desc">
            保持する検索キーワードの最大件数。古い履歴から自動的に削除されます。
          </p>
        </div>
        <select
          id="prefs-history-limit"
          className="prefs__select"
          value={String(settings.searchHistoryLimit)}
          onChange={(e) =>
            onChange(
              'searchHistoryLimit',
              Number(e.target.value) as SearchHistoryLimit,
            )
          }
        >
          <option value="100">100 件</option>
          <option value="1000">1000 件</option>
        </select>
      </div>
    </div>
  );
}

// ----- コードブロックパネル -----

function CodeBlockPanel({ settings, onChange }: PanelProps) {
  const enabledSet = useMemo(
    () => new Set(settings.enabledHighlightLangs),
    [settings.enabledHighlightLangs],
  );

  const toggleLang = (id: string) => {
    const next = enabledSet.has(id)
      ? settings.enabledHighlightLangs.filter((x) => x !== id)
      : [...settings.enabledHighlightLangs, id];
    onChange('enabledHighlightLangs', next);
  };

  const enableAll = () => {
    onChange(
      'enabledHighlightLangs',
      SUPPORTED_HIGHLIGHT_LANGS.map((l) => l.id),
    );
  };

  const disableAll = () => {
    onChange('enabledHighlightLangs', []);
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">コードブロック</h3>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label">コピーボタンを常に表示</label>
          <p className="prefs__field-desc">
            プレビュー画面のコードブロック右上にあるコピーボタンを常に表示します。
            オフのときはコードブロックにマウスを乗せたときだけ表示されます。
          </p>
        </div>
        <ToggleSwitch
          checked={settings.codeCopyAlwaysVisible}
          onChange={(v) => onChange('codeCopyAlwaysVisible', v)}
          ariaLabel="コピーボタンを常に表示"
        />
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label">行番号を表示</label>
          <p className="prefs__field-desc">
            プレビュー画面のコードブロックの左側に行番号を表示します。
          </p>
        </div>
        <ToggleSwitch
          checked={settings.codeShowLineNumbers}
          onChange={(v) => onChange('codeShowLineNumbers', v)}
          ariaLabel="行番号を表示"
        />
      </div>

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label">シンタックスハイライト</label>
          <p className="prefs__field-desc">
            プレビュー画面でハイライトを適用する言語を選択します。
            無効にした言語のコードブロックはプレーンに表示されます。
          </p>
          <div className="prefs__inline" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="prefs__save-btn prefs__save-btn--ghost"
              onClick={enableAll}
            >
              全て有効
            </button>
            <button
              type="button"
              className="prefs__save-btn prefs__save-btn--ghost"
              onClick={disableAll}
            >
              全て無効
            </button>
          </div>
        </div>
        <table className="hl-lang-table" aria-label="ハイライト言語">
          <thead>
            <tr>
              <th scope="col">言語</th>
              <th scope="col" className="hl-lang-table__toggle-col">
                有効
              </th>
            </tr>
          </thead>
          <tbody>
            {SUPPORTED_HIGHLIGHT_LANGS.map((lang) => {
              const on = enabledSet.has(lang.id);
              return (
                <tr key={lang.id}>
                  <td>{lang.label}</td>
                  <td className="hl-lang-table__toggle-col">
                    <ToggleSwitch
                      checked={on}
                      onChange={() => toggleLang(lang.id)}
                      ariaLabel={`${lang.label} のシンタックスハイライト`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- セキュリティパネル（旧パスワード + 新パスワード） -----

function ProtectionPanel({ settings, onChange }: PanelProps) {
  const [oldDraft, setOldDraft] = useState<string>('');
  const [newDraft, setNewDraft] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  const handleSave = () => {
    // 旧パスワード照合
    if (oldDraft !== settings.protectionPassword) {
      setMessage({ type: 'error', text: '現在のパスワードが正しくありません' });
      return;
    }
    // 新パスワードの形式チェック
    if (!isValidProtectionPassword(newDraft)) {
      setMessage({
        type: 'error',
        text: '新しいパスワードは4桁の数字で入力してください',
      });
      return;
    }
    // 同じ値はスキップ
    if (newDraft === settings.protectionPassword) {
      setMessage({
        type: 'error',
        text: '新しいパスワードは現在と異なる値にしてください',
      });
      return;
    }
    onChange('protectionPassword', newDraft);
    setOldDraft('');
    setNewDraft('');
    setMessage({ type: 'ok', text: 'パスワードを更新しました' });
  };

  // 現在の保存済みパスワードが既定値のままなら初期パスワードの案内を表示
  const isDefaultPassword =
    settings.protectionPassword === DEFAULT_SETTINGS.protectionPassword;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">セキュリティ</h3>

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label">パスワード</label>
          <p className="prefs__field-desc">
            保護されたノートを編集モードで開く時、シークレットノートを表示する時、
            および保護解除する時に要求される 4桁の数字パスワードです。
            変更するには現在のパスワードと新しいパスワードを入力してください。
          </p>
          {isDefaultPassword ? (
            <p className="prefs__field-hint">
              初期パスワード: <code>1234</code>
            </p>
          ) : (
            <p className="prefs__field-hint prefs__field-hint--set">
              現在パスワードが設定されています
            </p>
          )}
        </div>

        <div className="prefs__password-form">
          <div className="prefs__password-row">
            <label
              className="prefs__password-label"
              htmlFor="protection-old-password"
            >
              現在のパスワード
            </label>
            <PinInput
              id="protection-old-password"
              value={oldDraft}
              onChange={(v) => {
                setOldDraft(v);
                setMessage(null);
              }}
              onEnter={handleSave}
              ariaLabel="現在のパスワード"
            />
          </div>
          <div className="prefs__password-row">
            <label
              className="prefs__password-label"
              htmlFor="protection-new-password"
            >
              新しいパスワード
            </label>
            <PinInput
              id="protection-new-password"
              value={newDraft}
              onChange={(v) => {
                setNewDraft(v);
                setMessage(null);
              }}
              onEnter={handleSave}
              ariaLabel="新しいパスワード"
            />
          </div>
          <div className="prefs__password-actions">
            <button
              type="button"
              className="prefs__save-btn"
              onClick={handleSave}
            >
              更新
            </button>
          </div>
        </div>

        {message && (
          <p
            className={`prefs__message ${message.type === 'error' ? 'is-error' : 'is-ok'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

// ----- テーマ選択（セグメント） -----

interface ThemeSegmentProps {
  value: Theme;
  onChange: (next: Theme) => void;
}

function ThemeSegment({ value, onChange }: ThemeSegmentProps) {
  return (
    <div
      className="theme-seg"
      role="radiogroup"
      aria-label="テーマ"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === 'dark'}
        className={`theme-seg__btn ${value === 'dark' ? 'is-active' : ''}`}
        onClick={() => onChange('dark')}
      >
        <span className="theme-seg__swatch theme-seg__swatch--dark" />
        ダーク
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === 'light'}
        className={`theme-seg__btn ${value === 'light' ? 'is-active' : ''}`}
        onClick={() => onChange('light')}
      >
        <span className="theme-seg__swatch theme-seg__swatch--light" />
        ライト
      </button>
    </div>
  );
}

// ----- トグルスイッチ -----

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}

function ToggleSwitch({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      className={`toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
