import { useEffect, useMemo, useState } from 'react';
import {
  AI_PROVIDER_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DEFAULT_SETTINGS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  isValidProtectionPassword,
  type AiProvider,
  type AiProviderSettings,
  type AppSettings,
  type FontFamily,
  type FontSize,
  type SearchHistoryLimit,
  type SearchHistoryMode,
  type Theme,
} from '../settings';
import { SUPPORTED_HIGHLIGHT_LANGS } from '../utils/highlight';
import { listPlugins } from '../plugins/registry';
import {
  importPluginById,
  unloadPluginById,
} from '../plugins/runtimeLoader';
import PinInput from './PinInput';

const CHATGPT_MODEL_OPTIONS = ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'];

interface Props {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  standalone?: boolean;
}

type CategoryKey =
  | 'general'
  | 'ai'
  | 'codeBlock'
  | 'template'
  | 'protection'
  | 'storage'
  | 'plugins'
  | 'backup'
  | 'restore'
  | 'reset';

interface Category {
  key: CategoryKey;
  label: string;
}

const CATEGORIES: Category[] = [
  { key: 'general', label: '基本' },
  { key: 'ai', label: 'AI' },
  { key: 'codeBlock', label: 'コードブロック' },
  { key: 'template', label: 'テンプレート' },
  { key: 'protection', label: 'セキュリティ' },
  { key: 'storage', label: '保存先' },
  { key: 'plugins', label: 'プラグイン' },
  { key: 'backup', label: 'バックアップ' },
  { key: 'restore', label: 'リストア' },
  { key: 'reset', label: '初期化' },
];

