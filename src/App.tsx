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
  const [view, setView] = useState<ViewKey>('edit');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('files');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const [preferencesOpen, setPreferencesOpen] = useState<boolean>(false);

  // ----- 保護の解錠状態 -----
  // セッション中に正しいパスワードを入れた対象ノート ID。
  // activeId が変わると null に戻る（= 別ファイルに切り替えたら再ロック）
  const [unlockedNoteId, setUnlockedNoteId] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState<boolean>(false);

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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- ノート選択（保留中の保存をフラッシュしてから切り替え） -----
  const selectNote = useCallback(
    async (id: string, fromList?: NoteMeta[]) => {
      await flushPendingSaves();
      const list = fromList ?? notes;
      const meta = list.find((n) => n.id === id);
      if (!meta) return;
      const loadedBody = await window.api.notes.readBody(id);
      setActiveId(id);
      setEditingTitle(meta.title);
      setEditingFolder(meta.folder);
      setEditingTags(meta.tags ?? []);
      setBody(loadedBody);
      // セッショントラッキング: 初期メディア参照を記録
      sessionImagesRef.current = extractImageRefs(loadedBody);
      sessionAttachmentsRef.current = extractAttachmentRefs(loadedBody);
      // ファイル切替時は解錠状態をクリア
      setUnlockedNoteId(null);
      // 保護されている場合はプレビュービューに強制
      if (meta.protected) {
        setView('preview');
      }
    },
    [notes],
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
  const handleToggleProtect = useCallback(
    async (id: string, next: boolean) => {
      await window.api.notes.setProtected(id, next);
      const list = await window.api.notes.list();
      setNotes(list);

      if (id === activeId) {
        // 対象ファイルの解錠状態をクリア（保護ON/OFF 両方で整合性を取る）
        setUnlockedNoteId((prev) => (prev === id ? null : prev));
        // 編集ビュー中に保護をかけた場合、プレビューに強制遷移
        if (next && view === 'edit') {
          setView('preview');
        }
      }
    },
    [activeId, view],
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
      setPasswordDialogOpen(true);
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
  const handlePasswordSubmit = (password: string): boolean => {
    if (password !== settings.protectionPassword) {
      return false;
    }
    if (activeId) {
      setUnlockedNoteId(activeId);
      setView('edit');
    }
    setPasswordDialogOpen(false);
    return true;
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

  return (
    <div className="app">
      <ActivityBar
        sidebarMode={sidebarMode}
        onSelectFiles={handleSelectFiles}
        onSelectSearch={handleSelectSearch}
        onSelectTags={handleSelectTags}
        onOpenSettings={() => setPreferencesOpen(true)}
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
          onSearch={handleSearch}
          searchHistory={searchHistory}
          onAddSearchHistory={handleAddSearchHistory}
          onMoveNote={(id, target) => void handleMoveNote(id, target)}
          onRenameNote={handleStartRename}
          onRenameFolder={handleStartRenameFolder}
        />
        <main className="app__main">
          {hasNote ? (
            <div className="note">
              <NoteHeader
                name={buildPath(editingFolder, editingTitle)}
                view={view}
                onNameChange={handleNameChange}
                onSelectView={(next) => void handleSelectEditOrPreview(next)}
              />
              {view === 'edit' && settings.showInsertButtons && (
                <EditorToolbar editorRef={editorRef} />
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
      <PreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        settings={settings}
        onChange={handleSettingChange}
      />
      <PasswordDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        onSubmit={handlePasswordSubmit}
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
