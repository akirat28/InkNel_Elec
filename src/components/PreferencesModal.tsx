import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  isValidProtectionPassword,
  type AppSettings,
  type SearchHistoryLimit,
  type SearchHistoryMode,
  type Theme,
} from '../settings';
import { SUPPORTED_HIGHLIGHT_LANGS } from '../utils/highlight';

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
  { key: 'protection', label: '保護' },
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

// ----- 保護パネル -----

function ProtectionPanel({ settings, onChange }: PanelProps) {
  const [draft, setDraft] = useState<string>(settings.protectionPassword);
  const [message, setMessage] = useState<{ type: 'error' | 'ok'; text: string } | null>(
    null,
  );

  // 外部で設定が更新された場合に追従
  useEffect(() => {
    setDraft(settings.protectionPassword);
  }, [settings.protectionPassword]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 数字以外を除去して最大4桁
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setDraft(v);
    setMessage(null);
  };

  const handleSave = () => {
    if (!isValidProtectionPassword(draft)) {
      setMessage({ type: 'error', text: 'パスワードは4桁の数字で入力してください' });
      return;
    }
    if (draft === settings.protectionPassword) {
      setMessage({ type: 'ok', text: '変更はありません' });
      return;
    }
    onChange('protectionPassword', draft);
    setMessage({ type: 'ok', text: 'パスワードを更新しました' });
  };

  // 現在の保存済みパスワードが既定値のままなら初期パスワードの案内を表示
  const isDefaultPassword =
    settings.protectionPassword === DEFAULT_SETTINGS.protectionPassword;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">保護</h3>

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="protection-password">
            パスワード
          </label>
          <p className="prefs__field-desc">
            保護されたノートを編集モードで開くときに要求されるパスワードです。
            4桁の数字で設定してください。
          </p>
          {isDefaultPassword && (
            <p className="prefs__field-hint">
              初期パスワード: <code>1234</code>
            </p>
          )}
        </div>
        <div className="prefs__inline">
          <input
            id="protection-password"
            className="prefs__text-input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={draft}
            placeholder="••••"
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
            }}
          />
          <button type="button" className="prefs__save-btn" onClick={handleSave}>
            保存
          </button>
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