export default function PreferencesModal({
  open,
  onClose,
  settings,
  onChange,
  standalone = false,
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

  const content = (
      <div
        className={`modal modal--prefs ${standalone ? 'modal--prefs-standalone' : ''}`}
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
            {active === 'ai' && (
              <AiPanel settings={settings} onChange={onChange} />
            )}
            {active === 'codeBlock' && (
              <CodeBlockPanel settings={settings} onChange={onChange} />
            )}
            {active === 'template' && (
              <TemplatePanel settings={settings} onChange={onChange} />
            )}
            {active === 'protection' && (
              <ProtectionPanel settings={settings} onChange={onChange} />
            )}
            {active === 'storage' && (
              <StoragePanel settings={settings} onChange={onChange} />
            )}
            {active === 'plugins' && (
              <PluginsPanel settings={settings} onChange={onChange} />
            )}
            {active === 'backup' && <BackupPanel />}
            {active === 'restore' && <RestorePanel />}
            {active === 'reset' && <ResetPanel />}
          </section>
        </div>
      </div>
  );

  if (standalone) {
    return <div className="prefs-window">{content}</div>;
  }

  return (
    <div className="modal__backdrop" onClick={onClose} role="presentation">
      {content}
    </div>
  );
}

// ----- AI パネル -----

function AiPanel({ settings, onChange }: PanelProps) {
  // タブ式: aiProvider が「現在編集中 = 有効化されているプロバイダ」
  // 各プロバイダの token / endpoint / model は aiProviderSettings[provider] に独立保存
  const isChatGpt = settings.aiProvider === 'chatgpt';
  const [showToken, setShowToken] = useState(false);
  const current: AiProviderSettings =
    settings.aiProviderSettings[settings.aiProvider];

  /** 現在編集中プロバイダの 1 フィールドを更新 */
  const updateField = (field: keyof AiProviderSettings, value: string) => {
    onChange('aiProviderSettings', {
      ...settings.aiProviderSettings,
      [settings.aiProvider]: {
        ...current,
        [field]: value,
      },
    });
  };

  const handleProviderChange = (provider: AiProvider) => {
    onChange('aiProvider', provider);
    // ChatGPT に切替時、その枠の model が許可リスト外なら既定値へ
    if (provider === 'chatgpt') {
      const m = settings.aiProviderSettings.chatgpt.model;
      if (!CHATGPT_MODEL_OPTIONS.includes(m)) {
        onChange('aiProviderSettings', {
          ...settings.aiProviderSettings,
          chatgpt: {
            ...settings.aiProviderSettings.chatgpt,
            model: CHATGPT_MODEL_OPTIONS[0],
          },
        });
      }
    }
  };

  const tokenIsSet = current.token.trim().length > 0;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">AI</h3>

      {/* ----- プロバイダ選択 (タブ) ----- */}
      <div
        className="ai-panel__providers"
        role="tablist"
        aria-label="AI プロバイダ"
      >
        {AI_PROVIDER_OPTIONS.map((o) => {
          const isActive = settings.aiProvider === o.value;
          const hasToken =
            settings.aiProviderSettings[o.value]?.token.trim().length > 0;
          return (
            <button
              key={o.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`ai-panel__provider-card ${isActive ? 'is-active' : ''}`}
              onClick={() => handleProviderChange(o.value)}
            >
              <span className="ai-panel__provider-icon">
                <AiSparkIcon />
              </span>
              <span className="ai-panel__provider-name">{o.label}</span>
              <span className="ai-panel__provider-state">
                {isActive ? '選択中' : hasToken ? '設定済み' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* ----- 接続 (Token + Endpoint) — 現在選択中のプロバイダ専用 ----- */}
      <div className="ai-panel__subhead">
        <h4 className="ai-panel__subhead-title">
          接続
          <span
            className={`ai-panel__status-dot ${tokenIsSet ? 'ai-panel__status-dot--ok' : ''}`}
            title={tokenIsSet ? 'Token 設定済み' : 'Token 未設定'}
            aria-label={tokenIsSet ? 'Token 設定済み' : 'Token 未設定'}
          />
        </h4>
      </div>

      <div className="ai-panel__group">
        <div className="ai-panel__row">
          <div className="ai-panel__row-label">
            <span className="ai-panel__row-icon">
              <KeyIcon />
            </span>
            API Token
          </div>
          <div className="ai-panel__token-wrap">
            <input
              id="prefs-ai-token"
              className="ai-panel__row-input"
              type={showToken ? 'text' : 'password'}
              value={current.token}
              placeholder="API token を入力"
              autoComplete="off"
              onChange={(e) => updateField('token', e.target.value)}
            />
            <button
              type="button"
              className="ai-panel__token-toggle"
              onClick={() => setShowToken((v) => !v)}
              title={showToken ? 'Token を隠す' : 'Token を表示'}
              aria-label={showToken ? 'Token を隠す' : 'Token を表示'}
            >
              {showToken ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          <p className="ai-panel__row-desc">
            選択中のプロバイダ専用のトークン。プロバイダごとに別々に保存されます。
          </p>
        </div>

        <div className="ai-panel__row">
          <div className="ai-panel__row-label">
            <span className="ai-panel__row-icon">
              <LinkIcon />
            </span>
            Endpoint
          </div>
          <input
            id="prefs-ai-endpoint"
            className="ai-panel__row-input"
            type="url"
            value={current.endpoint}
            placeholder="https://..."
            onChange={(e) => updateField('endpoint', e.target.value)}
          />
          <p className="ai-panel__row-desc">
            空欄の場合はプロバイダ既定の URL を使います。「一般的な AI」と「Copilot」では OpenAI 互換 URL を指定してください。
          </p>
        </div>
      </div>

      {/* ----- モデル ----- */}
      <div className="ai-panel__subhead">
        <h4 className="ai-panel__subhead-title">モデル</h4>
      </div>

      <div className="ai-panel__group">
        <div className="ai-panel__row">
          <div className="ai-panel__row-label">
            <span className="ai-panel__row-icon">
              <CpuIcon />
            </span>
            使用するモデル
          </div>
          {isChatGpt ? (
            <select
              id="prefs-ai-model"
              className="ai-panel__row-select"
              value={
                CHATGPT_MODEL_OPTIONS.includes(current.model)
                  ? current.model
                  : CHATGPT_MODEL_OPTIONS[0]
              }
              onChange={(e) => updateField('model', e.target.value)}
            >
              {CHATGPT_MODEL_OPTIONS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="prefs-ai-model"
              className="ai-panel__row-input"
              type="text"
              value={current.model}
              placeholder="モデル名（空欄でプロバイダ既定）"
              onChange={(e) => updateField('model', e.target.value)}
            />
          )}
          <p className="ai-panel__row-desc">
            {isChatGpt
              ? 'ChatGPT 用のモデルから選択します。'
              : '空欄の場合はプロバイダ別の既定モデルが使われます。'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ----- AI パネル用アイコン -----

function AiSparkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4L12 3z" />
      <path d="M19 14l.7 1.8L21 17l-1.3.8L19 19l-.7-1.2L17 17l1.3-1.2L19 14z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="15" r="4" />
      <path d="M11 13l9-9" />
      <path d="M17 7l3 3" />
      <path d="M19 5l2 2" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  );
}

function CpuIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l18 18" />
      <path d="M10.5 10.5a3 3 0 0 0 4 4" />
      <path d="M17.5 17.5C16 18.5 14.1 19 12 19c-6.5 0-10-7-10-7a17 17 0 0 1 4.4-5.1" />
      <path d="M9.5 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.7" />
    </svg>
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

  const [filter, setFilter] = useState('');
  const filteredLangs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return SUPPORTED_HIGHLIGHT_LANGS;
    return SUPPORTED_HIGHLIGHT_LANGS.filter(
      (l) =>
        l.id.toLowerCase().includes(q) || l.label.toLowerCase().includes(q),
    );
  }, [filter]);

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

      {/* ----- 表示オプション ----- */}
      <div className="code-panel__subhead code-panel__subhead--first">
        <h4 className="code-panel__subhead-title">表示オプション</h4>
      </div>

      <div className="code-panel__group">
        <div className="code-panel__row">
          <span className="code-panel__row-icon">
            <CopyOutlineIcon />
          </span>
          <div className="code-panel__row-body">
            <span className="code-panel__row-title">
              コピーボタンを常に表示
            </span>
            <p className="code-panel__row-desc">
              プレビューのコードブロック右上のコピーボタンを常時表示します。オフだとマウスホバー時にだけ表示されます。
            </p>
          </div>
          <div className="code-panel__row-action">
            <ToggleSwitch
              checked={settings.codeCopyAlwaysVisible}
              onChange={(v) => onChange('codeCopyAlwaysVisible', v)}
              ariaLabel="コピーボタンを常に表示"
            />
          </div>
        </div>

        <div className="code-panel__row">
          <span className="code-panel__row-icon">
            <HashIcon />
          </span>
          <div className="code-panel__row-body">
            <span className="code-panel__row-title">行番号を表示</span>
            <p className="code-panel__row-desc">
              プレビューのコードブロック左側に行番号を表示します。
            </p>
          </div>
          <div className="code-panel__row-action">
            <ToggleSwitch
              checked={settings.codeShowLineNumbers}
              onChange={(v) => onChange('codeShowLineNumbers', v)}
              ariaLabel="行番号を表示"
            />
          </div>
        </div>
      </div>

      {/* ----- シンタックスハイライト ----- */}
      <div className="code-panel__subhead">
        <h4 className="code-panel__subhead-title">
          シンタックスハイライト
          <span className="code-panel__count">
            {enabledSet.size}/{SUPPORTED_HIGHLIGHT_LANGS.length}
          </span>
        </h4>
        <div className="code-panel__subhead-actions">
          <button
            type="button"
            className="code-panel__btn"
            onClick={enableAll}
          >
            全て有効
          </button>
          <button
            type="button"
            className="code-panel__btn"
            onClick={disableAll}
          >
            全て無効
          </button>
        </div>
      </div>

      <div className="code-panel__search-wrap">
        <span className="code-panel__search-icon">
          <SearchIcon />
        </span>
        <input
          type="search"
          className="code-panel__search-input"
          placeholder="言語を検索…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {filteredLangs.length === 0 ? (
        <div className="code-panel__lang-empty">
          一致する言語が見つかりません
        </div>
      ) : (
        <div className="code-panel__lang-grid" role="group">
          {filteredLangs.map((lang) => {
            const on = enabledSet.has(lang.id);
            return (
              <button
                type="button"
                key={lang.id}
                className={`code-panel__lang-chip ${on ? 'is-on' : ''}`}
                onClick={() => toggleLang(lang.id)}
                aria-pressed={on}
              >
                <span className="code-panel__lang-check">
                  <CheckIcon />
                </span>
                {lang.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----- コードブロックパネル用アイコン -----

function CopyOutlineIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M10 3L8 21" />
      <path d="M16 3l-2 18" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.5l3.5 3.5L13 4.5" />
    </svg>
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

  const canSave =
    oldDraft.length === 4 &&
    newDraft.length === 4 &&
    oldDraft !== newDraft;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">セキュリティ</h3>

      {/* ----- ステータスバナー ----- */}
      {isDefaultPassword ? (
        <div className="security-panel__banner security-panel__banner--warn">
          <span className="security-panel__banner-icon">
            <ShieldWarnIcon />
          </span>
          <div className="security-panel__banner-body">
            <span className="security-panel__banner-title">
              初期パスワードのままです
            </span>
            <p className="security-panel__banner-desc">
              現在のパスワードは <code>1234</code> です。下のフォームから安全な値に変更してください。
            </p>
          </div>
        </div>
      ) : (
        <div className="security-panel__banner security-panel__banner--ok">
          <span className="security-panel__banner-icon">
            <ShieldCheckIcon />
          </span>
          <div className="security-panel__banner-body">
            <span className="security-panel__banner-title">
              パスワードが設定されています
            </span>
            <p className="security-panel__banner-desc">
              保護ノート / シークレットノートを開く時、ロック解除時に要求されます。
            </p>
          </div>
        </div>
      )}

      {/* ----- パスワード変更 ----- */}
      <div className="security-panel__subhead">
        <h4 className="security-panel__subhead-title">パスワード変更</h4>
      </div>

      <div className="security-panel__group">
        <div className="security-panel__row">
          <span className="security-panel__row-icon">
            <LockIcon />
          </span>
          <div className="security-panel__row-body">
            <span className="security-panel__row-title">現在のパスワード</span>
            <p className="security-panel__row-hint">
              いま設定されている 4 桁の数字
            </p>
          </div>
          <div className="security-panel__row-input">
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
        </div>

        <div className="security-panel__row">
          <span className="security-panel__row-icon">
            <KeyIcon />
          </span>
          <div className="security-panel__row-body">
            <span className="security-panel__row-title">新しいパスワード</span>
            <p className="security-panel__row-hint">
              これから使う 4 桁の数字
            </p>
          </div>
          <div className="security-panel__row-input">
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
        </div>
      </div>

      <div className="security-panel__actions">
        <button
          type="button"
          className="security-panel__btn"
          onClick={handleSave}
          disabled={!canSave}
        >
          <CheckIcon />
          更新
        </button>
      </div>

      {message && (
        <div
          className={`security-panel__notice ${
            message.type === 'error'
              ? 'security-panel__notice--err'
              : 'security-panel__notice--ok'
          }`}
        >
          {message.type === 'error' ? <AlertIcon /> : <CheckIcon />}
          {message.text}
        </div>
      )}
    </div>
  );
}

// ----- セキュリティパネル用アイコン -----

function ShieldWarnIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M12 9v4" />
      <path d="M12 16v.01" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16v.01" />
    </svg>
  );
}

// ----- テンプレートパネル -----

function TemplatePanel({ settings, onChange }: PanelProps) {
  const [draft, setDraft] = useState(settings.templateFolder);
  const [saved, setSaved] = useState(false);

  // 設定が外部で変わった場合に追従
  useEffect(() => {
    setDraft(settings.templateFolder);
  }, [settings.templateFolder]);

  const sanitized = draft.trim().replace(/^\/+|\/+$/g, '') || 'template';
  const isDirty = sanitized !== settings.templateFolder;

  const handleSave = () => {
    onChange('templateFolder', sanitized);
    setDraft(sanitized);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">テンプレート</h3>

      <div className="template-panel__subhead template-panel__subhead--first">
        <h4 className="template-panel__subhead-title">テンプレートフォルダ</h4>
      </div>

      <div className="template-panel__card">
        <span className="template-panel__icon">
          <TemplateIcon />
        </span>
        <div className="template-panel__body">
          <span className="template-panel__label">フォルダ名</span>
          <p className="template-panel__desc">
            このフォルダ配下のノートが「テンプレート挿入」メニューに並びます。
            存在しない場合は、新規ノートを <code>{sanitized}/名前</code> 形式で作成すると自動でフォルダが作られます。
          </p>
          <div className="template-panel__input-row">
            <div className="template-panel__input-prefix">
              <input
                id="prefs-template-folder"
                className="template-panel__input"
                type="text"
                value={draft}
                placeholder="template"
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
              />
              <span className="template-panel__slash">/</span>
            </div>
            <button
              type="button"
              className="template-panel__save-btn"
              onClick={handleSave}
              disabled={!isDirty && !saved}
            >
              <CheckIcon />
              保存
            </button>
            {saved && (
              <span className="template-panel__saved-flash">
                <CheckIcon />
                保存しました
              </span>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

// ----- テンプレートパネル用アイコン -----

function TemplateIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// ----- 保存先パネル -----
// ノート (.md) / 画像 / 添付ファイルが書き出されるルートフォルダを設定する。
// 既定は OS の userData フォルダ。ユーザーが任意のフォルダを指定すると、
// 以後の I/O はその直下の notes/, images/, attachments/ に対して行われる。
// 既存のファイルは自動移動しないため、必要なら手動コピーで移行する。

function StoragePanel({ settings, onChange }: PanelProps) {
  const [resolvedRoot, setResolvedRoot] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'ok';
    text: string;
  } | null>(null);

  const refreshRoot = async () => {
    try {
      const root = await window.api.storage.getRoot();
      setResolvedRoot(root);
    } catch {
      setResolvedRoot('');
    }
  };

  useEffect(() => {
    void refreshRoot();
  }, [settings.storagePath]);

  const handleChoose = async () => {
    setMessage(null);
    setBusy(true);
    try {
      const picked = await window.api.storage.chooseFolder();
      if (!picked) return; // キャンセル
      onChange('storagePath', picked);
      setMessage({
        type: 'ok',
        text: '保存先フォルダを変更しました。既存ファイルが見えない場合は、旧フォルダから手動でコピーしてください。',
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          'フォルダ選択に失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetDefault = () => {
    onChange('storagePath', '');
    setMessage({
      type: 'ok',
      text: '既定の保存先（アプリ内 userData）に戻しました。',
    });
  };

  const handleOverwriteAll = async () => {
    if (
      !window.confirm(
        '全ノートのメタ情報と本文を保存先フォルダに上書きします。続行しますか？',
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // 編集中ノートの保留中の自動保存を先に flush して、最新の本文 / メタを
      // ディスクに反映させてから上書きする
      await new Promise<void>((resolve) => {
        window.dispatchEvent(
          new CustomEvent('inknel:flush-pending-saves', {
            detail: { resolve },
          }),
        );
      });
      const result = await window.api.storage.overwriteAll();
      setMessage({
        type: result.failed === 0 ? 'ok' : 'error',
        text:
          `データ上書き完了: ${result.written} 件書き出し` +
          (result.failed > 0 ? ` / ${result.failed} 件失敗` : ''),
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          'データの上書きに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
    }
  };

  const isCustom = settings.storagePath.trim().length > 0;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">保存先</h3>

      {/* ----- ファイル保存先フォルダ ----- */}
      <div className="storage-panel__subhead storage-panel__subhead--first">
        <h4 className="storage-panel__subhead-title">ファイル保存先フォルダ</h4>
        <span
          className={`storage-panel__pill storage-panel__pill--${
            isCustom ? 'custom' : 'default'
          }`}
        >
          {isCustom ? 'カスタム' : '既定'}
        </span>
      </div>

      <div className="storage-panel__card">
        <span className="storage-panel__card-icon">
          <FolderIcon />
        </span>
        <div className="storage-panel__card-body">
          <span className="storage-panel__card-title">
            ノート / 画像 / 添付ファイルの保存場所
          </span>
          <p className="storage-panel__card-desc">
            既定では OS のアプリデータ領域 (<code>userData</code>) に保存されます。iCloud Drive や Dropbox / Google Drive のフォルダを選べば、OS の同期クライアントが他端末と自動同期します。
          </p>

          <div className="storage-panel__path-row">
            <span className="storage-panel__path-label">設定値</span>
            <span
              className={`storage-panel__path-value ${
                !isCustom ? 'storage-panel__path-value--dim' : ''
              }`}
            >
              {isCustom ? settings.storagePath : '既定（アプリ内 userData）'}
            </span>
          </div>

          <div className="storage-panel__path-row">
            <span className="storage-panel__path-label">実際の保存先</span>
            <span
              className={`storage-panel__path-value ${
                !resolvedRoot ? 'storage-panel__path-value--dim' : ''
              }`}
            >
              {resolvedRoot || '取得中…'}
            </span>
          </div>

          <div className="storage-panel__actions">
            <button
              type="button"
              className="storage-panel__btn"
              onClick={() => void handleChoose()}
              disabled={busy}
            >
              <FolderOpenIcon />
              フォルダを選択
            </button>
            <button
              type="button"
              className="storage-panel__btn storage-panel__btn--ghost"
              onClick={handleResetDefault}
              disabled={!isCustom || busy}
            >
              既定に戻す
            </button>
          </div>
        </div>
      </div>

      <div className="storage-panel__hint">
        <span className="storage-panel__hint-icon">
          <AlertIcon />
        </span>
        <span>
          保存先を変更しても既存ファイルは自動移動されません。旧フォルダから{' '}
          <code>notes/</code> / <code>images/</code> /{' '}
          <code>attachments/</code> を手動でコピーしてください。
        </span>
      </div>

      {/* ----- データ管理 ----- */}
      <div className="storage-panel__subhead">
        <h4 className="storage-panel__subhead-title">データ管理</h4>
      </div>

      <div className="storage-panel__card">
        <span className="storage-panel__card-icon">
          <UploadIcon />
        </span>
        <div className="storage-panel__card-body">
          <span className="storage-panel__card-title">データを上書き</span>
          <p className="storage-panel__card-desc">
            DB の全ノートのメタ情報（タイトル / フォルダ / タグ / 保護フラグ / タイムスタンプ）と本文を、保存先フォルダの <code>.md</code> ファイルに <strong>強制的に書き直し</strong>ます。先頭に YAML front-matter が付与され、別端末で取り込んだ時もメタが復元できます。
          </p>
          <div className="storage-panel__actions">
            <button
              type="button"
              className="storage-panel__btn"
              onClick={() => void handleOverwriteAll()}
              disabled={busy}
            >
              <UploadIcon />
              データを上書き
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`storage-panel__notice storage-panel__notice--${
            message.type === 'error' ? 'err' : 'ok'
          }`}
        >
          {message.type === 'error' ? <AlertIcon /> : <CheckIcon />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}

// ----- 保存先パネル用アイコン -----

function FolderIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3V8z" />
      <path d="M3 11l1.7 7.5a2 2 0 0 0 2 1.5h11.6a2 2 0 0 0 2-1.5L22 11H3z" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}


// ----- プラグインパネル -----
// `src/plugins/<id>.ts` として配置されたプラグインを registry から自動検出し、
// 検出されたものだけ ON/OFF トグルを表示する。
// - プラグインが 1 つも無ければ「未インストール」案内を表示
// - 無効化された ID は settings.enabledPlugins から外れる
// - registry に存在しない ID が settings に残っていても無視される
const PLUGIN_CATALOG_URL = 'https://inknel.ary-ap.com/plugins/plugins.json';

interface RemotePluginRow {
  id: string;
  /** baseUrl からの相対 manifest ファイル名 (mermaid.json 等) */
  filename: string;
  /** 取得済み manifest の中身。失敗時 null */
  manifest: {
    name?: string;
    description?: string;
    version?: string;
    [key: string]: unknown;
  } | null;
}

type StoreState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: RemotePluginRow[]; baseUrl: string }
  | { kind: 'not_found' };

interface DisplayPlugin {
  id: string;
  label: string;
  description: string;
  /** 'bundled' = src/plugins から検出 / 'downloaded' = userData/plugins/ の manifest のみ */
  source: 'bundled' | 'downloaded';
  /**
   * 'imported' = runtime registry に登録済み（bundled は常に true）。
   * 'pending'  = DL 済だが未インポート。トグルではなく「インポート」ボタンを表示。
   */
  state: 'imported' | 'pending';
}

function PluginsPanel({ settings, onChange }: PanelProps) {
  const bundled = useMemo(() => listPlugins(), []);
  const enabledSet = useMemo(
    () => new Set(settings.enabledPlugins),
    [settings.enabledPlugins],
  );

  const toggle = (id: string, next: boolean) => {
    const set = new Set(settings.enabledPlugins);
    if (next) set.add(id);
    else set.delete(id);
    onChange('enabledPlugins', Array.from(set));
  };

  // ----- プラグインストア -----
  const [storeState, setStoreState] = useState<StoreState>({ kind: 'idle' });
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [downloadedManifests, setDownloadedManifests] = useState<
    Array<{ filename: string; content: unknown }>
  >([]);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  /**
   * ローカル plugins ディレクトリを再走査し、以下を更新:
   *   - installed: 全ファイル名（DL ボタン状態 / 「N/M ファイル取得済み」表示用）
   *   - downloadedManifests: パース済 manifest（プラグイン一覧トグル表示用）
   */
  const refreshInstalled = async () => {
    try {
      const [files, manifests] = await Promise.all([
        window.api.plugins.listLocalFiles(),
        window.api.plugins.listLocal(),
      ]);
      setInstalled(new Set(files));
      setDownloadedManifests(manifests);
    } catch {
      /* ディレクトリ未作成時など */
    }
  };

  // パネルを開いた時に自動的にカタログを取得（「プラグインの取得」を初回押下した状態）
  // refreshInstalled は handleFetchStore 内部でも呼ばれるので別途は走らせない
  useEffect(() => {
    void handleFetchStore();
    // 初回マウント限定: handleFetchStore は毎レンダリング再生成されるが
    // ここで実行したいのは「最初の 1 回だけ」なので依存配列を空にする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // id → DL 済 manifest のファイル名（削除ボタン表示判定用）
  const downloadedById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of downloadedManifests) {
      const c = m.content as Record<string, unknown> | null;
      if (c && typeof c.id === 'string') {
        map.set(c.id, m.filename);
      }
    }
    return map;
  }, [downloadedManifests]);

  const handleImport = async (id: string) => {
    setInstallNotice(null);
    const result = await importPluginById(id);
    if (!result.ok) {
      setInstallNotice(`インポートに失敗しました: ${result.error}`);
      return;
    }
    // 永続化（次回起動時にも自動でロードされる）
    if (!settings.importedPlugins.includes(id)) {
      onChange('importedPlugins', [...settings.importedPlugins, id]);
    }
    setInstallNotice(`${id} をインポートしました`);
  };

  const handleUninstall = async (id: string) => {
    const filename = downloadedById.get(id);
    if (!filename) return;
    const ok = window.confirm(
      `プラグイン "${id}" を削除しますか？\n` +
        '（ダウンロードファイル削除 + 一覧から除外 + 有効化解除）',
    );
    if (!ok) return;
    setInstallNotice(null);

    // 1) settings: enabledPlugins から外し、removedPlugins に追加
    const enabledNext = settings.enabledPlugins.filter((x) => x !== id);
    if (enabledNext.length !== settings.enabledPlugins.length) {
      onChange('enabledPlugins', enabledNext);
    }
    if (!settings.removedPlugins.includes(id)) {
      onChange('removedPlugins', [...settings.removedPlugins, id]);
    }

    // 2) ランタイム登録を解除
    unloadPluginById(id);
    // 3) importedPlugins から外す
    if (settings.importedPlugins.includes(id)) {
      onChange(
        'importedPlugins',
        settings.importedPlugins.filter((x) => x !== id),
      );
    }
    // 4) ローカルファイルを削除
    try {
      const res = await window.api.plugins.uninstall(filename);
      await refreshInstalled();
      if (res.failed.length > 0) {
        setInstallNotice(
          `削除: ${res.removed.join(', ')} / 失敗: ${res.failed.join(', ')}`,
        );
      } else {
        setInstallNotice(
          `${id} を削除しました${
            res.removed.length > 0 ? ` (${res.removed.join(', ')})` : ''
          }`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInstallNotice(`削除に失敗しました: ${msg}`);
    }
  };

  // バンドル + DL 済 manifest を id 重複排除して合算
  // （bundled が優先：実行可能コードがあるため）
  // settings.removedPlugins に含まれる ID はユーザーが明示的に削除した
  // ものとして一覧から除外する。
  const allPlugins = useMemo<DisplayPlugin[]>(() => {
    const removedSet = new Set(settings.removedPlugins);
    const importedSet = new Set(settings.importedPlugins);
    const map = new Map<string, DisplayPlugin>();
    for (const p of bundled) {
      if (removedSet.has(p.id)) continue;
      map.set(p.id, {
        id: p.id,
        label: p.manifest.label,
        description: p.manifest.description,
        source: 'bundled',
        state: 'imported',
      });
    }
    for (const m of downloadedManifests) {
      const c = m.content as Record<string, unknown> | null;
      if (!c || typeof c !== 'object') continue;
      const id = typeof c.id === 'string' ? c.id : null;
      if (!id || removedSet.has(id) || map.has(id)) continue;
      const label =
        typeof c.label === 'string'
          ? c.label
          : typeof c.name === 'string'
            ? c.name
            : id;
      const description =
        typeof c.description === 'string' ? c.description : '';
      map.set(id, {
        id,
        label,
        description,
        source: 'downloaded',
        state: importedSet.has(id) ? 'imported' : 'pending',
      });
    }
    return Array.from(map.values());
  }, [
    bundled,
    downloadedManifests,
    settings.removedPlugins,
    settings.importedPlugins,
  ]);

  const handleFetchStore = async () => {
    setStoreState({ kind: 'loading' });
    setInstallNotice(null);
    // ストア取得タイミングでローカルファイルも再走査（ユーザーが直接削除した場合の追随）
    await refreshInstalled();
    const catalog = await window.api.plugins.fetchCatalog(PLUGIN_CATALOG_URL);
    if (!catalog) {
      setStoreState({ kind: 'not_found' });
      return;
    }
    // 各 manifest を並列取得（失敗は manifest=null で表示）
    const rows = await Promise.all(
      catalog.plugins.map(async (p): Promise<RemotePluginRow> => {
        const m = await window.api.plugins.fetchManifest(
          catalog.baseUrl,
          p.manifest,
        );
        return {
          id: p.id,
          filename: p.manifest,
          manifest: (m?.content as RemotePluginRow['manifest']) ?? null,
        };
      }),
    );
    setStoreState({ kind: 'loaded', rows, baseUrl: catalog.baseUrl });
  };

  const handleInstall = async (row: RemotePluginRow) => {
    if (!row.manifest) return;
    if (storeState.kind !== 'loaded') return;
    setInstalling((prev) => new Set(prev).add(row.filename));
    setInstallNotice(null);
    // 再 DL したら「削除済み」フラグから外して一覧に再表示させる
    if (settings.removedPlugins.includes(row.id)) {
      onChange(
        'removedPlugins',
        settings.removedPlugins.filter((x) => x !== row.id),
      );
    }
    let res: Awaited<ReturnType<typeof window.api.plugins.install>> | null;
    try {
      res = await window.api.plugins.install({
        filename: row.filename,
        content: row.manifest,
        baseUrl: storeState.baseUrl,
      });
    } catch (err) {
      // IPC ハンドラ未登録 / Electron 側未再起動などの致命的エラーを可視化
      console.error('[plugins:install] IPC failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setInstallNotice(
        `ダウンロードに失敗しました: ${msg}\n` +
          'npm run dev を再起動してから再試行してください',
      );
      setInstalling((prev) => {
        const next = new Set(prev);
        next.delete(row.filename);
        return next;
      });
      return;
    }
    setInstalling((prev) => {
      const next = new Set(prev);
      next.delete(row.filename);
      return next;
    });
    if (!res) {
      setInstallNotice('プラグインが見つかりません');
      return;
    }
    // ディスク状態を真とするため、状態のマージではなく再列挙する
    await refreshInstalled();
    // 「ダウンロード = ファイル保存だけ」なので自動 import はしない。
    // 利用するには「インポート」ボタンを押す。
    const savedDetail =
      res.savedFiles.length > 0 ? `保存: ${res.savedFiles.join(', ')}` : '';
    if (res.missingFiles.length > 0) {
      setInstallNotice(
        `一部ファイルが見つかりませんでした: ${res.missingFiles.join(', ')}` +
          (savedDetail ? ` / ${savedDetail}` : ''),
      );
    } else {
      setInstallNotice(`${row.manifest.name ?? row.id} を保存しました (${savedDetail})`);
    }
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">プラグイン</h3>

      {/* ===== インストール済み ===== */}
      <div className="plugins-panel__subhead plugins-panel__subhead--first">
        <h4 className="plugins-panel__subhead-title">
          インストール済み
          <span className="plugins-panel__subhead-count">
            {allPlugins.length}
          </span>
        </h4>
      </div>

      {allPlugins.length === 0 ? (
        <div className="plugins-panel__empty">
          <PluginIconLarge />
          <p className="plugins-panel__empty-title">
            プラグインがインストールされていません
          </p>
          <p className="plugins-panel__empty-hint">
            下の「プラグインの取得」からダウンロードしてください
          </p>
        </div>
      ) : (
        <div className="plugins-panel__list">
          {allPlugins.map((p) => {
            const hasLocalCopy = downloadedById.has(p.id);
            return (
              <article className="plugins-panel__card" key={p.id}>
                <div className="plugins-panel__card-icon">
                  <PluginIcon />
                </div>
                <div className="plugins-panel__card-body">
                  <div className="plugins-panel__card-title-row">
                    <span className="plugins-panel__card-name">{p.label}</span>
                  </div>
                  <span className="plugins-panel__card-id">{p.id}</span>
                  {p.description && (
                    <p className="plugins-panel__card-desc">
                      <PluginDescription text={p.description} />
                    </p>
                  )}
                  <div className="plugins-panel__card-meta">
                    <span
                      className={`plugins-panel__badge plugins-panel__badge--${p.source}`}
                    >
                      {p.source === 'bundled' ? 'バンドル版' : 'ダウンロード版'}
                    </span>
                    {p.state === 'pending' && (
                      <span className="plugins-panel__badge plugins-panel__badge--partial">
                        未インポート
                      </span>
                    )}
                  </div>
                </div>
                <div className="plugins-panel__card-actions plugins-panel__card-actions--installed">
                  {p.state === 'imported' ? (
                    <ToggleSwitch
                      checked={enabledSet.has(p.id)}
                      onChange={(v) => toggle(p.id, v)}
                      ariaLabel={`${p.label} を有効化`}
                    />
                  ) : (
                    <button
                      type="button"
                      className="plugins-panel__btn plugins-panel__btn--primary"
                      onClick={() => void handleImport(p.id)}
                      title="プラグインをアプリに取り込んで利用可能にする"
                    >
                      インポート
                    </button>
                  )}
                  {hasLocalCopy && (
                    <button
                      type="button"
                      className="plugins-panel__delete-link"
                      onClick={() => void handleUninstall(p.id)}
                      title="ダウンロードしたファイルを削除"
                    >
                      <TrashIcon />
                      削除
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ===== プラグインストア ===== */}
      <div className="plugins-panel__subhead">
        <h4 className="plugins-panel__subhead-title">
          プラグインストア
          {storeState.kind === 'loaded' && (
            <span className="plugins-panel__subhead-count">
              {storeState.rows.length}
            </span>
          )}
        </h4>
        <div className="plugins-panel__subhead-actions">
          <button
            type="button"
            className="plugins-panel__btn plugins-panel__btn--primary"
            onClick={() => void handleFetchStore()}
            disabled={storeState.kind === 'loading'}
          >
            {storeState.kind === 'loading' ? <Spinner /> : <RefreshIcon />}
            {storeState.kind === 'loading' ? '取得中…' : '取得'}
          </button>
        </div>
      </div>

      {storeState.kind === 'loading' && (
        <div className="plugins-panel__loading">
          <Spinner />
          カタログを取得しています…
        </div>
      )}

      {storeState.kind === 'not_found' && (
        <div className="plugins-panel__empty">
          <p className="plugins-panel__empty-title">
            プラグインが見つかりません
          </p>
          <p className="plugins-panel__empty-hint">
            カタログ URL に到達できませんでした
          </p>
        </div>
      )}

      {storeState.kind === 'loaded' && storeState.rows.length === 0 && (
        <div className="plugins-panel__empty">
          <p className="plugins-panel__empty-title">
            利用可能なプラグインがありません
          </p>
        </div>
      )}

      {storeState.kind === 'loaded' && storeState.rows.length > 0 && (
        <div className="plugins-panel__list">
          {storeState.rows.map((row) => {
            const declaredFiles = Array.isArray(row.manifest?.files)
              ? (row.manifest!.files as unknown[]).filter(
                  (f): f is string => typeof f === 'string',
                )
              : [];
            const requiredFiles = [row.filename, ...declaredFiles];
            const presentCount = requiredFiles.filter((f) =>
              installed.has(f),
            ).length;
            const isFullyInstalled =
              presentCount === requiredFiles.length &&
              requiredFiles.length > 0;
            const isInstalling = installing.has(row.filename);
            const name = row.manifest?.name ?? row.id;
            const description =
              row.manifest?.description ??
              (row.manifest === null
                ? 'マニフェストの取得に失敗しました'
                : '');
            return (
              <article className="plugins-panel__card" key={row.id}>
                <div className="plugins-panel__card-icon">
                  <PluginIcon />
                </div>
                <div className="plugins-panel__card-body">
                  <div className="plugins-panel__card-title-row">
                    <span className="plugins-panel__card-name">{name}</span>
                    {row.manifest?.version && (
                      <span className="plugins-panel__card-version">
                        v{row.manifest.version}
                      </span>
                    )}
                  </div>
                  <span className="plugins-panel__card-id">{row.id}</span>
                  {description && (
                    <p className="plugins-panel__card-desc">
                      <PluginDescription text={description} />
                    </p>
                  )}
                  <div className="plugins-panel__card-meta">
                    {requiredFiles.length > 0 && (
                      <span
                        className={`plugins-panel__badge ${
                          isFullyInstalled
                            ? 'plugins-panel__badge--ok'
                            : presentCount > 0
                              ? 'plugins-panel__badge--partial'
                              : ''
                        }`}
                      >
                        {isFullyInstalled
                          ? '✓ '
                          : ''}
                        {presentCount}/{requiredFiles.length} ファイル
                      </span>
                    )}
                  </div>
                </div>
                <div className="plugins-panel__card-actions">
                  <button
                    type="button"
                    className={`plugins-panel__btn ${
                      isFullyInstalled ? '' : 'plugins-panel__btn--primary'
                    }`}
                    onClick={() => void handleInstall(row)}
                    disabled={!row.manifest || isInstalling}
                  >
                    {isInstalling ? (
                      <>
                        <Spinner />
                        保存中…
                      </>
                    ) : isFullyInstalled ? (
                      <>
                        <RefreshIcon />
                        再ダウンロード
                      </>
                    ) : (
                      <>
                        <DownloadIcon />
                        ダウンロード
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {installNotice && (
        <div
          className={`plugins-panel__notice plugins-panel__notice--${
            installNotice.includes('失敗') ||
            installNotice.includes('見つかりません')
              ? 'warn'
              : 'info'
          }`}
        >
          {installNotice}
        </div>
      )}
    </div>
  );
}

/**
 * プラグイン説明文を描画する。
 * `\`code\`` 表記を `<code>` 要素として表示する（manifest 内のコード片を強調）。
 * 三連バックティック (\`\`\`xxx) も "xxx" として code 表示する。
 */
function PluginDescription({ text }: { text: string }) {
  // 1) ``` 三連バックティック の塊を最優先で抽出（言語名などの fence 開始記法）
  // 2) 残りの中の ` 単体バックティック を抽出
  // 結果を React ノード配列にまとめる
  const nodes: React.ReactNode[] = [];
  let key = 0;
  // ``` 言語 もしくは ``` xxx ``` どちらの形でも対応
  const re = /(`{3}([\w-]+)|`([^`]+)`)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      nodes.push(text.slice(lastIndex, m.index));
    }
    const codeContent = m[2] ?? m[3] ?? '';
    nodes.push(<code key={`c-${key++}`}>{codeContent}</code>);
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return <>{nodes}</>;
}

// ----- プラグイン関連アイコン (16px ストローク 1.5px) -----

function PluginIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3v3a2 2 0 0 0 4 0V3" />
      <path d="M3 9h3a2 2 0 0 1 0 4H3" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M15 13.5v3a2.5 2.5 0 0 0 5 0" opacity=".5" />
    </svg>
  );
}

function PluginIconLarge() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="plugins-panel__empty-icon"
    >
      <path d="M9 3v3a2 2 0 0 0 4 0V3" />
      <path d="M3 9h3a2 2 0 0 1 0 4H3" />
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="plugins-panel__spinner"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.55" />
    </svg>
  );
}

// ----- バックアップパネル -----
// 手順:
//   1. (UI) DB→MD 同期で .md ファイルを最新にする
//   2. (Electron) ストレージルート (notes/ images/ attachments/) を ZIP 化して保存
function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'syncing' | 'zipping'
  >('idle');
  const [message, setMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const handleBackup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // 編集中の保留分を flush
      await new Promise<void>((resolve) => {
        window.dispatchEvent(
          new CustomEvent('inknel:flush-pending-saves', {
            detail: { resolve },
          }),
        );
      });

      // DB ↔ MD 同期
      setPhase('syncing');
      try {
        await window.api.storage.sync();
      } catch (err) {
        // 同期失敗でもバックアップは続行できる（既存 .md があれば）
        console.warn('[backup] DB↔MD sync failed:', err);
      }

      // ZIP 化 + 保存
      setPhase('zipping');
      const result = await window.api.backup.create();
      if (!result) {
        // キャンセル
        setMessage({ type: 'ok', text: 'バックアップをキャンセルしました' });
        return;
      }
      setMessage({
        type: 'ok',
        text: `${result.fileCount} ファイルを ZIP 保存しました: ${result.savedPath}`,
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text:
          'バックアップに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">バックアップ</h3>

      <div className="backup-panel__card">
        <span className="backup-panel__card-icon">
          <ArchiveIcon />
        </span>
        <div className="backup-panel__card-body">
          <span className="backup-panel__card-title">
            ZIP バックアップを作成
          </span>
          <p className="backup-panel__card-desc">
            保存先フォルダ配下の <code>notes/</code> / <code>images/</code> /{' '}
            <code>attachments/</code> をまとめて 1 つの ZIP ファイルに保存します。
          </p>

          <ol className="backup-panel__steps">
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">1</span>
              <span className="backup-panel__step-text">
                編集中ノートを保存し、DB ↔ MD の差分を同期
              </span>
            </li>
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">2</span>
              <span className="backup-panel__step-text">
                保存先フォルダ全体を ZIP 圧縮
              </span>
            </li>
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">3</span>
              <span className="backup-panel__step-text">
                保存ダイアログで任意の場所に書き出し
              </span>
            </li>
          </ol>

          <div className="backup-panel__actions">
            <button
              type="button"
              className="backup-panel__btn"
              onClick={() => void handleBackup()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Spinner />
                  {phase === 'syncing'
                    ? '同期中…'
                    : phase === 'zipping'
                      ? 'ZIP 圧縮中…'
                      : '処理中…'}
                </>
              ) : (
                <>
                  <DownloadIcon />
                  バックアップを作成
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`backup-panel__notice backup-panel__notice--${
            message.type === 'err' ? 'err' : 'ok'
          }`}
        >
          {message.type === 'err' ? <AlertIcon /> : <CheckIcon />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}

// ----- リストアパネル -----
// 手順:
//   1. (Electron) ZIP 選択ダイアログでファイル指定
//   2. (Electron) ストレージルート配下を入れ替え
//   3. (UI) MD→DB 同期で取り込み直す
function RestorePanel() {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    'idle' | 'extracting' | 'importing'
  >('idle');
  const [message, setMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const handleRestore = async () => {
    if (
      !window.confirm(
        'リストアを実行すると、現在の保存先の notes / images / attachments が ZIP の中身で上書きされます。\n\n続行しますか？',
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      // 編集中の保留分を flush（リストア後に上書きされるが、念のため）
      await new Promise<void>((resolve) => {
        window.dispatchEvent(
          new CustomEvent('inknel:flush-pending-saves', {
            detail: { resolve },
          }),
        );
      });

      setPhase('extracting');
      const result = await window.api.backup.restore();
      if (!result) {
        setMessage({ type: 'ok', text: 'リストアをキャンセルしました' });
        return;
      }

      // DB を MD ファイルから完全再構築。
      // storage:sync は双方向なので古い DB エントリが残ってしまうが、
      // rebuildFromMd は notes/folders テーブルを破棄してから取り込み直す。
      setPhase('importing');
      let importedCount = 0;
      try {
        const r = await window.api.storage.rebuildFromMd();
        importedCount = r.imported;
      } catch (err) {
        console.warn('[restore] rebuildFromMd failed:', err);
      }
      // ノート一覧の再読込を画面側に依頼
      window.dispatchEvent(new CustomEvent('inknel:notes-changed'));

      setMessage({
        type: 'ok',
        text: `リストア完了: ${result.fileCount} ファイル展開 / ${importedCount} ノートを DB へ取り込み (元 ZIP: ${result.restoredPath})`,
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text:
          'リストアに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">リストア</h3>

      <div className="backup-panel__warn">
        <span className="backup-panel__warn-icon">
          <AlertIcon />
        </span>
        <span>
          リストアを実行すると、現在の保存先フォルダの <code>notes/</code> /{' '}
          <code>images/</code> / <code>attachments/</code> が ZIP の中身で完全に上書きされます。重要なノートがあれば事前にバックアップを取ってください。
        </span>
      </div>

      <div className="backup-panel__card">
        <span className="backup-panel__card-icon">
          <RestoreIcon />
        </span>
        <div className="backup-panel__card-body">
          <span className="backup-panel__card-title">
            ZIP からリストア
          </span>
          <p className="backup-panel__card-desc">
            「バックアップ」で作成した ZIP ファイルを選択し、保存先フォルダにそのまま展開します。展開後に DB を空にしてから MD ファイルから取り込み直し、ノート一覧を再構築します。
          </p>

          <ol className="backup-panel__steps">
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">1</span>
              <span className="backup-panel__step-text">
                バックアップ ZIP ファイルを選択
              </span>
            </li>
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">2</span>
              <span className="backup-panel__step-text">
                既存の保存先フォルダの内容を ZIP の中身で置き換え
              </span>
            </li>
            <li className="backup-panel__step">
              <span className="backup-panel__step-num">3</span>
              <span className="backup-panel__step-text">
                DB を空にして全 .md ファイルから取り込み直し（DB 完全再構築）
              </span>
            </li>
          </ol>

          <div className="backup-panel__actions">
            <button
              type="button"
              className="backup-panel__btn backup-panel__btn--danger"
              onClick={() => void handleRestore()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <Spinner />
                  {phase === 'extracting'
                    ? 'ZIP 展開中…'
                    : phase === 'importing'
                      ? 'DB 再構築中…'
                      : '処理中…'}
                </>
              ) : (
                <>
                  <RestoreIcon />
                  リストアを実行
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`backup-panel__notice backup-panel__notice--${
            message.type === 'err' ? 'err' : 'ok'
          }`}
        >
          {message.type === 'err' ? <AlertIcon /> : <CheckIcon />}
          <span>{message.text}</span>
        </div>
      )}
    </div>
  );
}

// ----- バックアップ / リストア用アイコン -----

function ArchiveIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 13h4" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// ----- 初期化パネル -----
// ノート / フォルダ / 設定 / メディアファイルを **すべて削除** して再起動する。
// 誤操作防止のため、テキストボックスに正確に「初期化」と入力されないと
// 実行ボタンが押せないようにしている。
function ResetPanel() {
  const REQUIRED = '初期化';
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const canReset = confirmText === REQUIRED && !busy;

  const handleReset = async () => {
    if (!canReset) return;
    if (
      !window.confirm(
        '本当に初期化しますか？\n\nDB（ノート一覧・フォルダ・設定）が削除され、アプリが再起動します。\n\n保存先フォルダの .md ファイル等は残るので、再起動後に「同期」で取り込み直すことができます。',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await window.api.app.resetAll();
      // resetAll の中で app.relaunch + exit が走るのでこの後のコードは実行されない
    } catch (err) {
      setBusy(false);
      window.alert(
        '初期化に失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const isConfirmValid = confirmText === REQUIRED;

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">初期化</h3>

      {/* ----- 危険性バナー ----- */}
      <div className="reset-panel__banner">
        <span className="reset-panel__banner-icon">
          <ResetWarnIcon />
        </span>
        <div className="reset-panel__banner-body">
          <span className="reset-panel__banner-title">
            アプリを完全に初期化します
          </span>
          <p className="reset-panel__banner-desc">
            DB に登録されているノート・フォルダ・設定が削除され、アプリが再起動します。実行前に重要なノートがあればエクスポート / 同期しておくことを推奨します。
          </p>
        </div>
      </div>

      {/* ----- 削除されるもの / 残るもの ----- */}
      <div className="reset-panel__lists">
        <div className="reset-panel__list-card">
          <h4 className="reset-panel__list-title reset-panel__list-title--del">
            <ResetTrashIcon />
            削除されるもの
          </h4>
          <ul className="reset-panel__list-items">
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--del">
                <CrossSmallIcon />
              </span>
              ノート一覧（DB）
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--del">
                <CrossSmallIcon />
              </span>
              フォルダ構造
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--del">
                <CrossSmallIcon />
              </span>
              アプリ設定（テーマ・保存先など）
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--del">
                <CrossSmallIcon />
              </span>
              タブ復元情報
            </li>
          </ul>
        </div>

        <div className="reset-panel__list-card">
          <h4 className="reset-panel__list-title reset-panel__list-title--keep">
            <ResetKeepIcon />
            残るもの
          </h4>
          <ul className="reset-panel__list-items">
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--keep">
                <CheckIcon />
              </span>
              保存先フォルダの <code>.md</code> ファイル
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--keep">
                <CheckIcon />
              </span>
              画像・添付ファイル
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--keep">
                <CheckIcon />
              </span>
              他デバイスの同期データ
            </li>
            <li className="reset-panel__list-item">
              <span className="reset-panel__list-icon reset-panel__list-icon--keep">
                <CheckIcon />
              </span>
              ダウンロードしたプラグイン
            </li>
          </ul>
        </div>
      </div>

      {/* ----- 確認入力 ----- */}
      <div className="reset-panel__subhead">
        <h4 className="reset-panel__subhead-title">確認</h4>
      </div>

      <div className="reset-panel__confirm-card">
        <span className="reset-panel__confirm-label">
          実行を確定するには <code>{REQUIRED}</code> と入力してください
        </span>
        <input
          type="text"
          className={`reset-panel__confirm-input ${
            isConfirmValid ? 'is-valid' : ''
          }`}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={REQUIRED}
          aria-label="確認テキスト"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="reset-panel__confirm-hint">
          再起動後はサイドバーの「同期」ボタンで保存先フォルダから取り込み直せます。
        </p>
      </div>

      <div className="reset-panel__actions">
        <button
          type="button"
          className="reset-panel__btn"
          onClick={() => void handleReset()}
          disabled={!canReset}
        >
          {busy ? (
            <>
              <Spinner />
              初期化中…
            </>
          ) : (
            <>
              <ResetTrashIcon />
              初期化を実行
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ----- 初期化パネル用アイコン -----

function ResetWarnIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4" />
      <path d="M12 18v.01" />
    </svg>
  );
}

function ResetTrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function ResetKeepIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l8 4v6a9 9 0 0 1-8 8 9 9 0 0 1-8-8V7l8-4z" />
    </svg>
  );
}

function CrossSmallIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
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
