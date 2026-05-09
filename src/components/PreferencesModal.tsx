import { useEffect, useMemo, useState } from 'react';
import {
  AI_PROVIDER_OPTIONS,
  DATE_FORMAT_OPTIONS,
  DEFAULT_SETTINGS,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  isValidProtectionPassword,
  type AiProvider,
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
  const isChatGpt = settings.aiProvider === 'chatgpt';

  const handleProviderChange = (provider: AiProvider) => {
    onChange('aiProvider', provider);
    if (provider === 'chatgpt' && !CHATGPT_MODEL_OPTIONS.includes(settings.aiModel)) {
      onChange('aiModel', CHATGPT_MODEL_OPTIONS[0]);
    }
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">AI</h3>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-ai-provider">
            AIプロバイダ
          </label>
          <p className="prefs__field-desc">
            ノート上部の「要約」ボタンで使う接続先を選択します。
          </p>
        </div>
        <select
          id="prefs-ai-provider"
          className="prefs__select"
          value={settings.aiProvider}
          onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
        >
          {AI_PROVIDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-ai-token">
            Token
          </label>
          <p className="prefs__field-desc">
            選択したAIサービスのAPIトークンを保存します。
          </p>
        </div>
        <input
          id="prefs-ai-token"
          className="prefs__text-input prefs__text-input--wide"
          type="password"
          value={settings.aiToken}
          placeholder="API token"
          autoComplete="off"
          onChange={(e) => onChange('aiToken', e.target.value)}
        />
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-ai-endpoint">
            Endpoint
          </label>
          <p className="prefs__field-desc">
            空欄の場合はプロバイダの既定エンドポイントを使います。一般的なAIとCopilotではOpenAI互換のURLを指定してください。
          </p>
        </div>
        <input
          id="prefs-ai-endpoint"
          className="prefs__text-input prefs__text-input--wide"
          type="url"
          value={settings.aiEndpoint}
          placeholder="https://..."
          onChange={(e) => onChange('aiEndpoint', e.target.value)}
        />
      </div>

      <div className="prefs__field">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-ai-model">
            Model
          </label>
          <p className="prefs__field-desc">
            {isChatGpt
              ? 'ChatGPTで使用するモデルを選択します。'
              : '空欄の場合はプロバイダ別の既定モデルを使います。'}
          </p>
        </div>
        {isChatGpt ? (
          <select
            id="prefs-ai-model"
            className="prefs__select"
            value={
              CHATGPT_MODEL_OPTIONS.includes(settings.aiModel)
                ? settings.aiModel
                : CHATGPT_MODEL_OPTIONS[0]
            }
            onChange={(e) => onChange('aiModel', e.target.value)}
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
            className="prefs__text-input prefs__text-input--wide"
            type="text"
            value={settings.aiModel}
            placeholder="model name"
            onChange={(e) => onChange('aiModel', e.target.value)}
          />
        )}
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

// ----- テンプレートパネル -----

function TemplatePanel({ settings, onChange }: PanelProps) {
  const [draft, setDraft] = useState(settings.templateFolder);
  const [saved, setSaved] = useState(false);

  // 設定が外部で変わった場合に追従
  useEffect(() => {
    setDraft(settings.templateFolder);
  }, [settings.templateFolder]);

  const handleSave = () => {
    const trimmed = draft.trim().replace(/^\/+|\/+$/g, '') || 'template';
    onChange('templateFolder', trimmed);
    setDraft(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">テンプレート</h3>

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label" htmlFor="prefs-template-folder">
            テンプレートフォルダ名
          </label>
          <p className="prefs__field-desc">
            サイドバーのこのフォルダ配下にあるノートが、
            編集ツールバーのテンプレートボタンから挿入できるテンプレートとして表示されます。
            フォルダが無い場合は、新規ノート作成時にファイル名を
            「<code>{draft || 'template'}/テンプレート名</code>」で作成してください。
          </p>
        </div>
        <div className="prefs__inline">
          <input
            id="prefs-template-folder"
            className="prefs__text-input"
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
            style={{ width: 180 }}
          />
          <button type="button" className="prefs__save-btn" onClick={handleSave}>
            保存
          </button>
          {saved && (
            <span className="prefs__message is-ok" style={{ marginLeft: 8 }}>
              保存しました
            </span>
          )}
        </div>
      </div>
    </div>
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

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label">ファイル保存先フォルダ</label>
          <p className="prefs__field-desc">
            ノート本文 (.md) / 画像 / 添付ファイルを保存するフォルダを指定します。
            既定では OS のアプリデータ領域 (<code>userData</code>) に保存されます。
            iCloud Drive や Dropbox / Google Drive のフォルダを選べば、
            OS の同期クライアントが他端末と自動で同期してくれます。
          </p>
          <p className="prefs__field-desc">
            <strong>注意:</strong>{' '}
            保存先を変更しても既存のファイルは自動的に移動されません。
            旧フォルダから新フォルダへ <code>notes/</code>, <code>images/</code>,
            <code>attachments/</code> を手動でコピーしてください。
          </p>
        </div>

        <dl className="share-status">
          <dt>現在の設定値</dt>
          <dd>
            {isCustom ? (
              <code>{settings.storagePath}</code>
            ) : (
              <span className="share-status__dim">
                既定（アプリ内 userData）
              </span>
            )}
          </dd>
          <dt>実際の保存先</dt>
          <dd>
            {resolvedRoot ? (
              <code>{resolvedRoot}</code>
            ) : (
              <span className="share-status__dim">取得中…</span>
            )}
          </dd>
        </dl>

        <div className="prefs__inline">
          <button
            type="button"
            className="prefs__save-btn"
            onClick={() => void handleChoose()}
            disabled={busy}
          >
            フォルダを選択
          </button>
          <button
            type="button"
            className="prefs__save-btn prefs__save-btn--ghost"
            onClick={handleResetDefault}
            disabled={!isCustom || busy}
          >
            既定に戻す
          </button>
        </div>

        <div className="prefs__field-main" style={{ marginTop: 8 }}>
          <label className="prefs__field-label">データを上書き</label>
          <p className="prefs__field-desc">
            DB に登録されている全ノートのメタ情報（タイトル / フォルダ /
            タグ / 保護フラグ / タイムスタンプ）と本文を、保存先フォルダの{' '}
            <code>.md</code> ファイルに <strong>強制的に書き直し</strong>ます。
            ファイル先頭には YAML front-matter が付与され、別端末から取り込んだ
            時もメタ情報が復元できるようになります。
          </p>
        </div>
        <div className="prefs__inline">
          <button
            type="button"
            className="prefs__save-btn"
            onClick={() => void handleOverwriteAll()}
            disabled={busy}
          >
            データを上書き
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

  return (
    <div className="prefs__section">
      <h3 className="prefs__section-title">初期化</h3>

      <div className="prefs__field prefs__field--stack">
        <div className="prefs__field-main">
          <label className="prefs__field-label">アプリの初期化</label>
          <p className="prefs__field-desc">
            DB（ノート一覧・フォルダ・設定）をすべて消去し、アプリを再起動します。
            保存先フォルダの <code>.md</code> ファイル等は <strong>残ります</strong>。
            iCloud 等の共有ストレージを使っている場合でも他デバイスに影響しません。
          </p>
          <p className="prefs__field-desc">
            再起動後、サイドバーの「同期」ボタンを押すと保存先フォルダの
            ファイルが読み込まれ、ノート一覧が復元できます。
          </p>
          <p className="prefs__field-desc">
            実行するには下のテキストボックスに <code>{REQUIRED}</code>{' '}
            と入力してください。
          </p>
        </div>

        <input
          type="text"
          className="rename-body__input"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={REQUIRED}
          aria-label="確認テキスト"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="prefs__inline">
          <button
            type="button"
            className="prefs__save-btn prefs__save-btn--danger"
            onClick={() => void handleReset()}
            disabled={!canReset}
          >
            {busy ? '初期化中…' : '初期化を実行'}
          </button>
        </div>
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
