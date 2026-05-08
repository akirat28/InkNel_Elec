import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import ActivityBar from './components/ActivityBar';
import AiChatPanel from './components/AiChatPanel';
import Editor, { type EditorHandle } from './components/Editor';
import EditorToolbar from './components/EditorToolbar';
import Preview from './components/Preview';
import Sidebar, {
  type SidebarMode,
  type SidebarHandle,
} from './components/Sidebar';
import NoteHeader from './components/NoteHeader';
import TabBar from './components/TabBar';
import TagBar from './components/TagBar';
import PreferencesModal from './components/PreferencesModal';
import FindDialog from './components/FindDialog';
import PasswordDialog from './components/PasswordDialog';
import RenameDialog from './components/RenameDialog';
import ReplaceDialog from './components/ReplaceDialog';
import logoUrl from './assets/logo.png';
import {
  DEFAULT_SETTINGS,
  FONT_FAMILY_OPTIONS,
  parseSettings,
  settingToRecord,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  type AppSettings,
} from './settings';
import {
  extractAttachmentRefs,
  extractImageRefs,
} from './utils/mediaRefs';
import { buildPath, parsePath } from './utils/notePath';
import type { AiAction, NoteMeta } from './global';

export const SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH_MIN;
export const SIDEBAR_MAX_WIDTH = SIDEBAR_WIDTH_MAX;
export const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_WIDTH_DEFAULT;

type ViewKey = 'edit' | 'preview';

const SAVE_DEBOUNCE_MS = 300;
const NOTE_DRAG_TYPE = 'application/x-inknel-note-id';
const AI_CHAT_WIDTH_SETTING_KEY = 'ui.aiChatWidth';
const AI_CHAT_WIDTH_DEFAULT = 360;
const AI_CHAT_WIDTH_MIN = 280;
const AI_CHAT_WIDTH_MAX = 720;
const AI_CHAT_SPLITTER_WIDTH = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseAiChatWidth(raw: string | undefined): number {
  if (!raw) return AI_CHAT_WIDTH_DEFAULT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return AI_CHAT_WIDTH_DEFAULT;
  return clamp(parsed, AI_CHAT_WIDTH_MIN, AI_CHAT_WIDTH_MAX);
}

