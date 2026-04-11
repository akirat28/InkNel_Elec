import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileItem, TreeNode } from '../types';
import { buildTree } from '../utils/buildTree';
import ContextMenu from './ContextMenu';
import SearchPanel from './SearchPanel';
import TagsPanel from './TagsPanel';
import type { NoteMeta } from '../global';

export type SidebarMode = 'files' | 'search' | 'tags';

/** ノート ID をやりとりする独自の DataTransfer タイプ */
const NOTE_DRAG_TYPE = 'application/x-inknel-note-id';

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
  onDeleteNote: (id: string) => void;
  onToggleProtect: (id: string, next: boolean) => void;
  onToggleSecret: (id: string, next: boolean) => void;
  onSearch: (query: string) => Promise<NoteMeta[]>;
  searchHistory: string[];
  onAddSearchHistory: (query: string) => void;
  /** ファイルを別フォルダへドラッグ&ドロップで移動 */
  onMoveNote: (noteId: string, targetFolder: string) => void;
  /** ノートの名称変更ダイアログを開く */
  onRenameNote: (noteId: string) => void;
  /** フォルダの名称変更ダイアログを開く */
  onRenameFolder: (folderPath: string) => void;
}

export default function Sidebar({
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
  onDeleteNote,
  onToggleProtect,
  onToggleSecret,
  onSearch,
  searchHistory,
  onAddSearchHistory,
  onMoveNote,
  onRenameNote,
  onRenameFolder,
}: Props) {
  const tree = useMemo(
    () => buildTree(files, extraFolders),
    [files, extraFolders],
  );

  // フォルダの展開状態（path -> bool）。デフォルトは全展開。
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const isExpanded = (path: string) => expanded[path] !== false;
  const toggle = (path: string) =>
    setExpanded((prev) => ({ ...prev, [path]: !isExpanded(path) }));

  // ファイル/フォルダ行のコンテキストメニュー（kindで判別）
  type MenuState =
    | {
        kind: 'file';
        fileId: string;
        fileTitle: string;
        isProtected: boolean;
        isSecret: boolean;
        x: number;
        y: number;
      }
    | {
        kind: 'folder';
        folderPath: string;
        x: number;
        y: number;
      };
  const [menuState, setMenuState] = useState<MenuState | null>(null);

  const openFileMenu = (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    setMenuState({
      kind: 'file',
      fileId: file.id,
      fileTitle: file.title,
      isProtected: file.protected === true,
      isSecret: file.secret === true,
      x: rect.right + 8,
      y: rect.top - 4,
    });
  };

  const openFolderMenu = (folderPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    setMenuState({
      kind: 'folder',
      folderPath,
      x: rect.right + 8,
      y: rect.top - 4,
    });
  };

  const closeMenu = () => setMenuState(null);

  const handleDeleteFromMenu = () => {
    if (!menuState || menuState.kind !== 'file') return;
    if (menuState.isProtected) return;
    if (
      !window.confirm(`「${menuState.fileTitle || '無題'}」を削除しますか？`)
    ) {
      return;
    }
    onDeleteNote(menuState.fileId);
  };

  const handleToggleProtectFromMenu = () => {
    if (!menuState || menuState.kind !== 'file') return;
    onToggleProtect(menuState.fileId, !menuState.isProtected);
  };

  const handleToggleSecretFromMenu = () => {
    if (!menuState || menuState.kind !== 'file') return;
    onToggleSecret(menuState.fileId, !menuState.isSecret);
  };

  const handleRenameFileFromMenu = () => {
    if (!menuState || menuState.kind !== 'file') return;
    onRenameNote(menuState.fileId);
  };

  const handleRenameFolderFromMenu = () => {
    if (!menuState || menuState.kind !== 'folder') return;
    onRenameFolder(menuState.folderPath);
  };

  // ----- ドラッグ&ドロップ（ファイル → フォルダ移動） -----
  // 現在ドラッグ対象のフォルダパス。視覚ハイライト用。
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const handleFileDragStart = (
    e: React.DragEvent<HTMLButtonElement>,
    noteId: string,
  ) => {
    e.dataTransfer.setData(NOTE_DRAG_TYPE, noteId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleFolderDragOver = (
    e: React.DragEvent<HTMLButtonElement>,
    path: string,
  ) => {
    if (!e.dataTransfer.types.includes(NOTE_DRAG_TYPE)) return;
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
    const noteId = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (!noteId) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolder(null);
    onMoveNote(noteId, path);
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
            {mode === 'files' ? 'ファイル' : mode === 'search' ? '検索' : 'タグ'}
          </span>
          {mode === 'files' && (
            <div className="sidebar__actions">
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
          <div className="sidebar__list">
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
        ) : (
          <TagsPanel activeId={activeId} onSelect={onSelect} />
        )}
      </div>
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={closeMenu}
          items={
            menuState.kind === 'file'
              ? [
                  {
                    label: '名称変更',
                    icon: <RenameIcon />,
                    onClick: handleRenameFileFromMenu,
                  },
                  {
                    label: menuState.isProtected ? '保護解除' : '保護',
                    icon: menuState.isProtected ? (
                      <UnlockIcon />
                    ) : (
                      <LockIcon />
                    ),
                    onClick: handleToggleProtectFromMenu,
                  },
                  {
                    label: menuState.isSecret
                      ? 'シークレット解除'
                      : 'シークレットにする',
                    icon: <SecretIcon />,
                    onClick: handleToggleSecretFromMenu,
                  },
                  {
                    label: '削除',
                    icon: <TrashIcon />,
                    danger: true,
                    disabled: menuState.isProtected,
                    onClick: handleDeleteFromMenu,
                  },
                ]
              : [
                  {
                    label: '名称変更',
                    icon: <RenameIcon />,
                    onClick: handleRenameFolderFromMenu,
                  },
                ]
          }
        />
      )}
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
}

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

function NewFileIcon() {
  return (
    <svg
      width="16"
      height="16"
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
      <path d="M7.5 9v4M5.5 11h4" />
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
