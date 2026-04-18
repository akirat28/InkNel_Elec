import { useState } from 'react';
import type { NoteMeta } from '../global';
import { buildPath } from '../utils/notePath';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';

interface Props {
  openTabIds: string[];
  activeId: string | null;
  notes: NoteMeta[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /** 複数タブを一括で閉じる（右クリックメニュー経由） */
  onCloseMany: (ids: string[]) => void;
}

/**
 * メイン領域の最上部に表示するタブバー。
 * 開かれているノートを横並びで表示し、クリックでアクティブタブを切替、
 * × ボタンで個別に閉じる。右クリックで下記メニューを表示:
 *   - このタブを閉じる
 *   - すべてのタブを閉じる
 *   - 右のタブをすべて閉じる
 */
export default function TabBar({
  openTabIds,
  activeId,
  notes,
  onSelect,
  onClose,
  onCloseMany,
}: Props) {
  // 右クリックメニューの表示位置 + 対象タブ ID
  const [menu, setMenu] = useState<
    { x: number; y: number; tabId: string } | null
  >(null);

  if (openTabIds.length === 0) return null;

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, tabId: id });
  };

  const closeMenu = () => setMenu(null);

  const menuItems: ContextMenuItem[] = menu
    ? (() => {
        const idx = openTabIds.indexOf(menu.tabId);
        const rightIds = idx >= 0 ? openTabIds.slice(idx + 1) : [];
        const otherIds = openTabIds.filter((x) => x !== menu.tabId);
        return [
          {
            label: 'このタブを閉じる',
            onClick: () => onClose(menu.tabId),
          },
          {
            label: '他を閉じる',
            disabled: otherIds.length === 0,
            onClick: () => onCloseMany(otherIds),
          },
          {
            label: 'すべてのタブを閉じる',
            onClick: () => onCloseMany([...openTabIds]),
          },
          {
            label: '右のタブをすべて閉じる',
            disabled: rightIds.length === 0,
            onClick: () => onCloseMany(rightIds),
          },
        ];
      })()
    : [];

  return (
    <>
      <div className="tab-bar" role="tablist">
        {openTabIds.map((id) => {
          const meta = notes.find((n) => n.id === id);
          const title = meta?.title || '無題';
          const fullPath = meta ? buildPath(meta.folder, meta.title) : title;
          const isActive = id === activeId;
          return (
            <div
              key={id}
              className={'tab' + (isActive ? ' tab--active' : '')}
              role="tab"
              aria-selected={isActive}
              title={fullPath}
              onMouseDown={(e) => {
                // ミドルクリックで閉じる
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(id);
                } else if (e.button === 0 && !isActive) {
                  onSelect(id);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, id)}
            >
              <span className="tab__title">{title}</span>
              <button
                type="button"
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(id);
                }}
                aria-label="タブを閉じる"
                title="タブを閉じる"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
        />
      )}
    </>
  );
}