export default function App() {
  const isPreferencesWindow =
    window.location.hash === '#preferences' ||
    window.location.hash === '#/preferences';
  // ----- ノート一覧 / 選択中ノート -----
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [editingFolder, setEditingFolder] = useState<string>('');
  const [editingTags, setEditingTags] = useState<string[]>([]);

  // ----- タブ状態 -----
  // 開いているノート ID のリスト（順序 = タブの表示順）
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  // タブごとの表示モード（edit / preview）。キーはノート ID
  const [tabViews, setTabViews] = useState<Record<string, ViewKey>>({});

  // アクティブタブの view モード（tabViews から導出）
  const view: ViewKey = activeId ? tabViews[activeId] ?? 'preview' : 'preview';
  const setView = useCallback(
    (next: ViewKey) => {
      if (!activeId) return;
      setTabViews((prev) => ({ ...prev, [activeId]: next }));
    },
    [activeId],
  );

  // ----- UI 状態 -----
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [aiChatWidth, setAiChatWidth] = useState<number>(AI_CHAT_WIDTH_DEFAULT);
  const [aiChatResizing, setAiChatResizing] = useState<boolean>(false);
  const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false);
  const [replaceOpen, setReplaceOpen] = useState<boolean>(false);
  const [findOpen, setFindOpen] = useState<boolean>(false);
  const [aiChatOpen, setAiChatOpen] = useState<boolean>(false);

  // ----- 保護の解錠状態 -----
  // セッション中に正しいパスワードを入れた対象ノート ID の集合。
  // タブを閉じると該当 ID を除く（= 閉じてから再度開くと再ロック）
  const [unlockedNoteIds, setUnlockedNoteIds] = useState<Set<string>>(
    () => new Set<string>(),
  );
  // セッション中にパスワードで解錠したシークレットノート ID の集合
  // （アプリ再起動でクリア。secretLock-OFF にしたノートも含まれて良い）
  const [unlockedSecretIds, setUnlockedSecretIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // パスワードダイアログの用途。null の場合はダイアログを閉じている。
  type PasswordPurpose =
    | { kind: 'unlock-edit' } // 編集モードに切替時の解錠
    | { kind: 'unprotect'; noteId: string } // 保護解除
    | { kind: 'view-secret'; noteId: string } // シークレットノートを開く
    | { kind: 'unset-secret'; noteId: string }; // シークレット解除
  const [passwordPurpose, setPasswordPurpose] =
    useState<PasswordPurpose | null>(null);
  const passwordDialogOpen = passwordPurpose !== null;

  // ----- 編集セッション中に本文に存在したメディア参照 -----
  // ノートを開いた瞬間の参照 + 編集中に追加された参照を蓄積する。
  // 編集→プレビュー切替時に「セッション中に存在したが現在は無い」ものを GC 候補にする。
  const sessionImagesRef = useRef<Set<string>>(new Set());
  const sessionAttachmentsRef = useRef<Set<string>>(new Set());

  // ----- アプリ設定 -----
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // ----- 検索履歴（新しい順、メモリ保持。persistモード時はDBにも保存） -----
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // ----- サイドバー幅の保存タイマ（ドラッグリサイズ時のみ保存） -----
  const sidebarWidthSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleSidebarResize = useCallback((next: number) => {
    setSidebarWidth(next);
    if (sidebarWidthSaveTimer.current) {
      clearTimeout(sidebarWidthSaveTimer.current);
    }
    sidebarWidthSaveTimer.current = setTimeout(() => {
      sidebarWidthSaveTimer.current = null;
      void window.api.settings.set('ui.sidebarWidth', String(next));
    }, 300);
  }, []);

  // テーマを document.documentElement に反映
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  // フォント設定を CSS 変数として documentElement に反映
  // メイン画面（ノート本文）: --note-font-family / --note-font-size
  useEffect(() => {
    const opt = FONT_FAMILY_OPTIONS.find((o) => o.value === settings.fontFamily);
    if (opt) {
      document.documentElement.style.setProperty(
        '--note-font-family',
        opt.cssValue,
      );
    }
  }, [settings.fontFamily]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--note-font-size',
      `${settings.fontSize}px`,
    );
  }, [settings.fontSize]);

  // サイドメニュー: --sidebar-font-family / --sidebar-font-size
  useEffect(() => {
    const opt = FONT_FAMILY_OPTIONS.find(
      (o) => o.value === settings.sidebarFontFamily,
    );
    if (opt) {
      document.documentElement.style.setProperty(
        '--sidebar-font-family',
        opt.cssValue,
      );
    }
  }, [settings.sidebarFontFamily]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-font-size',
      `${settings.sidebarFontSize}px`,
    );
  }, [settings.sidebarFontSize]);

  // 検索履歴を SQLite に保存（persist モード時のみ）
  const persistSearchHistory = useCallback(
    async (list: string[], mode: AppSettings['searchHistoryMode']) => {
      if (mode === 'persist') {
        await window.api.settings.set(
          'search.history',
          JSON.stringify(list),
        );
      }
    },
    [],
  );

  const handleSettingChange = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      const prev = settings;
      const nextSettings: AppSettings = { ...prev, [key]: value };
      setSettings(nextSettings);
      const record = settingToRecord(key, value);
      await window.api.settings.set(record.key, record.value);

      // 検索履歴の件数が縮小された場合は既存履歴をプルーン
      if (key === 'searchHistoryLimit') {
        const limit = value as number;
        setSearchHistory((current) => {
          const pruned = current.slice(0, limit);
          void persistSearchHistory(pruned, nextSettings.searchHistoryMode);
          return pruned;
        });
      }

      // 保存方式が reset → persist に切り替わったら現状の履歴を保存
      if (
        key === 'searchHistoryMode' &&
        prev.searchHistoryMode === 'reset' &&
        value === 'persist'
      ) {
        setSearchHistory((current) => {
          void window.api.settings.set(
            'search.history',
            JSON.stringify(current),
          );
          return current;
        });
      }
    },
    [persistSearchHistory, settings],
  );

  // 履歴に追加（新しい順、重複除去、上限プルーン）
  const handleAddSearchHistory = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSearchHistory((current) => {
        const filtered = current.filter((h) => h !== trimmed);
        const next = [trimmed, ...filtered].slice(0, settings.searchHistoryLimit);
        void persistSearchHistory(next, settings.searchHistoryMode);
        return next;
      });
    },
    [
      settings.searchHistoryLimit,
      settings.searchHistoryMode,
      persistSearchHistory,
    ],
  );

  // ----- Editor へのコマンド呼び出し用 ref -----
  const editorRef = useRef<EditorHandle>(null);
  const sidebarRef = useRef<SidebarHandle>(null);
  const aiChatWidthRef = useRef<number>(AI_CHAT_WIDTH_DEFAULT);

  // ----- 設定メニュー購読 -----
  useEffect(() => {
    return window.api?.onOpenPreferences(() => {
      void window.api.openPreferencesWindow();
    });
  }, []);

  useEffect(() => {
    return window.api?.onSettingsChanged(() => {
      void (async () => {
        const rawSettings = await window.api.settings.getAll();
        const parsed = parseSettings(rawSettings);
        setSettings(parsed);
        setSidebarWidth(parsed.sidebarWidth);
        setAiChatWidth(parseAiChatWidth(rawSettings[AI_CHAT_WIDTH_SETTING_KEY]));
      })();
    });
  }, []);

  useEffect(() => {
    aiChatWidthRef.current = aiChatWidth;
  }, [aiChatWidth]);

  useEffect(() => {
    if (!aiChatResizing) return;

    const handleMove = (e: MouseEvent) => {
      const next = clamp(
        window.innerWidth - e.clientX - AI_CHAT_SPLITTER_WIDTH,
        AI_CHAT_WIDTH_MIN,
        AI_CHAT_WIDTH_MAX,
      );
      setAiChatWidth(next);
    };
    const handleUp = () => {
      setAiChatResizing(false);
      void window.api.settings.set(
        AI_CHAT_WIDTH_SETTING_KEY,
        String(aiChatWidthRef.current),
      );
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [aiChatResizing]);

  // ----- 印刷メニュー購読 -----
  // メインプロセスの「印刷...」メニューが押されたら window.print() を呼び、
  // OS のプリントダイアログを開く。@media print の CSS で UI 周りは隠してある。
  //
  // macOS の「PDF として保存」のデフォルトファイル名は document.title から決まるため、
  // 印刷前にノート名へ一時的に書き換え、印刷後に元のタイトルへ戻す。
  // 現在のノートから「保存時のファイル名ベース」を組み立てる（スラッシュは " - " に）
  const buildDefaultExportName = useCallback((): string => {
    return (
      [editingFolder, editingTitle]
        .filter((s) => s.length > 0)
        .join(' - ') || '無題'
    );
  }, [editingFolder, editingTitle]);

  // 印刷（OS の印刷ダイアログ）を開く。document.title を一時的にノート名に変える。
  const triggerPrint = useCallback(() => {
    const originalTitle = document.title;
    const noteName = buildDefaultExportName();
    document.title = noteName;
    window.setTimeout(() => {
      try {
        window.print();
      } finally {
        document.title = originalTitle;
      }
    }, 0);
  }, [buildDefaultExportName]);

  useEffect(() => {
    return window.api?.onPrint(() => triggerPrint());
  }, [triggerPrint]);

  // ----- ケバブメニュー: PDF / Markdown 購読（印刷は onPrint で拾う） -----
  // 具体的なハンドラは下記 handleExportPdf / handleExportMarkdown。
  // 最新クロージャを呼ぶため ref 経由で発火する。
  const exportPdfRef = useRef<(() => void) | null>(null);
  const exportMarkdownRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return window.api?.ui?.onExportPdf(() => exportPdfRef.current?.());
  }, []);
  useEffect(() => {
    return window.api?.ui?.onExportMarkdown(() =>
      exportMarkdownRef.current?.(),
    );
  }, []);

  // ----- NoteHeader ケバブメニュー: PDF / Markdown / 印刷 -----
  // PDF は preview モードで出力したいので、edit 中なら一度 preview に切り替える。
  const handleExportPdf = useCallback(async () => {
    if (!activeId) return;
    const defaultName = buildDefaultExportName();
    const wasEdit = view === 'edit';
    if (wasEdit) setView('preview');
    // 次の描画フレームまで待ってから printToPDF を呼ぶ
    await new Promise((r) => window.setTimeout(r, wasEdit ? 120 : 0));
    const originalTitle = document.title;
    document.title = defaultName;
    try {
      await window.api.files.exportPdf(defaultName);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'PDF 出力に失敗しました',
      );
    } finally {
      document.title = originalTitle;
    }
  }, [activeId, buildDefaultExportName, view, setView]);

  const handleExportMarkdown = useCallback(async () => {
    if (!activeId) return;
    const defaultName = buildDefaultExportName();
    try {
      await window.api.files.exportMarkdown(defaultName, body);
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Markdown 保存に失敗しました',
      );
    }
  }, [activeId, body, buildDefaultExportName]);

  // ref に最新のハンドラを入れておく（購読側から呼ばれる）
  exportPdfRef.current = () => void handleExportPdf();
  exportMarkdownRef.current = () => void handleExportMarkdown();

  // ----- ファイル / ディレクトリインポートの進捗表示用 -----
  // フッターのプログレスバーで進捗を可視化する。
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
  } | null>(null);

  // ----- ファイル読み込み (.md インポート) -----
  // メニュー「ファイルの読み込み」押下で起動。OS のファイルダイアログで
  // .md ファイルを 1 つ以上選択し、それぞれを folder='読み込みファイル' で
  // ノートとして DB に追加する。
  const handleImportMd = useCallback(async () => {
    try {
      const imported = await window.api.notes.importMd();
      if (imported.length === 0) return;
      let lastId: string | null = null;
      const total = imported.length;
      setImportProgress({ current: 0, total, fileName: '' });
      for (let i = 0; i < imported.length; i++) {
        const file = imported[i];
        setImportProgress({
          current: i + 1,
          total,
          fileName: file.name || '無題',
        });
        const created = await window.api.notes.create({
          title: file.name || '無題',
          folder: '読み込みファイル',
          body: file.body,
        });
        lastId = created.id;
        // UI が進捗を描画できるように event loop に制御を返す
        await new Promise((r) => setTimeout(r, 0));
      }
      // ノート一覧を再取得
      const list = await window.api.notes.list();
      setNotes(list);
      if (lastId) {
        await selectNote(lastId, list);
      }
      setSidebarMode('files');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    } catch (err) {
      window.alert(
        'ファイルの読み込みに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setImportProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed]);

  useEffect(() => {
    return window.api?.onImportMd(() => void handleImportMd());
  }, [handleImportMd]);

  // ----- ディレクトリ読み込み -----
  // 選択したディレクトリ配下の .md を再帰走査して
  // 読み込みファイル/<ディレクトリ名>/<サブフォルダ>/<ノート> として
  // 一括インポートする。
  const handleImportDir = useCallback(async () => {
    try {
      const imported = await window.api.notes.importDir();
      if (imported.length === 0) return;
      let lastId: string | null = null;
      const total = imported.length;
      setImportProgress({ current: 0, total, fileName: '' });
      for (let i = 0; i < imported.length; i++) {
        const file = imported[i];
        setImportProgress({
          current: i + 1,
          total,
          fileName: file.subFolder
            ? `${file.subFolder}/${file.name || '無題'}`
            : file.name || '無題',
        });
        const folder = file.subFolder
          ? `読み込みファイル/${file.subFolder}`
          : '読み込みファイル';
        const created = await window.api.notes.create({
          title: file.name || '無題',
          folder,
          body: file.body,
        });
        lastId = created.id;
        // UI 更新のために event loop に譲る
        // 数十件以上あると毎回譲ると遅すぎるので 5 件ごと
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      const list = await window.api.notes.list();
      setNotes(list);
      if (lastId) {
        await selectNote(lastId, list);
      }
      setSidebarMode('files');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    } catch (err) {
      window.alert(
        'ディレクトリの読み込みに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      );
    } finally {
      setImportProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarCollapsed]);

  useEffect(() => {
    return window.api?.onImportDir(() => void handleImportDir());
  }, [handleImportDir]);

  // ----- 初回ロード -----
  useEffect(() => {
    void (async () => {
      if (isPreferencesWindow) {
        const rawSettings = await window.api.settings.getAll();
        const parsed = parseSettings(rawSettings);
        setSettings(parsed);
        setSidebarWidth(parsed.sidebarWidth);
        setAiChatWidth(parseAiChatWidth(rawSettings[AI_CHAT_WIDTH_SETTING_KEY]));
        return;
      }
      const [list, folderList, rawSettings] = await Promise.all([
        window.api.notes.list(),
        window.api.folders.list(),
        window.api.settings.getAll(),
      ]);
      setNotes(list);
      setFolders(folderList);
      const parsed = parseSettings(rawSettings);
      setSettings(parsed);
      // 永続化されたサイドバー幅を反映
      setSidebarWidth(parsed.sidebarWidth);
      setAiChatWidth(parseAiChatWidth(rawSettings[AI_CHAT_WIDTH_SETTING_KEY]));

      // 検索履歴: persist モード時のみ DB から復元
      if (parsed.searchHistoryMode === 'persist') {
        const raw = rawSettings['search.history'];
        if (raw) {
          try {
            const arr = JSON.parse(raw);
            if (
              Array.isArray(arr) &&
              arr.every((s) => typeof s === 'string')
            ) {
              setSearchHistory(arr.slice(0, parsed.searchHistoryLimit));
            }
          } catch {
            // 不正なJSON は無視
          }
        }
      }

      // ----- タブの復元 -----
      // 前回開いていたタブをリストアする。存在しない ID は除外。
      const existingIds = new Set(list.map((n) => n.id));
      let restoredTabs: string[] = [];
      const rawTabs = rawSettings['ui.openTabs'];
      if (rawTabs) {
        try {
          const arr = JSON.parse(rawTabs);
          if (Array.isArray(arr)) {
            restoredTabs = arr.filter(
              (s): s is string => typeof s === 'string' && existingIds.has(s),
            );
          }
        } catch {
          // 不正な JSON は無視
        }
      }
      if (restoredTabs.length > 0) {
        setOpenTabIds(restoredTabs);
        setTabViews(
          Object.fromEntries(restoredTabs.map((id) => [id, 'preview'])),
        );
        const savedActive = rawSettings['ui.activeTab'];
        const activeToLoad =
          savedActive && restoredTabs.includes(savedActive)
            ? savedActive
            : restoredTabs[0];
        await selectNote(activeToLoad, list);
      } else if (list.length > 0) {
        await selectNote(list[0].id, list);
      }

      // ----- 起動時のクラウド同期 -----
      // 共有プロバイダが設定されていたら、起動直後に双方向同期を走らせる。
      // 同期で新しいノートが引き込まれたら、notes 一覧を再取得して反映する。
      if (parsed.shareProvider !== 'none') {
        try {
          const result = await window.api.share.sync(parsed.shareProvider);
          if (result.pulled > 0) {
            const refreshed = await window.api.notes.list();
            setNotes(refreshed);
            // 開いているノートが更新されていたら再読み込み
            // （pulled > 0 でも現在開いているノートとは限らないので、
            //  全ノート再取得で十分）
          }
        } catch (err) {
          console.warn('[share] 起動時同期に失敗:', err);
          // 失敗してもアプリ起動は継続
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- タブの永続化 -----
  // openTabIds / activeId が変わるたびに settings に保存（デバウンス）。
  // 起動直後の初期化フェーズは書き込みを抑制するため、マウント完了後にのみ反映。
  const tabsPersistReady = useRef(false);
  useEffect(() => {
    if (isPreferencesWindow) return;
    // 初回レンダリング時は skip（初期ロードが終わった次のレンダリングから有効化）
    if (!tabsPersistReady.current) {
      tabsPersistReady.current = true;
      return;
    }
    const timer = setTimeout(() => {
      void window.api.settings.set(
        'ui.openTabs',
        JSON.stringify(openTabIds),
      );
      void window.api.settings.set('ui.activeTab', activeId ?? '');
    }, 300);
    return () => clearTimeout(timer);
  }, [openTabIds, activeId]);

  // ----- ノート選択（保留中の保存をフラッシュしてから切り替え） -----
  // 保護ノートとシークレットノートは、セッション中に未解錠なら
  // パスワードダイアログを先に開き、認証後に再度この関数が呼ばれて
  // 実際にロードされる。
  //
  // 第 3 引数 `bypassLockChecks` は、パスワード認証後に handlePasswordSubmit から
  // 再呼び出しする時に true を渡す。useCallback のクロージャキャプチャにより
  // setTimeout が掴んでいる state が古いままなので、明示的に
  // チェックをバイパスしないとダイアログが再度開いてしまう。
  const selectNote = useCallback(
    async (
      id: string,
      fromList?: NoteMeta[],
      bypassLockChecks?: boolean,
    ) => {
      const list = fromList ?? notes;
      const meta = list.find((n) => n.id === id);
      if (!meta) return;

      if (!bypassLockChecks) {
        // シークレットかつ未解錠 → パスワード要求
        if (meta.secret && !unlockedSecretIds.has(id)) {
          setPasswordPurpose({ kind: 'view-secret', noteId: id });
          return;
        }
        // ※ 保護ノートは表示(プレビュー)は自由。
        //   編集モードへの切替時に handleSelectEditOrPreview で
        //   unlock-edit ダイアログを表示する。
      }

      await flushPendingSaves();
      const loadedBody = await window.api.notes.readBody(id);
      setActiveId(id);
      setEditingTitle(meta.title);
      setEditingFolder(meta.folder);
      setEditingTags(meta.tags ?? []);
      setBody(loadedBody);
      // セッショントラッキング: 初期メディア参照を記録
      sessionImagesRef.current = extractImageRefs(loadedBody);
      sessionAttachmentsRef.current = extractAttachmentRefs(loadedBody);
      // タブリストに追加（まだ開いていなければ）
      setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      // タブごとの view モード: 初回は preview、既存なら保持
      setTabViews((prev) => (prev[id] ? prev : { ...prev, [id]: 'preview' }));

      // ----- バックグラウンドでクラウドの最新を確認 -----
      // ローカル版をまず即座に表示した後で、クラウドの方が新しければ pull して
      // body と notes 一覧を更新する。
      // 取り込み中は syncingNoteId を立てて操作をブロック（オーバーレイ表示）。
      // 障害等でチェック失敗した場合はブロックを解除してそのまま操作可能にする。
      if (settings.shareProvider !== 'none') {
        setSyncingNoteId(id);
        void window.api.share
          .checkNote(settings.shareProvider, id)
          .then(async (result) => {
            if (result === 'pulled') {
              // クラウドが新しかった → 表示中のノートを再読み込み
              const refreshedList = await window.api.notes.list();
              setNotes(refreshedList);
              const refreshedMeta = refreshedList.find((n) => n.id === id);
              if (refreshedMeta) {
                setEditingTitle(refreshedMeta.title);
                setEditingFolder(refreshedMeta.folder);
                setEditingTags(refreshedMeta.tags ?? []);
              }
              const refreshedBody = await window.api.notes.readBody(id);
              setBody(refreshedBody);
              sessionImagesRef.current = extractImageRefs(refreshedBody);
              sessionAttachmentsRef.current = extractAttachmentRefs(refreshedBody);
            }
            // 'pushed' / 'same' / 'skip' → UI 変更不要
            setSyncingNoteId(null);
          })
          .catch(() => {
            // ネットワーク障害等: ブロックを解除してそのまま操作可能
            setSyncingNoteId(null);
          });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, unlockedSecretIds, settings.shareProvider],
  );

  // ----- 自動保存（デバウンス） -----
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingBody = useRef<{ id: string; body: string } | null>(null);
  const pendingMeta = useRef<{
    id: string;
    title: string;
    folder: string;
    tags: string[];
  } | null>(null);

  const flushPendingSaves = useCallback(async () => {
    if (bodyTimer.current) {
      clearTimeout(bodyTimer.current);
      bodyTimer.current = null;
    }
    if (metaTimer.current) {
      clearTimeout(metaTimer.current);
      metaTimer.current = null;
    }
    if (pendingBody.current) {
      const { id, body } = pendingBody.current;
      pendingBody.current = null;
      await window.api.notes.updateBody(id, body);
    }
    if (pendingMeta.current) {
      const { id, title, folder, tags } = pendingMeta.current;
      pendingMeta.current = null;
      const updated = await window.api.notes.updateMeta(id, {
        title,
        folder,
        tags,
      });
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.id ? updated : n)),
      );
    }
  }, []);

  const handleBodyChange = useCallback(
    (next: string) => {
      setBody(next);
      // 編集中に新しく追加されたメディア参照をセッションに蓄積
      // (削除→Undo→再削除のような操作でも追跡できるよう union を取る)
      for (const f of extractImageRefs(next)) sessionImagesRef.current.add(f);
      for (const f of extractAttachmentRefs(next))
        sessionAttachmentsRef.current.add(f);

      if (!activeId) return;
      pendingBody.current = { id: activeId, body: next };
      if (bodyTimer.current) clearTimeout(bodyTimer.current);
      bodyTimer.current = setTimeout(async () => {
        bodyTimer.current = null;
        if (!pendingBody.current) return;
        const { id, body } = pendingBody.current;
        pendingBody.current = null;
        await window.api.notes.updateBody(id, body);
        const list = await window.api.notes.list();
        setNotes(list);
      }, SAVE_DEBOUNCE_MS);
    },
    [activeId],
  );

  const scheduleMetaSave = useCallback(
    (title: string, folder: string, tags: string[]) => {
      if (!activeId) return;
      pendingMeta.current = { id: activeId, title, folder, tags };
      if (metaTimer.current) clearTimeout(metaTimer.current);
      metaTimer.current = setTimeout(async () => {
        metaTimer.current = null;
        if (!pendingMeta.current) return;
        const { id, title, folder, tags } = pendingMeta.current;
        pendingMeta.current = null;
        const updated = await window.api.notes.updateMeta(id, {
          title,
          folder,
          tags,
        });
        setNotes((prev) =>
          prev
            .map((n) => (n.id === updated.id ? updated : n))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }, SAVE_DEBOUNCE_MS);
    },
    [activeId],
  );

  // ファイル名（パス形式）入力の変更ハンドラ。
  // "階層1/テスト1" のようなスラッシュ区切り文字列を folder と title に分解して保存する。
  const handleNameChange = (path: string) => {
    const { folder, title } = parsePath(path);
    setEditingTitle(title);
    setEditingFolder(folder);
    scheduleMetaSave(title, folder, editingTags);
  };

  // タグバー（バッジ入力）の変更ハンドラ
  const handleTagsChange = (next: string[]) => {
    setEditingTags(next);
    scheduleMetaSave(editingTitle, editingFolder, next);
  };

  // ----- 新規ノート -----
  /** 指定フォルダに「無題」ノートを作成し、edit モードで開く共通処理。 */
  const createNoteInFolder = async (folder: string) => {
    await flushPendingSaves();
    const created = await window.api.notes.create({
      title: '無題',
      folder,
      body: '',
    });
    const list = await window.api.notes.list();
    setNotes(list);
    setActiveId(created.id);
    setEditingTitle(created.title);
    setEditingFolder(created.folder);
    setEditingTags(created.tags ?? []);
    setBody('');
    // 新規ノートをタブに追加し、初期 view は edit モード
    setOpenTabIds((prev) =>
      prev.includes(created.id) ? prev : [...prev, created.id],
    );
    setTabViews((prev) => ({ ...prev, [created.id]: 'edit' }));
    setSidebarMode('files');
    // 作成先フォルダ（とその全祖先）を展開して、作成したノートが見えるようにする
    if (created.folder) {
      sidebarRef.current?.expandFolder(created.folder);
    }
  };

  // ヘッダ「+ 新規ノート」やショートカットから: 現在選択中ノートと同じ階層に作る
  const handleCreateNote = () => createNoteInFolder(editingFolder);

  // フォルダ右クリック → 「ノートの作成」: そのフォルダ配下に作る
  const handleCreateNoteInFolder = (folderPath: string) =>
    createNoteInFolder(folderPath);

  // ----- メニュー「メモの作成」(CmdOrCtrl+N) 購読 -----
  // handleCreateNote はクロージャが毎回再生成されるため ref 経由で最新を呼ぶ
  const handleCreateNoteRef = useRef(handleCreateNote);
  handleCreateNoteRef.current = handleCreateNote;
  useEffect(() => {
    return window.api?.onCreateNote(() => void handleCreateNoteRef.current());
  }, []);

  // ----- メニュー「検索...」(CmdOrCtrl+F) 購読 -----
  // 編集中ノートの本文内検索ダイアログを開く。編集モードに切替えてから表示。
  useEffect(() => {
    return window.api?.onFind(() => {
      if (activeId && view !== 'edit') setView('edit');
      setFindOpen(true);
    });
  }, [activeId, view, setView]);

  // ----- メニュー「置換...」(CmdOrCtrl+R) 購読 -----
  // 編集中ノートの本文に対して検索・置換するダイアログを開く。
  // 編集モード（view === 'edit'）に切替えてから開く。
  useEffect(() => {
    return window.api?.onReplace(() => {
      if (activeId && view !== 'edit') setView('edit');
      setReplaceOpen(true);
    });
  }, [activeId, view, setView]);

  // ----- ストレージ同期からの通知でノート一覧を再取得 -----
  useEffect(() => {
    const handler = async () => {
      try {
        const [list, folderList] = await Promise.all([
          window.api.notes.list(),
          window.api.folders.list(),
        ]);
        setNotes(list);
        setFolders(folderList);
      } catch {
        /* 失敗しても無視（次の操作でリトライ） */
      }
    };
    window.addEventListener('inknel:notes-changed', handler);
    return () => window.removeEventListener('inknel:notes-changed', handler);
  }, []);

  // ----- 他コンポーネント (StoragePanel 等) からの flush 要求 -----
  // 保留中の自動保存をディスクへ書き出してから resolve を呼ぶ。
  // detail.resolve に Promise の解決関数が入っている。
  useEffect(() => {
    const handler = async (e: Event) => {
      const ev = e as CustomEvent<{ resolve?: () => void }>;
      try {
        await flushPendingSaves();
      } finally {
        ev.detail?.resolve?.();
      }
    };
    window.addEventListener(
      'inknel:flush-pending-saves',
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        'inknel:flush-pending-saves',
        handler as EventListener,
      );
  }, [flushPendingSaves]);

  // ----- タブを閉じる -----
  // openTabIds から除去し、閉じた時の隣タブをアクティブ化する。
  // 閉じたタブに紐づく view モード / 解錠状態もクリアする。
  const closeTab = useCallback(
    async (id: string) => {
      const idx = openTabIds.indexOf(id);
      if (idx < 0) return;
      const isClosingActive = id === activeId;

      if (isClosingActive) {
        await flushPendingSaves();
      }

      const nextTabs = openTabIds.filter((x) => x !== id);
      setOpenTabIds(nextTabs);
      setTabViews((prev) => {
        if (!(id in prev)) return prev;
        const { [id]: _omit, ...rest } = prev;
        return rest;
      });
      setUnlockedNoteIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      if (isClosingActive) {
        const nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)] ?? null;
        if (nextActive) {
          await selectNote(nextActive, undefined, true);
        } else {
          setActiveId(null);
          setEditingTitle('');
          setEditingFolder('');
          setEditingTags([]);
          setBody('');
        }
      }
    },
    [openTabIds, activeId, flushPendingSaves, selectNote],
  );

  // ----- 複数タブを一括で閉じる（右クリックメニューの「すべて閉じる」等） -----
  const closeTabs = useCallback(
    async (idsToClose: string[]) => {
      if (idsToClose.length === 0) return;
      const idsSet = new Set(idsToClose);
      const remaining = openTabIds.filter((x) => !idsSet.has(x));
      const closingActive = activeId !== null && idsSet.has(activeId);

      if (closingActive) {
        await flushPendingSaves();
      }

      setOpenTabIds(remaining);
      setTabViews((prev) => {
        let changed = false;
        const next: Record<string, ViewKey> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!idsSet.has(k)) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
      setUnlockedNoteIds((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const v of prev) {
          if (!idsSet.has(v)) next.add(v);
          else changed = true;
        }
        return changed ? next : prev;
      });

      if (closingActive) {
        if (remaining.length === 0) {
          setActiveId(null);
          setEditingTitle('');
          setEditingFolder('');
          setEditingTags([]);
          setBody('');
        } else {
          // 元の activeId の位置より右で最初に残っているタブへ。
          // 無ければ左方向で最も近いものに。
          const oldIdx = openTabIds.indexOf(activeId!);
          let nextActive: string | null = null;
          for (let i = oldIdx + 1; i < openTabIds.length; i++) {
            if (!idsSet.has(openTabIds[i])) {
              nextActive = openTabIds[i];
              break;
            }
          }
          if (!nextActive) {
            for (let i = oldIdx - 1; i >= 0; i--) {
              if (!idsSet.has(openTabIds[i])) {
                nextActive = openTabIds[i];
                break;
              }
            }
          }
          if (nextActive) {
            await selectNote(nextActive, undefined, true);
          }
        }
      }
    },
    [openTabIds, activeId, flushPendingSaves, selectNote],
  );

  // ----- ノート削除（サイドバーのコンテキストメニューから呼ばれる） -----
  const handleDeleteNote = useCallback(
    async (id: string) => {
      // 削除対象が現在編集中のノートなら、保留中の保存はキャンセル
      if (id === activeId) {
        if (bodyTimer.current) clearTimeout(bodyTimer.current);
        if (metaTimer.current) clearTimeout(metaTimer.current);
        pendingBody.current = null;
        pendingMeta.current = null;
      }

      try {
        await window.api.notes.delete(id);
      } catch (err) {
        // メインプロセス側で保護されているノートは削除できない
        window.alert(
          err instanceof Error ? err.message : '削除に失敗しました',
        );
        return;
      }
      const list = await window.api.notes.list();
      setNotes(list);

      // 削除されたノートをタブリスト・タブ状態から除去
      const idx = openTabIds.indexOf(id);
      const wasOpen = idx >= 0;
      if (wasOpen) {
        const nextTabs = openTabIds.filter((x) => x !== id);
        setOpenTabIds(nextTabs);
        setTabViews((prev) => {
          if (!(id in prev)) return prev;
          const { [id]: _omit, ...rest } = prev;
          return rest;
        });
        setUnlockedNoteIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });

        if (id === activeId) {
          const nextActive =
            nextTabs[Math.min(idx, nextTabs.length - 1)] ?? null;
          if (nextActive) {
            await selectNote(nextActive, list, true);
          } else {
            setActiveId(null);
            setEditingTitle('');
            setEditingFolder('');
            setEditingTags([]);
            setBody('');
          }
        }
      } else if (id === activeId) {
        // フォールバック: タブに含まれない activeId が削除された場合
        setActiveId(null);
        setEditingTitle('');
        setEditingFolder('');
        setEditingTags([]);
        setBody('');
      }
    },
    [activeId, openTabIds, selectNote],
  );

  // ----- 名称変更ダイアログ（ファイル / フォルダ 共通） -----
  type RenameTarget =
    | { kind: 'note'; id: string; name: string }
    | {
        kind: 'folder';
        oldPath: string;
        parent: string;
        leafName: string;
      };
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);

  const handleStartRename = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      setRenameTarget({
        kind: 'note',
        id: noteId,
        name: buildPath(note.folder, note.title),
      });
    },
    [notes],
  );

  const handleStartRenameFolder = useCallback((folderPath: string) => {
    const segments = folderPath.split('/');
    const leafName = segments[segments.length - 1];
    const parent = segments.slice(0, -1).join('/');
    setRenameTarget({
      kind: 'folder',
      oldPath: folderPath,
      parent,
      leafName,
    });
  }, []);

  // ----- フォルダごと削除 -----
  // 確認ダイアログを出してから、フォルダ＋配下のノート・サブフォルダを全削除。
  const handleDeleteFolder = useCallback(
    async (folderPath: string) => {
      if (!folderPath) return;
      // 配下のノート数を数えて確認メッセージに含める
      const count = notes.filter(
        (n) => n.folder === folderPath || n.folder.startsWith(folderPath + '/'),
      ).length;
      const message =
        count > 0
          ? `「${folderPath}」と配下の ${count} 件のノートを削除します。元に戻せません。よろしいですか？`
          : `「${folderPath}」フォルダを削除します。よろしいですか？`;
      if (!window.confirm(message)) return;

      // アクティブノートが影響を受ける場合は保留分をフラッシュ
      await flushPendingSaves();

      try {
        await window.api.folders.deleteRecursive(folderPath);
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : 'フォルダの削除に失敗しました',
        );
        return;
      }

      // 一覧を再取得
      const [list, folderList] = await Promise.all([
        window.api.notes.list(),
        window.api.folders.list(),
      ]);
      setNotes(list);
      setFolders(folderList);

      // 削除されたノートをタブリスト・タブ状態から除去
      const existingIds = new Set(list.map((n) => n.id));
      const removedOpenIds = openTabIds.filter((id) => !existingIds.has(id));
      if (removedOpenIds.length > 0) {
        const nextTabs = openTabIds.filter((id) => existingIds.has(id));
        setOpenTabIds(nextTabs);
        setTabViews((prev) => {
          let changed = false;
          const next: Record<string, ViewKey> = {};
          for (const [k, v] of Object.entries(prev)) {
            if (existingIds.has(k)) next[k] = v;
            else changed = true;
          }
          return changed ? next : prev;
        });
        setUnlockedNoteIds((prev) => {
          let changed = false;
          const next = new Set<string>();
          for (const v of prev) {
            if (existingIds.has(v)) next.add(v);
            else changed = true;
          }
          return changed ? next : prev;
        });

        if (activeId && !existingIds.has(activeId)) {
          if (nextTabs.length > 0) {
            await selectNote(nextTabs[nextTabs.length - 1], list, true);
          } else {
            setActiveId(null);
            setEditingTitle('');
            setEditingFolder('');
            setEditingTags([]);
            setBody('');
          }
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, activeId, openTabIds, flushPendingSaves],
  );

  const handleRenameSubmit = useCallback(
    async (newName: string) => {
      if (!renameTarget) return;

      if (renameTarget.kind === 'note') {
        const { folder, title } = parsePath(newName);

        // アクティブノートを名称変更する場合は保留中の保存をフラッシュ
        if (renameTarget.id === activeId) {
          await flushPendingSaves();
        }

        try {
          await window.api.notes.updateMeta(renameTarget.id, {
            title,
            folder,
          });
        } catch {
          return;
        }

        const list = await window.api.notes.list();
        setNotes(list);

        if (renameTarget.id === activeId) {
          setEditingTitle(title);
          setEditingFolder(folder);
        }
      } else {
        // フォルダ名称変更
        const newLeaf = newName.trim().replace(/\//g, '');
        if (!newLeaf) return;
        const newPath = renameTarget.parent
          ? `${renameTarget.parent}/${newLeaf}`
          : newLeaf;
        if (newPath === renameTarget.oldPath) {
          setRenameTarget(null);
          return;
        }

        // アクティブノートが影響を受ける可能性があるので保留分を確定
        await flushPendingSaves();

        try {
          await window.api.folders.rename(renameTarget.oldPath, newPath);
        } catch {
          return;
        }

        // notes と folders の両方を再取得
        const [list, folderList] = await Promise.all([
          window.api.notes.list(),
          window.api.folders.list(),
        ]);
        setNotes(list);
        setFolders(folderList);

        // アクティブノートの editingFolder を再計算
        if (activeId) {
          const refreshed = list.find((n) => n.id === activeId);
          if (refreshed) {
            setEditingFolder(refreshed.folder);
          }
        }
      }

      setRenameTarget(null);
    },
    [renameTarget, activeId, flushPendingSaves],
  );

  // ----- ファイルツリーのドラッグ&ドロップでノートを別フォルダへ移動 -----
  const handleMoveNote = useCallback(
    async (noteId: string, targetFolder: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      if (note.folder === targetFolder) return; // 同じフォルダなら何もしない

      // 移動対象がアクティブノートなら、保留中の保存をフラッシュ
      // （ここで上書きされる前にユーザーの未保存編集を保存しておく）
      if (noteId === activeId) {
        await flushPendingSaves();
      }

      try {
        await window.api.notes.updateMeta(noteId, { folder: targetFolder });
      } catch {
        return;
      }

      // 一覧を再取得
      const list = await window.api.notes.list();
      setNotes(list);

      // アクティブノートを移動した場合は editingFolder も追従
      if (noteId === activeId) {
        setEditingFolder(targetFolder);
      }
    },
    [notes, activeId, flushPendingSaves],
  );

  // ----- ファイルツリーのドラッグ&ドロップでフォルダを別階層へ移動 -----
  // 選択中のフォルダ (oldPath) を newParent 配下へ移動する。
  // renameFolder を使い配下の全ノート・サブフォルダの folder 値を一括更新する。
  const handleMoveFolder = useCallback(
    async (oldPath: string, newParent: string) => {
      if (!oldPath) return;
      // 自身または自身の子孫への移動は拒否（Sidebar 側でもチェック済みだが二重で）
      if (newParent === oldPath) return;
      if (newParent.startsWith(oldPath + '/')) return;

      const segments = oldPath.split('/');
      const leafName = segments[segments.length - 1];
      const newPath = newParent ? `${newParent}/${leafName}` : leafName;
      if (newPath === oldPath) return;

      await flushPendingSaves();

      try {
        await window.api.folders.rename(oldPath, newPath);
      } catch {
        return;
      }

      const [list, folderList] = await Promise.all([
        window.api.notes.list(),
        window.api.folders.list(),
      ]);
      setNotes(list);
      setFolders(folderList);

      // アクティブノートが影響を受けていたら editingFolder を最新化
      if (activeId) {
        const refreshed = list.find((n) => n.id === activeId);
        if (refreshed) setEditingFolder(refreshed.folder);
      }
    },
    [activeId, flushPendingSaves],
  );

  // ----- ノートの保護フラグをトグル -----
  // 保護ON（next=true）: パスワード不要で即実行
  // 保護解除（next=false）: パスワードダイアログを開き、認証成功後に解除
  const handleToggleProtect = useCallback(
    async (id: string, next: boolean) => {
      if (!next) {
        setPasswordPurpose({ kind: 'unprotect', noteId: id });
        return;
      }

      await window.api.notes.setProtected(id, true);
      const list = await window.api.notes.list();
      setNotes(list);

      // 保護 ON にしたノートは解錠状態を破棄
      setUnlockedNoteIds((prev) => {
        if (!prev.has(id)) return prev;
        const nextSet = new Set(prev);
        nextSet.delete(id);
        return nextSet;
      });
      if (id === activeId && view === 'edit') {
        setView('preview');
      }
    },
    [activeId, view, setView],
  );

  // ----- ノートのシークレットフラグをトグル -----
  // シークレットON（next=true）: パスワード不要で即実行
  // シークレット解除（next=false）: パスワードダイアログを開き、認証成功後に解除
  const handleToggleSecret = useCallback(
    async (id: string, next: boolean) => {
      if (!next) {
        setPasswordPurpose({ kind: 'unset-secret', noteId: id });
        return;
      }

      await window.api.notes.setSecret(id, true);
      const list = await window.api.notes.list();
      setNotes(list);
      // 解除済み一覧から外す（次回開く時に再要求）
      setUnlockedSecretIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  // ----- 検索 IPC を SearchPanel に渡す -----
  const handleSearch = useCallback(
    (query: string) => window.api.notes.search(query),
    [],
  );

  // ----- ActivityBar ファイルアイコン -----
  const handleSelectFiles = () => {
    if (sidebarMode === 'files') {
      // 既に files モードなら折りたたみトグル
      setSidebarCollapsed((v) => !v);
    } else {
      setSidebarMode('files');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    }
  };

  // ----- ActivityBar 検索アイコン -----
  const handleSelectSearch = () => {
    if (sidebarMode === 'search') {
      setSidebarCollapsed((v) => !v);
    } else {
      setSidebarMode('search');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    }
  };

  // ----- ActivityBar タグアイコン -----
  const handleSelectTags = () => {
    if (sidebarMode === 'tags') {
      setSidebarCollapsed((v) => !v);
    } else {
      setSidebarMode('tags');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    }
  };

  // ----- ActivityBar 保存先アイコン (サイドバーを sync モードへ切替) -----
  const handleSelectStorage = () => {
    if (sidebarMode === 'sync') {
      setSidebarCollapsed((v) => !v);
    } else {
      setSidebarMode('sync');
      if (sidebarCollapsed) setSidebarCollapsed(false);
    }
  };

  // 現在バックグラウンドでクラウドチェック中のノート ID。
  // この ID のノートが activeId と一致していればオーバーレイを表示して操作をブロックする。
  const [syncingNoteId, setSyncingNoteId] = useState<string | null>(null);

  // ----- 同期状態管理 -----
  // SyncPanel から「同期開始」ボタンを押されたときに呼ばれる。
  // main プロセスで runSync が走り、進捗が share:progress イベントで届く。
  const [sharing, setSharing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<
    import('./global').ShareSyncProgress | null
  >(null);
  const [syncLastResult, setSyncLastResult] = useState<
    import('./global').ShareSyncResult | null
  >(null);
  const [syncLastError, setSyncLastError] = useState<string | null>(null);

  // 進捗イベント購読（マウント時に 1 回）
  useEffect(() => {
    const unsubscribe = window.api.share.onProgress((ev) => {
      setSyncProgress(ev);
    });
    return unsubscribe;
  }, []);

  const handleStartSync = async (): Promise<void> => {
    if (settings.shareProvider === 'none' || sharing) return;
    setSharing(true);
    setSyncProgress(null);
    setSyncLastError(null);
    try {
      const result = await window.api.share.sync(settings.shareProvider);
      setSyncLastResult(result);
      if (result.pulled > 0) {
        const refreshed = await window.api.notes.list();
        setNotes(refreshed);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncLastError(msg);
    } finally {
      setSharing(false);
      setSyncProgress(null);
    }
  };

  // 現在選択中ノートが「ロック状態」か判定
  const activeNoteMeta = activeId
    ? notes.find((n) => n.id === activeId) ?? null
    : null;
  const isActiveLocked =
    activeNoteMeta?.protected === true &&
    activeId !== null &&
    !unlockedNoteIds.has(activeId);
  const linkedNotes = activeNoteMeta
    ? activeNoteMeta.linkedNoteIds
        .map((id) => notes.find((n) => n.id === id))
        .filter((note): note is NoteMeta => Boolean(note))
    : [];

  const handleAddLinkedNote = useCallback(
    async (linkedNoteId: string) => {
      if (!activeId || activeId === linkedNoteId) return;
      try {
        const updated = await window.api.notes.addLink(activeId, linkedNoteId);
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : 'ノートの連携に失敗しました',
        );
      }
    },
    [activeId],
  );

  const handleRemoveLinkedNote = useCallback(
    async (linkedNoteId: string) => {
      if (!activeId) return;
      try {
        const updated = await window.api.notes.removeLink(activeId, linkedNoteId);
        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : 'ノートの連携解除に失敗しました',
        );
      }
    },
    [activeId],
  );

  const handleNoteDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleNoteDrop = (e: DragEvent<HTMLDivElement>) => {
    const linkedNoteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (!linkedNoteId) return;
    e.preventDefault();
    e.stopPropagation();
    void handleAddLinkedNote(linkedNoteId);
  };

  const [aiBusy, setAiBusy] = useState(false);

  const runAiTransform = useCallback(
    async (action: AiAction) => {
      if (!activeId || aiBusy) return;
      if (!settings.aiToken.trim()) {
        window.alert('設定 > AI でTokenを設定してください。');
        void window.api.openPreferencesWindow();
        return;
      }
      if (isActiveLocked) {
        setPasswordPurpose({ kind: 'unlock-edit' });
        return;
      }

      const range =
        view === 'edit' ? editorRef.current?.getSelectionRange() : undefined;
      const hasSelection = Boolean(range && range.from !== range.to);
      const targetText = hasSelection && range ? range.text : body;
      if (!targetText.trim()) {
        window.alert('AIで処理する本文がありません。');
        return;
      }

      setAiBusy(true);
      try {
        const transformed = await window.api.ai.transform({
          provider: settings.aiProvider,
          token: settings.aiToken,
          endpoint: settings.aiEndpoint,
          model: settings.aiModel,
          action,
          content: targetText,
        });
        if (hasSelection && range && view === 'edit') {
          editorRef.current?.replaceRange(range.from, range.to, transformed);
        } else {
          handleBodyChange(transformed);
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : String(err));
      } finally {
        setAiBusy(false);
      }
    },
    [
      activeId,
      aiBusy,
      body,
      handleBodyChange,
      isActiveLocked,
      settings.aiEndpoint,
      settings.aiModel,
      settings.aiProvider,
      settings.aiToken,
      view,
    ],
  );

  const openAiTransformMenu = useCallback(
    async (position: { x: number; y: number }) => {
      if (aiBusy) return;
      const action = await window.api.ui.showContextMenu({
        position,
        items: [
          { id: 'summarizeByHeading', label: '見出し単位で要約' },
          { id: 'organizeBullets', label: '箇条書きを整理' },
          { id: 'improveCodeBlocks', label: 'コードブロックだけ改善' },
          { id: 'formatTables', label: '表だけ整形' },
          { id: 'convertHtmlToMarkdown', label: '構造を保持してMarkdownに変換' },
        ],
      });
      if (!action) return;
      await runAiTransform(action as AiAction);
    },
    [aiBusy, runAiTransform],
  );

  const handleAiChatResizeStart = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setAiChatResizing(true);
    },
    [],
  );

  // ----- NoteHeader の表示/編集トグル -----
  const handleSelectEditOrPreview = async (next: 'edit' | 'preview') => {
    if (next === 'edit' && isActiveLocked) {
      // 編集にはパスワードが必要
      setPasswordPurpose({ kind: 'unlock-edit' });
      return;
    }

    // 編集 → プレビューへの切替時: 未参照メディアの GC
    if (next === 'preview' && view === 'edit' && activeId) {
      await flushPendingSaves();
      const currentImages = extractImageRefs(body);
      const currentAttachments = extractAttachmentRefs(body);
      const removedImages = [...sessionImagesRef.current].filter(
        (f) => !currentImages.has(f),
      );
      const removedAttachments = [...sessionAttachmentsRef.current].filter(
        (f) => !currentAttachments.has(f),
      );
      if (removedImages.length > 0 || removedAttachments.length > 0) {
        try {
          await window.api.media.gc({
            images: removedImages,
            attachments: removedAttachments,
          });
        } catch {
          // GC 失敗はユーザーに通知しない（次回再試行される）
        }
      }
      // セッションを現在の状態にリセット
      sessionImagesRef.current = currentImages;
      sessionAttachmentsRef.current = currentAttachments;
    }

    setView(next);
  };

  // ----- パスワードダイアログ送信 -----
  // passwordPurpose の kind に応じて分岐処理
  const handlePasswordSubmit = (password: string): boolean => {
    if (password !== settings.protectionPassword) {
      return false;
    }
    if (passwordPurpose === null) return false;

    switch (passwordPurpose.kind) {
      case 'unlock-edit': {
        if (activeId) {
          setUnlockedNoteIds((prev) => new Set(prev).add(activeId));
          setView('edit');
        }
        setPasswordPurpose(null);
        return true;
      }
      case 'unprotect': {
        const targetId = passwordPurpose.noteId;
        void (async () => {
          try {
            await window.api.notes.setProtected(targetId, false);
            const list = await window.api.notes.list();
            setNotes(list);
            setUnlockedNoteIds((prev) => new Set(prev).add(targetId));
          } catch (err) {
            window.alert(
              err instanceof Error ? err.message : '保護解除に失敗しました',
            );
          }
        })();
        setPasswordPurpose(null);
        return true;
      }
      case 'view-secret': {
        const targetId = passwordPurpose.noteId;
        // セッションの解錠リストに追加し、改めて selectNote を呼ぶ
        setUnlockedSecretIds((prev) => {
          const next = new Set(prev);
          next.add(targetId);
          return next;
        });
        // 対象ノートが同時に保護もされている場合、1 回のパスワード入力で
        // 編集モードの解錠も一緒に有効化する
        const meta = notes.find((n) => n.id === targetId);
        if (meta?.protected) {
          setUnlockedNoteIds((prev) => new Set(prev).add(targetId));
        }
        setPasswordPurpose(null);
        // state 更新が反映された後に selectNote を呼ぶため次フレームで実行。
        // bypassLockChecks=true を渡すことで、古いクロージャキャプチャの
        // state を参照して再度ダイアログが開くのを防ぐ。
        window.setTimeout(() => {
          void selectNote(targetId, undefined, true);
        }, 0);
        return true;
      }
      case 'unset-secret': {
        const targetId = passwordPurpose.noteId;
        void (async () => {
          try {
            await window.api.notes.setSecret(targetId, false);
            const list = await window.api.notes.list();
            setNotes(list);
            // 解除済み扱いにする（同セッション中は再要求されない）
            setUnlockedSecretIds((prev) => {
              const next = new Set(prev);
              next.add(targetId);
              return next;
            });
          } catch (err) {
            window.alert(
              err instanceof Error
                ? err.message
                : 'シークレット解除に失敗しました',
            );
          }
        })();
        setPasswordPurpose(null);
        return true;
      }
    }
  };

  // パスワードダイアログを閉じる際の共通ハンドラ（用途状態をクリア）
  const handlePasswordDialogClose = () => {
    setPasswordPurpose(null);
  };

  // アプリ終了前にも保留分を書き出す
  useEffect(() => {
    const handler = () => {
      void flushPendingSaves();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushPendingSaves]);

  const hasNote = activeId !== null;

  /** フッター用の小さなクラウドアイコン (12x12) */
  const FooterCloudIcon = () => (
    <svg
      className="footer__cloud-icon"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M4.5 13a3.5 3.5 0 0 1-.3-6.98 4.5 4.5 0 0 1 8.6-.5A3.5 3.5 0 0 1 12.5 13h-8z" />
    </svg>
  );

  if (isPreferencesWindow) {
    return (
      <PreferencesModal
        open={true}
        standalone
        onClose={() => void window.api.closeCurrentWindow()}
        settings={settings}
        onChange={handleSettingChange}
      />
    );
  }

  return (
    <div className="app">
      <div className="app__content">
        <ActivityBar
          sidebarMode={sidebarMode}
          onSelectFiles={handleSelectFiles}
          onSelectSearch={handleSelectSearch}
          onSelectTags={handleSelectTags}
          onOpenSettings={() => void window.api.openPreferencesWindow()}
          onSelectStorage={handleSelectStorage}
          sharing={sharing}
        />
        <div className="app__body">
        <Sidebar
          ref={sidebarRef}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          minWidth={SIDEBAR_MIN_WIDTH}
          maxWidth={SIDEBAR_MAX_WIDTH}
          onResize={handleSidebarResize}
          mode={sidebarMode}
          files={notes}
          extraFolders={folders}
          activeId={activeId}
          onSelect={(id) => void selectNote(id)}
          onCreateNote={() => void handleCreateNote()}
          onCreateNoteInFolder={(folder) =>
            void handleCreateNoteInFolder(folder)
          }
          onDeleteNote={(id) => void handleDeleteNote(id)}
          onToggleProtect={(id, next) => void handleToggleProtect(id, next)}
          onToggleSecret={(id, next) => void handleToggleSecret(id, next)}
          onSearch={handleSearch}
          searchHistory={searchHistory}
          onAddSearchHistory={handleAddSearchHistory}
          onMoveNote={(id, target) => void handleMoveNote(id, target)}
          onMoveFolder={(oldPath, newParent) =>
            void handleMoveFolder(oldPath, newParent)
          }
          onRenameNote={handleStartRename}
          onRenameFolder={handleStartRenameFolder}
          onDeleteFolder={(folderPath) => void handleDeleteFolder(folderPath)}
          shareProvider={settings.shareProvider}
          onStartSync={handleStartSync}
          syncing={sharing}
          syncProgress={syncProgress}
          syncLastResult={syncLastResult}
          syncLastError={syncLastError}
        />
        <main className="app__main">
          <TabBar
            openTabIds={openTabIds}
            activeId={activeId}
            notes={notes}
            onSelect={(id) => void selectNote(id)}
            onClose={(id) => void closeTab(id)}
            onCloseMany={(ids) => void closeTabs(ids)}
            onReorder={(nextIds) => setOpenTabIds(nextIds)}
          />
          {hasNote ? (
            <div
              className="note"
              onDragOver={handleNoteDragOver}
              onDrop={handleNoteDrop}
            >
              {/* バックグラウンド同期中オーバーレイ */}
              {syncingNoteId === activeId && syncingNoteId !== null && (
                <div className="note__syncing-overlay" aria-live="polite">
                  <div className="note__syncing-spinner" />
                  <span>同期中…</span>
                </div>
              )}
              <NoteHeader
                name={buildPath(editingFolder, editingTitle)}
                view={view}
                onNameChange={handleNameChange}
                onSelectView={(next) => void handleSelectEditOrPreview(next)}
                onSummarizeClick={(position) =>
                  void openAiTransformMenu(position)
                }
                onToggleAiChat={() => setAiChatOpen((v) => !v)}
                summarizeDisabled={!activeId}
                summarizeBusy={aiBusy}
                aiChatOpen={aiChatOpen}
                aiEnabled={settings.aiToken.trim().length > 0}
              />
              {view === 'edit' && settings.showInsertButtons && (
                <EditorToolbar
                  editorRef={editorRef}
                  dateFormat={settings.dateFormat}
                  templateFolder={settings.templateFolder}
                />
              )}
              {view === 'edit' && (
                <TagBar tags={editingTags} onChange={handleTagsChange} />
              )}
              <div className="note__body">
                {view === 'edit' ? (
                  <Editor
                    ref={editorRef}
                    value={body}
                    onChange={handleBodyChange}
                    theme={settings.theme}
                  />
                ) : (
                  <Preview
                    value={body}
                    tags={editingTags}
                    codeCopyAlwaysVisible={settings.codeCopyAlwaysVisible}
                    showLineNumbers={settings.codeShowLineNumbers}
                    enabledHighlightLangs={settings.enabledHighlightLangs}
                    onChange={handleBodyChange}
                  />
                )}
              </div>
              {linkedNotes.length > 0 && (
                <div className="note-links-bar" aria-label="連携ノート">
                  <span className="note-links-bar__label">連携：</span>
                  <div className="note-links-bar__badges">
                    {linkedNotes.map((note) => (
                      <span
                        role="button"
                        tabIndex={0}
                        className="note-links-bar__badge"
                        key={note.id}
                        onClick={() => void selectNote(note.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            void selectNote(note.id);
                          }
                        }}
                        title={buildPath(note.folder, note.title) || '無題'}
                      >
                        <span className="note-links-bar__title">
                          {note.title || '無題'}
                        </span>
                        <button
                          type="button"
                          className="note-links-bar__remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRemoveLinkedNote(note.id);
                          }}
                          aria-label={`${note.title || '無題'} との連携を解除`}
                          title="連携解除"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-state">
              <img
                className="empty-state__logo"
                src={logoUrl}
                alt="InkNel ロゴ"
                draggable={false}
              />
              <h1 className="empty-state__title">InkNel</h1>
              <p className="empty-state__tagline">Markdown で思考を整理する</p>
            </div>
          )}
        </main>
        {aiChatOpen && (
          <>
            <div
              className={`app__splitter ${aiChatResizing ? 'is-active' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="AI領域の幅を変更"
              onMouseDown={handleAiChatResizeStart}
            />
            <AiChatPanel
              onClose={() => setAiChatOpen(false)}
              settings={settings}
              noteTitle={activeNoteMeta?.title ?? ''}
              noteBody={body}
              linkedNotes={linkedNotes}
              width={aiChatWidth}
            />
          </>
        )}
      </div>
      </div>{/* app__content */}
      <footer className="app__footer" role="contentinfo">
        {importProgress ? (
          /* ── ファイル/ディレクトリインポート中 ── */
          <>
            <div className="footer__left">
              <span className="footer__direction">📥</span>
              <span className="footer__filename">
                {importProgress.fileName
                  ? `読み込み中: ${importProgress.fileName} (${importProgress.current}/${importProgress.total})`
                  : `読み込み準備中… (${importProgress.total} 件)`}
              </span>
            </div>
            <div className="footer__progress">
              <div
                className="footer__progress-fill"
                style={{
                  width: `${
                    importProgress.total > 0
                      ? Math.round(
                          (importProgress.current / importProgress.total) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
          </>
        ) : (sharing || syncingNoteId) && syncProgress ? (
          /* ── 一括同期中: [☁][↑↓][ファイル名][プログレス] ── */
          <>
            <div className="footer__left">
              <FooterCloudIcon />
              <span className="footer__direction">
                {syncProgress.phase === 'push'
                  ? '↑'
                  : syncProgress.phase === 'pull'
                    ? '↓'
                    : syncProgress.phase === 'skip'
                      ? '='
                      : syncProgress.phase === 'media'
                        ? '↑↓'
                        : '…'}
              </span>
              <span className="footer__filename">
                {syncProgress.phase === 'push' ||
                syncProgress.phase === 'pull' ||
                syncProgress.phase === 'skip'
                  ? syncProgress.noteTitle
                  : syncProgress.phase === 'media'
                    ? `${syncProgress.kind === 'images' ? '画像' : '添付'} (↑${syncProgress.pushed} ↓${syncProgress.pulled})`
                    : syncProgress.phase === 'start'
                      ? `同期開始 (${syncProgress.total} 件)`
                      : syncProgress.phase === 'finalizing'
                        ? 'マニフェスト書き込み中…'
                        : syncProgress.phase === 'done'
                          ? '同期完了'
                          : '同期中…'}
              </span>
            </div>
            <div className="footer__progress">
              <div
                className="footer__progress-fill"
                style={{
                  width: `${
                    'current' in syncProgress &&
                    'total' in syncProgress &&
                    syncProgress.total > 0
                      ? Math.round(
                          (syncProgress.current / syncProgress.total) * 100,
                        )
                      : syncProgress.phase === 'done'
                        ? 100
                        : syncProgress.phase === 'finalizing'
                          ? 95
                          : syncProgress.phase === 'media'
                            ? 90
                            : 0
                  }%`,
                }}
              />
            </div>
          </>
        ) : syncingNoteId ? (
          /* ── バックグラウンドチェック中: [☁][↑↓][確認中…][不確定プログレス] ── */
          <>
            <div className="footer__left">
              <FooterCloudIcon />
              <span className="footer__direction">↑↓</span>
              <span className="footer__filename">確認中…</span>
            </div>
            <div className="footer__progress">
              <div className="footer__progress-fill footer__progress-fill--indeterminate" />
            </div>
          </>
        ) : (
          /* ── 通常時 ── */
          <>
            <div className="footer__left">
              {activeNoteMeta && (
                <span className="footer__item">
                  {buildPath(activeNoteMeta.folder, activeNoteMeta.title) ||
                    '無題'}
                </span>
              )}
            </div>
            <div className="footer__right">
              {settings.shareProvider !== 'none' && (
                <span className="footer__item footer__item--sync">
                  <FooterCloudIcon /> 共有
                </span>
              )}
            </div>
          </>
        )}
      </footer>
      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        settings={settings}
        onChange={handleSettingChange}
      />
      <PasswordDialog
        open={passwordDialogOpen}
        onClose={handlePasswordDialogClose}
        onSubmit={handlePasswordSubmit}
        description={
          passwordPurpose?.kind === 'unprotect'
            ? 'このノートの保護を解除します。4桁のパスワードを入力してください。'
            : passwordPurpose?.kind === 'view-secret'
              ? 'このノートはシークレットです。表示するには4桁のパスワードを入力してください。'
              : passwordPurpose?.kind === 'unset-secret'
                ? 'このノートのシークレット設定を解除します。4桁のパスワードを入力してください。'
                : undefined
        }
        submitLabel={
          passwordPurpose?.kind === 'unprotect'
            ? '保護解除'
            : passwordPurpose?.kind === 'view-secret'
              ? '表示'
              : passwordPurpose?.kind === 'unset-secret'
                ? 'シークレット解除'
                : '解錠'
        }
      />
      <RenameDialog
        open={renameTarget !== null}
        initialName={
          renameTarget === null
            ? ''
            : renameTarget.kind === 'note'
              ? renameTarget.name
              : renameTarget.leafName
        }
        onClose={() => setRenameTarget(null)}
        onSubmit={(name) => void handleRenameSubmit(name)}
      />
      <FindDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onFindNext={(q) => editorRef.current?.findNext(q) != null}
        onFindPrev={(q) => editorRef.current?.findPrev(q) != null}
      />
      <ReplaceDialog
        open={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        onFindNext={(q) => editorRef.current?.findNext(q) != null}
        onReplaceCurrent={(q, r) =>
          editorRef.current?.replaceCurrent(q, r) ?? false
        }
        onReplaceAll={(q, r) => editorRef.current?.replaceAll(q, r) ?? 0}
      />
    </div>
  );
}
