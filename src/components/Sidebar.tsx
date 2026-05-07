import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FileItem, TreeNode } from '../types';
import { buildTree } from '../utils/buildTree';
import SearchPanel from './SearchPanel';
import SyncPanel from './SyncPanel';
import StorageSyncPanel from './StorageSyncPanel';
import TagsPanel from './TagsPanel';
import type {
  NoteMeta,
  ShareProviderId,
  ShareSyncProgress,
  ShareSyncResult,
} from '../global';

export type SidebarMode = 'files' | 'search' | 'tags' | 'sync';

/** ノート ID をやりとりする独自の DataTransfer タイプ */
const NOTE_DRAG_TYPE = 'application/x-inknel-note-id';

/** フォルダパスをやりとりする独自の DataTransfer タイプ */
const FOLDER_DRAG_TYPE = 'application/x-inknel-folder-path';

interface Props {
  collapsed: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  onResize: (next: number) => void;
  mode: SidebarMode;
  files: FileItem[];
  extraFolders: string[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNote: () => void;
  /** 指定フォルダ配下に無題ノートを作成 */
  onCreateNoteInFolder: (folderPath: string) => void;
  onDeleteNote: (id: string) => void;
  onToggleProtect: (id: string, next: boolean) => void;
  onToggleSecret: (id: string, next: boolean) => void;
  onSearch: (query: string) => Promise<NoteMeta[]>;
  searchHistory: string[];
  onAddSearchHistory: (query: string) => void;
  /** ファイルを別フォルダへドラッグ&ドロップで移動 */
  onMoveNote: (noteId: string, targetFolder: string) => void;
  /** フォルダを別階層へドラッグ&ドロップで移動 */
  onMoveFolder: (oldPath: string, newParentPath: string) => void;
  /** ノートの名称変更ダイアログを開く */
  onRenameNote: (noteId: string) => void;
  /** フォルダの名称変更ダイアログを開く */
  onRenameFolder: (folderPath: string) => void;
  /** フォルダを配下ごと削除 */
  onDeleteFolder: (folderPath: string) => void;
  /** 共有プロバイダ（'none' なら sync パネルは使わない） */
  shareProvider: ShareProviderId;
  /** 同期開始トリガー（SyncPanel の「同期開始」ボタンから） */
  onStartSync: () => Promise<void>;
  /** 同期実行中フラグ */
  syncing: boolean;
  /** 最新の進捗イベント */
  syncProgress: ShareSyncProgress | null;
  /** 前回同期の結果 */
  syncLastResult: ShareSyncResult | null;
  /** 前回同期のエラー */
  syncLastError: string | null;
}

/** 外部から Sidebar を操作するためのハンドル */
export interface SidebarHandle {
  /** 指定したフォルダパスとその全祖先を展開する */
  expandFolder: (folderPath: string) => void;
}

const Sidebar = forwardRef<SidebarHandle, Props>(function Sidebar(
  {
    collapsed,
    width,
    minWidth,
    maxWidth,
    onResize,
    mode,
    files,
    extraFolders,
    activeId,
    onSelect,
    onCreateNote,
    onCreateNoteInFolder,
    onDeleteNote,
    onToggleProtect,
    onToggleSecret,
    onSearch,
    searchHistory,
    onAddSearchHistory,
    onMoveNote,
    onMoveFolder,
    onRenameNote,
    onRenameFolder,
    onDeleteFolder,
    shareProvider,
    onStartSync,
    syncing,
    syncProgress,
    syncLastResult,
    syncLastError,
  }: Props,
  ref,
) {
  const tree = useMemo(
    () => buildTree(files, extraFolders),
    [files, extraFolders],
  );

  // フォルダの展開状態（path -> bool）。デフォルトは全展開。
  // フォルダの展開状態 (path -> bool)。デフォルトは true（展開）扱い。
  // SQLite の settings テーブルにキー 'sidebar.expanded' で永続化する。
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const expandedLoadedRef = useRef(false);

  // 起動時に DB から復元
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await window.api.settings.getAll();
        if (cancelled) return;
        const raw = all['sidebar.expanded'];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            setExpanded(parsed as Record<string, boolean>);
          }
        }
      } catch {
        // 読み込み失敗時はデフォルト (全展開)
      } finally {
        expandedLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 変更時に DB へ保存（デバウンス）
  const expandedSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!expandedLoadedRef.current) return;
    if (expandedSaveTimer.current) clearTimeout(expandedSaveTimer.current);
    expandedSaveTimer.current = setTimeout(() => {
      void window.api.settings
        .set('sidebar.expanded', JSON.stringify(expanded))
        .catch(() => {
          // 保存失敗は無視
        });
    }, 300);
    return () => {
      if (expandedSaveTimer.current) clearTimeout(expandedSaveTimer.current);
    };
  }, [expanded]);

  const isExpanded = (path: string) => expanded[path] !== false;
  const toggle = (path: string) =>
    setExpanded((prev) => ({ ...prev, [path]: !isExpanded(path) }));

  // 外部から呼び出す展開メソッド（App.tsx の handleCreateNote から使う）
  useImperativeHandle(
    ref,
    () => ({
      expandFolder(folderPath: string) {
        if (!folderPath) return;
        // folderPath とその全祖先を true に
        const segments = folderPath.split('/').filter((s) => s.length > 0);
        const toOpen: string[] = [];
        for (let i = 0; i < segments.length; i++) {
          toOpen.push(segments.slice(0, i + 1).join('/'));
        }
        setExpanded((prev) => {
          const next = { ...prev };
          for (const p of toOpen) next[p] = true;
          return next;
        });
      },
    }),
    [],
  );

  /** ツリーから全フォルダパスを再帰的に収集する */
  const collectFolderPaths = (nodes: TreeNode[]): string[] => {
    const paths: string[] = [];
    for (const node of nodes) {
      if (node.kind === 'folder') {
        paths.push(node.path);
        paths.push(...collectFolderPaths(node.children));
      }
    }
    return paths;
  };

  const expandAll = () => {
    const paths = collectFolderPaths(tree);
    const next: Record<string, boolean> = {};
    for (const p of paths) next[p] = true;
    setExpanded(next);
  };

  const collapseAll = () => {
    const paths = collectFolderPaths(tree);
    const next: Record<string, boolean> = {};
    for (const p of paths) next[p] = false;
    setExpanded(next);
  };

  /**
   * ファイル行のケバブから OS ネイティブメニューを開く。
   * Web ベースの ContextMenu と違いウィンドウ外にもはみ出せる。
   */
  const openFileMenu = async (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const isProtected = file.protected === true;
    const isSecret = file.secret === true;
    const id = await window.api.ui.showContextMenu({
      // クリック位置（ケバブクリック / 右クリック共通）にメニューを開く
      position: { x: e.clientX, y: e.clientY },
      items: [
        { id: 'rename', label: '名称変更' },
        {
          id: 'protect',
          label: isProtected ? '保護解除' : '保護',
        },
        {
          id: 'secret',
          label: isSecret ? 'シークレット解除' : 'シークレットにする',
        },
        { separator: true },
        { id: 'delete', label: '削除', enabled: !isProtected },
      ],
    });
    if (id === 'rename') onRenameNote(file.id);
    else if (id === 'protect') onToggleProtect(file.id, !isProtected);
    else if (id === 'secret') onToggleSecret(file.id, !isSecret);
    else if (id === 'delete') {
      if (window.confirm(`「${file.title || '無題'}」を削除しますか？`)) {
        onDeleteNote(file.id);
      }
    }
  };

  const openFolderMenu = async (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = await window.api.ui.showContextMenu({
      position: { x: e.clientX, y: e.clientY },
      items: [
        { id: 'createNote', label: 'ノートの作成' },
        { id: 'rename', label: '名称変更' },
        { separator: true },
        { id: 'deleteRecursive', label: 'ディレクトリごと削除' },
      ],
    });
    if (id === 'createNote') onCreateNoteInFolder(folderPath);
    else if (id === 'rename') onRenameFolder(folderPath);
    else if (id === 'deleteRecursive') onDeleteFolder(folderPath);
  };

  // ----- ドラッグ&ドロップ（ファイル / フォルダ → フォルダ移動） -----
  // 現在ドラッグ対象のフォルダパス。視覚ハイライト用。
  // null = ルート領域（トップレベル）へのドロップターゲット状態は rootDragOver で管理。
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState<boolean>(false);

  // ドラッグ終了 (dragend) / ドロップ完了時にハイライト状態を必ずクリア。
  // ブラウザによっては dragleave が発火しないケースがあるため、window レベルの
  // dragend / drop イベントで強制リセットする。
  useEffect(() => {
    const clear = () => {
      setDragOverFolder(null);
      setRootDragOver(false);
    };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  const handleFileDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    noteId: string,
  ) => {
    e.dataTransfer.setData(NOTE_DRAG_TYPE, noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => {
    e.dataTransfer.setData(FOLDER_DRAG_TYPE, path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => {
    const types = e.dataTransfer.types;
    const isNote = types.includes(NOTE_DRAG_TYPE);
    const isFolder = types.includes(FOLDER_DRAG_TYPE);
    if (!isNote && !isFolder) return;

    // フォルダを自分自身・自身の子孫にはドロップできない
    if (isFolder) {
      // DataTransfer の getData は dragover 中は読み取り不可のブラウザが多いので
      // dragOver 時は hint 用の判定はできない。drop 時にチェックする。
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFolder !== path) setDragOverFolder(path);
  };

  const handleFolderDragLeave = () => {
    setDragOverFolder(null);
  };

  const handleFolderDrop = (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    // フォルダ行へドロップした場合もルートのハイライトを念のためクリア
    setRootDragOver(false);

    // ノートのドロップ
    const noteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (noteId) {
      onMoveNote(noteId, path);
      return;
    }

    // フォルダのドロップ
    const folderPath = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (folderPath) {
      // 自分自身・自身の子孫への移動は拒否
      if (folderPath === path) return;
      if (path === folderPath || path.startsWith(folderPath + '/')) return;
      // 既に親がその階層なら何もしない (例: a/b を a にドロップ → 変化なし)
      const segments = folderPath.split('/');
      segments.pop();
      const currentParent = segments.join('/');
      if (currentParent === path) return;
      onMoveFolder(folderPath, path);
    }
  };

  // ----- ルート領域（トップレベル）へのドロップ -----
  const handleRootDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const types = e.dataTransfer.types;
    if (
      !types.includes(NOTE_DRAG_TYPE) &&
      !types.includes(FOLDER_DRAG_TYPE)
    ) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!rootDragOver) setRootDragOver(true);
  };

  const handleRootDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // 子要素への遷移は無視
    if (
      e.relatedTarget instanceof Node &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }
    setRootDragOver(false);
  };

  const handleRootDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setRootDragOver(false);
    // 子要素（フォルダ行）が既にハンドルしていれば stopPropagation されているので
    // ここには来ない。来たということはルート領域へのドロップ。
    const noteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (noteId) {
      e.preventDefault();
      onMoveNote(noteId, '');
      return;
    }
    const folderPath = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (folderPath) {
      e.preventDefault();
      // トップレベルなら何もしない
      if (!folderPath.includes('/')) return;
      onMoveFolder(folderPath, '');
    }
  };

  // ドラッグリサイズ
  const [resizing, setResizing] = useState(false);
  const asideRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e: MouseEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      const next = Math.min(maxWidth, Math.max(minWidth, e.clientX - left));
      onResize(next);
    };
    const handleUp = () => setResizing(false);

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
  }, [resizing, minWidth, maxWidth, onResize]);

  // 折りたたみ時は width を 0、それ以外は指定幅を CSS 変数で渡す。
  // リサイズ中は transition を切って引っかかりを防ぐ。
  const style: React.CSSProperties = {
    width: collapsed ? 0 : width,
    transition: resizing ? 'none' : undefined,
  };

  return (
    <aside
      ref={asideRef}
      className={`sidebar ${collapsed ? 'is-collapsed' : ''}`}
      style={style}
      aria-hidden={collapsed}
    >
      <div className="sidebar__inner" style={{ width }}>
        <div className="sidebar__header">
          <span className="sidebar__title">
            {mode === 'files'
              ? 'ファイル'
              : mode === 'search'
                ? '検索'
                : mode === 'tags'
                  ? 'タグ'
                  : '同期'}
          </span>
          {mode === 'files' && (
            <div className="sidebar__actions">
              <button
                type="button"
                className="sidebar__icon-btn"
                onClick={expandAll}
                title="すべて展開"
                aria-label="すべて展開"
              >
                <ExpandAllIcon />
              </button>
              <button
                type="button"
                className="sidebar__icon-btn"
                onClick={collapseAll}
                title="すべて折りたたむ"
                aria-label="すべて折りたたむ"
              >
                <CollapseAllIcon />
              </button>
              <button
                type="button"
                className="sidebar__icon-btn"
                onClick={onCreateNote}
                title="新しいメモを作成"
                aria-label="新しいメモを作成"
              >
                <NewFileIcon />
              </button>
            </div>
          )}
        </div>
        {mode === 'files' ? (
          <div
            className={`sidebar__list ${rootDragOver ? 'is-root-dragover' : ''}`}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {tree.length === 0 ? (
              <div className="sidebar__empty">（メモはまだありません）</div>
            ) : (
              <TreeView
                nodes={tree}
                depth={0}
                activeId={activeId}
                onSelect={onSelect}
                isExpanded={isExpanded}
                onToggle={toggle}
                onOpenFileMenu={openFileMenu}
                onOpenFolderMenu={openFolderMenu}
                dragOverFolder={dragOverFolder}
                onFileDragStart={handleFileDragStart}
                onFolderDragStart={handleFolderDragStart}
                onFolderDragOver={handleFolderDragOver}
                onFolderDragLeave={handleFolderDragLeave}
                onFolderDrop={handleFolderDrop}
              />
            )}
          </div>
        ) : mode === 'search' ? (
          <SearchPanel
            onSearch={onSearch}
            onSelect={onSelect}
            activeId={activeId}
            history={searchHistory}
            onAddHistory={onAddSearchHistory}
          />
        ) : mode === 'tags' ? (
          <TagsPanel activeId={activeId} onSelect={onSelect} />
        ) : (
          <StorageSyncPanel />
        )}
      </div>
      {!collapsed && (
        <div
          className={`sidebar__resizer ${resizing ? 'is-active' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setResizing(true);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="サイドバーの幅を変更"
        />
      )}
    </aside>
  );
});

export default Sidebar;

interface TreeViewProps {
  nodes: TreeNode[];
  depth: number;
  activeId: string | null;
  onSelect: (id: string) => void;
  isExpanded: (path: string) => boolean;
  onToggle: (path: string) => void;
  onOpenFileMenu: (file: FileItem, e: React.MouseEvent) => void;
  onOpenFolderMenu: (folderPath: string, e: React.MouseEvent) => void;
  dragOverFolder: string | null;
  onFileDragStart: (
    e: React.DragEvent<HTMLButtonElement>,
    noteId: string,
  ) => void;
  onFolderDragStart: (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => void;
  onFolderDragOver: (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => void;
  onFolderDragLeave: () => void;
  onFolderDrop: (e: React.DragEvent<HTMLButtonElement>, path: string) => void;
}

function TreeView({
  nodes,
  depth,
  activeId,
  onSelect,
  isExpanded,
  onToggle,
  onOpenFileMenu,
  onOpenFolderMenu,
  dragOverFolder,
  onFileDragStart,
  onFolderDragStart,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
}: TreeViewProps) {
  return (
    <ul className="tree" role="tree">
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const open = isExpanded(node.path);
          const isDragOver = dragOverFolder === node.path;
          return (
            <li
              key={`d:${node.path}`}
              className="tree__folder-li"
              role="treeitem"
              aria-expanded={open}
            >
              <div className="tree__row-wrap">
                <button
                  type="button"
                  className={`tree__row tree__folder ${isDragOver ? 'is-dragover' : ''}`}
                  style={{ paddingLeft: 8 + depth * 12 }}
                  onClick={() => onToggle(node.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenFolderMenu(node.path, e);
                  }}
                  draggable
                  onDragStart={(e) => onFolderDragStart(e, node.path)}
                  onDragOver={(e) => onFolderDragOver(e, node.path)}
                  onDragLeave={onFolderDragLeave}
                  onDrop={(e) => onFolderDrop(e, node.path)}
                >
                  <span className="tree__chevron">{open ? '▼' : '▶'}</span>
                  <span className="tree__icon">
                    <FolderItemIcon />
                  </span>
                  <span className="tree__label">{node.name}</span>
                </button>
                <button
                  type="button"
                  className="tree__menu-btn"
                  onClick={(e) => onOpenFolderMenu(node.path, e)}
                  title="その他の操作"
                  aria-label="その他の操作"
                >
                  <KebabIcon />
                </button>
              </div>
              {open && (
                <TreeView
                  nodes={node.children}
                  depth={depth + 1}
                  activeId={activeId}
                  onSelect={onSelect}
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                  onOpenFileMenu={onOpenFileMenu}
                  onOpenFolderMenu={onOpenFolderMenu}
                  dragOverFolder={dragOverFolder}
                  onFileDragStart={onFileDragStart}
                  onFolderDragStart={onFolderDragStart}
                  onFolderDragOver={onFolderDragOver}
                  onFolderDragLeave={onFolderDragLeave}
                  onFolderDrop={onFolderDrop}
                />
              )}
            </li>
          );
        }

        const f = node.file;
        const active = activeId === f.id;
        const isProtected = f.protected === true;
        const isSecret = f.secret === true;
        return (
          <li
            key={`f:${f.id}`}
            className={`tree__file-li ${isProtected ? 'is-protected' : ''} ${isSecret ? 'is-secret' : ''}`}
            role="treeitem"
          >
            <button
              type="button"
              className={`tree__row tree__file ${active ? 'is-active' : ''}`}
              style={{ paddingLeft: 8 + depth * 12 + 16 }}
              onClick={() => onSelect(f.id)}
              onContextMenu={(e) => {
                // 右クリック: ケバブメニューと同じネイティブメニューを開く
                e.preventDefault();
                onOpenFileMenu(f, e);
              }}
              draggable
              onDragStart={(e) => onFileDragStart(e, f.id)}
            >
              <span className="tree__icon">
                <FileItemIcon />
              </span>
              <span className="tree__label">{f.title}</span>
            </button>
            {isSecret && (
              <span
                className="tree__secret-indicator"
                title="シークレット"
                aria-label="シークレット"
              >
                <SecretSmallIcon />
              </span>
            )}
            {isProtected && (
              <span
                className="tree__lock-indicator"
                title="保護中"
                aria-label="保護中"
              >
                <LockSmallIcon />
              </span>
            )}
            <button
              type="button"
              className="tree__menu-btn"
              onClick={(e) => onOpenFileMenu(f, e)}
              title="その他の操作"
              aria-label="その他の操作"
            >
              <KebabIcon />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function KebabIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="3.2" r="1.3" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="12.8" r="1.3" />
    </svg>
  );
}

// ----- メニュー項目用アイコン -----

function RenameIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 13 L3 10 L11 2 A1 1 0 0 1 12.5 2 L14 3.5 A1 1 0 0 1 14 5 L6 13 Z" />
      <path d="M9.5 3.5 L12.5 6.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4 H13.5" />
      <path d="M5 4 V2.8 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V4" />
      <path d="M3.6 4 l0.7 9.2 a1 1 0 0 0 1 0.9 h5.4 a1 1 0 0 0 1 -0.9 L12.4 4" />
      <path d="M6.5 6.8 V12 M9.5 6.8 V12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.2" y="7" width="9.6" height="7" rx="1.2" />
      <path d="M5.2 7 V4.8 a2.8 2.8 0 0 1 5.6 0 V7" />
    </svg>
  );
}

/** ファイル行の右端に表示する小さな錠前アイコン（塗りつぶし） */
function LockSmallIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.2" y="7" width="9.6" height="7" rx="1.2" />
      <path d="M5.2 7 V4.8 a2.8 2.8 0 0 1 5.6 0 V7" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.2" y="7" width="9.6" height="7" rx="1.2" />
      <path d="M5.2 7 V4.8 a2.8 2.8 0 0 1 5.6 0" />
    </svg>
  );
}

/** シークレット用の目に斜線アイコン */
function SecretIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 8 C 4 4.5, 6 3.5, 8 3.5 C 10 3.5, 12 4.5, 14 8 C 12 11.5, 10 12.5, 8 12.5 C 6 12.5, 4 11.5, 2 8 Z" />
      <circle cx="8" cy="8" r="2" />
      <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" />
    </svg>
  );
}

/** ファイル行の右端に表示する小さなシークレットインジケータ */
function SecretSmallIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 8 C 4 4.5, 6 3.5, 8 3.5 C 10 3.5, 12 4.5, 14 8 C 12 11.5, 10 12.5, 8 12.5 C 6 12.5, 4 11.5, 2 8 Z" />
      <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" />
    </svg>
  );
}

// ----- アイコン (16x16 の単純な線画 SVG) -----

/** すべて展開アイコン (20x20) — 中央の四角から上下に矢印が離れる */
function ExpandAllIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="8" height="8" rx="1.2" />
      <path d="M10 2 L7 5" />
      <path d="M10 2 L13 5" />
      <path d="M10 18 L7 15" />
      <path d="M10 18 L13 15" />
    </svg>
  );
}

/** すべて折りたたむアイコン (20x20) — 上下から中央の四角に矢印が向かう */
function CollapseAllIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="8" height="8" rx="1.2" />
      <path d="M10 5 L7 2" />
      <path d="M10 5 L13 2" />
      <path d="M10 15 L7 18" />
      <path d="M10 15 L13 18" />
    </svg>
  );
}

/** 新規メモ作成アイコン (20x20) — 角丸四角 + 斜めペン */
function NewFileIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 角丸の四角 — 右上が開いている */}
      <path d="M11 3 H5 A2 2 0 0 0 3 5 V15 A2 2 0 0 0 5 17 H15 A2 2 0 0 0 17 15 V9" />
      {/* ペンの本体（太めの斜め長方形） */}
      <rect x="11.8" y="1.2" width="3" height="10" rx="0.8" transform="rotate(45 13.3 6.2)" />
      {/* ペン先の区切り線 */}
      <line x1="8.2" y1="11" x2="9.8" y2="12.6" transform="rotate(0)" />
    </svg>
  );
}

/** ツリー行に表示する小さなフォルダアイコン (14x14) */
function FolderItemIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4.25a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
    </svg>
  );
}

/** ツリー行に表示する小さなファイルアイコン (14x14) */
function FileItemIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 1.75h5.5L13 6.25v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.75a1 1 0 0 1 1-1z" />
      <path d="M8.5 1.75v4.5H13" />
    </svg>
  );
}
