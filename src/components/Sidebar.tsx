import { useEffect, useMemo, useRef, useState } from 'react';
import type { FileItem, TreeNode } from '../types';
import { buildTree } from '../utils/buildTree';
import ContextMenu from './ContextMenu';
import SearchPanel from './SearchPanel';
import type { NoteMeta } from '../global';

export type SidebarMode = 'files' | 'search';

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
  onCreateFolder: () => void;
  onDeleteNote: (id: string) => void;
  onToggleProtect: (id: string, next: boolean) => void;
  onSearch: (query: string) => Promise<NoteMeta[]>;
  searchHistory: string[];
  onAddSearchHistory: (query: string) => void;
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
  onCreateFolder,
  onDeleteNote,
  onToggleProtect,
  onSearch,
  searchHistory,
  onAddSearchHistory,
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

  // ファイル行のコンテキストメニュー
  const [menuState, setMenuState] = useState<{
    fileId: string;
    fileTitle: string;
    isProtected: boolean;
    x: number;
    y: number;
  } | null>(null);

  const openMenuFor = (file: FileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    setMenuState({
      fileId: file.id,
      fileTitle: file.title,
      isProtected: file.protected === true,
      // kebab ボタンの右側に少し余白を空けて配置（吹き出しの三角分）
      x: rect.right + 8,
      y: rect.top - 4,
    });
  };

  const closeMenu = () => setMenuState(null);

  const handleDeleteFromMenu = () => {
    if (!menuState) return;
    if (menuState.isProtected) return; // ダブルチェック（disabled なので普通は通らない）
    if (
      !window.confirm(`「${menuState.fileTitle || '無題'}」を削除しますか？`)
    ) {
      return;
    }
    onDeleteNote(menuState.fileId);
  };

  const handleToggleProtectFromMenu = () => {
    if (!menuState) return;
    onToggleProtect(menuState.fileId, !menuState.isProtected);
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
            {mode === 'files' ? 'ファイル' : '検索'}
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
              <button
                type="button"
                className="sidebar__icon-btn"
                onClick={onCreateFolder}
                title="新しいフォルダを作成"
                aria-label="新しいフォルダを作成"
              >
                <NewFolderIcon />
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
                onOpenMenu={openMenuFor}
              />
            )}
          </div>
        ) : (
          <SearchPanel
            onSearch={onSearch}
            onSelect={onSelect}
            activeId={activeId}
            history={searchHistory}
            onAddHistory={onAddSearchHistory}
          />
        )}
      </div>
      {menuState && (
        <ContextMenu
          x={menuState.x}
          y={menuState.y}
          onClose={closeMenu}
          items={[
            {
              label: menuState.isProtected ? '保護解除' : '保護',
              icon: menuState.isProtected ? <UnlockIcon /> : <LockIcon />,
              onClick: handleToggleProtectFromMenu,
            },
            {
              label: '削除',
              icon: <TrashIcon />,
              danger: true,
              disabled: menuState.isProtected,
              onClick: handleDeleteFromMenu,
            },
          ]}
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
  onOpenMenu: (file: FileItem, e: React.MouseEvent) => void;
}

function TreeView({
  nodes,
  depth,
  activeId,
  onSelect,
  isExpanded,
  onToggle,
  onOpenMenu,
}: TreeViewProps) {
  return (
    <ul className="tree" role="tree">
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const open = isExpanded(node.path);
          return (
            <li key={`d:${node.path}`} role="treeitem" aria-expanded={open}>
              <button
                type="button"
                className="tree__row tree__folder"
                style={{ paddingLeft: 8 + depth * 12 }}
                onClick={() => onToggle(node.path)}
              >
                <span className="tree__chevron">{open ? '▼' : '▶'}</span>
                <span className="tree__label">{node.name}</span>
              </button>
              {open && (
                <TreeView
                  nodes={node.children}
                  depth={depth + 1}
                  activeId={activeId}
                  onSelect={onSelect}
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                  onOpenMenu={onOpenMenu}
                />
              )}
            </li>
          );
        }

        const f = node.file;
        const active = activeId === f.id;
        const isProtected = f.protected === true;
        return (
          <li
            key={`f:${f.id}`}
            className={`tree__file-li ${isProtected ? 'is-protected' : ''}`}
            role="treeitem"
          >
            <button
              type="button"
              className={`tree__row tree__file ${active ? 'is-active' : ''}`}
              style={{ paddingLeft: 8 + depth * 12 + 14 }}
              onClick={() => onSelect(f.id)}
            >
              <span className="tree__label">{f.title}</span>
            </button>
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
              onClick={(e) => onOpenMenu(f, e)}
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

function NewFolderIcon() {
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
      <path d="M2 4.25a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <path d="M8 8.5v3.5M6.25 10.25h3.5" />
    </svg>
  );
}
