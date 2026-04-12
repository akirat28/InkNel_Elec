import { useCallback, useEffect, useRef, useState } from 'react';
import ActivityBar from './components/ActivityBar';
import Editor, { type EditorHandle } from './components/Editor';
import EditorToolbar from './components/EditorToolbar';
import Preview from './components/Preview';
import Sidebar, { type SidebarMode } from './components/Sidebar';
import NoteHeader from './components/NoteHeader';
import TagBar from './components/TagBar';
import PreferencesModal from './components/PreferencesModal';
import PasswordDialog from './components/PasswordDialog';
import RenameDialog from './components/RenameDialog';
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
import type { NoteMeta } from './global';

export const SIDEBAR_MIN_WIDTH = SIDEBAR_WIDTH_MIN;
export const SIDEBAR_MAX_WIDTH = SIDEBAR_WIDTH_MAX;
export const SIDEBAR_DEFAULT_WIDTH = SIDEBAR_WIDTH_DEFAULT;

type ViewKey = 'edit' | 'preview';

const SAVE_DEBOUNCE_MS = 300;

export default function App() {
  // ----- ノート一覧 / 選択中ノート -----
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [body, setBody] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState<string>('');
  const [editingFolder, setEditingFolder] = useState<string>('');
  const [editingTags, setEditingTags] = useState<string[]>([]);

  // ----- UI 状態 -----
  const [view, setView] = useState<ViewKey>('preview');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false);

  // ----- 保護の解錠状態 -----
  // セッション中に正しいパスワードを入れた対象ノート ID。
  // activeId が変わると null に戻る（= 別ファイルに切り替えたら再ロック）
  const [unlockedNoteId, setUnlockedNoteId] = useState<string | null>(null);
  // セッション中にパスワードで解錠したシークレットノート ID の集合
  // （アプリ再起動でクリア。secretLock-OFF にしたノートも含まれて良い）
  const [unlockedSecretIds, setUnlockedSecretIds] = useState<Set<string>>(
    () => new Set<string>(),
  );

  // パスワードダイアログの用途。null の場合はダイアログを閉じている。
  type PasswordPurpose =
    | { kind: 'unlock-edit' } // 現在のアクティブノートを編集モードに解錠
    | { kind: 'unprotect'; noteId: string } // 保護解除
    | { kind: 'view-protected'; noteId: string } // 保護ノートを開く
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

  // ----- 設定メニュー購読 -----
  useEffect(() => {
    return window.api?.onOpenPreferences(() => setPreferencesOpen(true));
  }, []);

  // ----- 印刷メニュー購読 -----
  // メインプロセスの「印刷...」メニューが押されたら window.print() を呼び、
  // OS のプリントダイアログを開く。@media print の CSS で UI 周りは隠してある。
  //
  // macOS の「PDF として保存」のデフォルトファイル名は document.title から決まるため、
  // 印刷前にノート名へ一時的に書き換え、印刷後に元のタイトルへ戻す。
  useEffect(() => {
    return window.api?.onPrint(() => {
      const originalTitle = document.title;
      // パスのスラッシュはファイル名に使えないので " - " 区切りに変換
      const noteName =
        [editingFolder, editingTitle]
          .filter((s) => s.length > 0)
          .join(' - ') || '無題';
      document.title = noteName;
      // 次フレームに回して、document.title 更新後の状態で印刷ダイアログを開く
      window.setTimeout(() => {
        try {
          window.print();
        } finally {
          // ダイアログが閉じた後（同期的に戻る環境が多い）にタイトル復元
          document.title = originalTitle;
        }
      }, 0);
    });
  }, [editingTitle, editingFolder]);

  // ----- 初回ロード -----
  useEffect(() => {
    void (async () => {
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

      if (list.length > 0) {
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
        // 保護かつ未解錠 → パスワード要求
        // (セッション中の解錠状態は unlockedNoteId が同じ id を保持しているかで判定)
        if (meta.protected && unlockedNoteId !== id) {
          setPasswordPurpose({ kind: 'view-protected', noteId: id });
          return;
        }
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
      // ファイル切替時は編集解錠状態をクリア。
      // ただし bypassLockChecks が true の場合は handlePasswordSubmit からの
      // 再呼び出しで、直前に setUnlockedNoteId(targetId) が設定されているため
      // それを維持する（保護の 1 パスワードで表示 + 編集を両方解錠するため）。
      if (!bypassLockChecks) {
        setUnlockedNoteId(null);
      }
      // 保護されている場合はプレビュービューに強制
      if (meta.protected) {
        setView('preview');
      }

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
    [notes, unlockedSecretIds, unlockedNoteId, settings.shareProvider],
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
  const handleCreateNote = async () => {
    await flushPendingSaves();
    const created = await window.api.notes.create({
      title: '無題',
      folder: '',
      body: '',
    });
    const list = await window.api.notes.list();
    setNotes(list);
    setActiveId(created.id);
    setEditingTitle(created.title);
    setEditingFolder(created.folder);
    setEditingTags(created.tags ?? []);
    setBody('');
    setView('edit');
    setSidebarMode('files');
  };

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

      if (id === activeId) {
        if (list.length > 0) {
          await selectNote(list[0].id, list);
        } else {
          setActiveId(null);
          setEditingTitle('');
          setEditingFolder('');
          setEditingTags([]);
          setBody('');
        }
      }
    },
    [activeId, selectNote],
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

      if (id === activeId) {
        setUnlockedNoteId((prev) => (prev === id ? null : prev));
        if (view === 'edit') {
          setView('preview');
        }
      }
    },
    [activeId, view],
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

  // ----- ActivityBar 共有アイコン (サイドバーを sync モードへ切替) -----
  const handleSelectShare = () => {
    if (settings.shareProvider === 'none') return;
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
    activeNoteMeta?.protected === true && unlockedNoteId !== activeId;

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
          setUnlockedNoteId(activeId);
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
            if (targetId === activeId) {
              setUnlockedNoteId(targetId);
            }
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
          setUnlockedNoteId(targetId);
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
      case 'view-protected': {
        const targetId = passwordPurpose.noteId;
        // unlockedNoteId に targetId を設定して編集解錠状態にする
        // (保護ノートを開く時点で表示 + 編集の両方を解錠)
        setUnlockedNoteId(targetId);
        setPasswordPurpose(null);
        // bypassLockChecks=true を渡して再呼び出し
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

  return (
    <div className="app">
      <div className="app__content">
        <ActivityBar
          sidebarMode={sidebarMode}
          onSelectFiles={handleSelectFiles}
          onSelectSearch={handleSelectSearch}
          onSelectTags={handleSelectTags}
          onOpenSettings={() => setPreferencesOpen(true)}
          shareEnabled={settings.shareProvider !== 'none'}
          onSelectShare={handleSelectShare}
          sharing={sharing}
        />
        <div className="app__body">
        <Sidebar
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
          onDeleteNote={(id) => void handleDeleteNote(id)}
          onToggleProtect={(id, next) => void handleToggleProtect(id, next)}
          onToggleSecret={(id, next) => void handleToggleSecret(id, next)}
          onSearch={handleSearch}
          searchHistory={searchHistory}
          onAddSearchHistory={handleAddSearchHistory}
          onMoveNote={(id, target) => void handleMoveNote(id, target)}
          onRenameNote={handleStartRename}
          onRenameFolder={handleStartRenameFolder}
          shareProvider={settings.shareProvider}
          onStartSync={handleStartSync}
          syncing={sharing}
          syncProgress={syncProgress}
          syncLastResult={syncLastResult}
          syncLastError={syncLastError}
        />
        <main className="app__main">
          {hasNote ? (
            <div className="note">
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
              />
              {view === 'edit' && settings.showInsertButtons && (
                <EditorToolbar
                  editorRef={editorRef}
                  dateFormat={settings.dateFormat}
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
            </div>
          ) : (
            <div className="empty-state">
              <p>メモがまだありません。</p>
              <p>
                サイドバー上部の <strong>📄＋</strong> アイコンから最初のメモを作成しましょう。
              </p>
            </div>
          )}
        </main>
      </div>
      </div>{/* app__content */}
      <footer className="app__footer" role="contentinfo">
        {(sharing || syncingNoteId) && syncProgress ? (
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
            : passwordPurpose?.kind === 'view-protected'
              ? 'このノートは保護されています。開くには4桁のパスワードを入力してください。'
              : passwordPurpose?.kind === 'view-secret'
                ? 'このノートはシークレットです。表示するには4桁のパスワードを入力してください。'
                : passwordPurpose?.kind === 'unset-secret'
                  ? 'このノートのシークレット設定を解除します。4桁のパスワードを入力してください。'
                  : undefined
        }
        submitLabel={
          passwordPurpose?.kind === 'unprotect'
            ? '保護解除'
            : passwordPurpose?.kind === 'view-protected'
              ? '開く'
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
    </div>
  );
}
