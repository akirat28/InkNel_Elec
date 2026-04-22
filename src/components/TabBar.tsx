import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** 1 回のクリックで横スクロールする量 (px) */
const SCROLL_STEP = 200;

/**
 * メイン領域の最上部に表示するタブバー。
 * タブが横幅を超えてあふれた場合は、スクロールバーの代わりに
 * 左右端の `<<` `>>` ボタンで横スクロールする UI を提供する。
 *
 * 右クリックでタブ個別メニュー:
 *   - このタブを閉じる
 *   - 他を閉じる
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

  // スクロール可能か（左/右）
  const listRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = listRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < maxScroll - 1);
  };

  // タブ数やウィンドウ幅が変わったらスクロール状態を再計算
  useLayoutEffect(() => {
    updateScrollState();
  }, [openTabIds.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    // ResizeObserver でタブリスト自身の幅変化に追従
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, []);

  // アクティブタブが表示領域外にあれば自動でスクロールして見えるようにする
  useLayoutEffect(() => {
    if (!activeId) return;
    const el = listRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(
      `[data-tab-id="${CSS.escape(activeId)}"]`,
    );
    if (!target) return;
    const elRect = el.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    if (tRect.left < elRect.left) {
      el.scrollBy({ left: tRect.left - elRect.left - 8, behavior: 'smooth' });
    } else if (tRect.right > elRect.right) {
      el.scrollBy({ left: tRect.right - elRect.right + 8, behavior: 'smooth' });
    }
  }, [activeId]);

  if (openTabIds.length === 0) return null;

  const scrollBy = (delta: number) => {
    listRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

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

  const showScrollControls = canScrollLeft || canScrollRight;

  return (
    <>
      <div className="tab-bar">
        {showScrollControls && (
          <button
            type="button"
            className="tab-bar__nav tab-bar__nav--left"
            onClick={() => scrollBy(-SCROLL_STEP)}
            disabled={!canScrollLeft}
            aria-label="タブを左へスクロール"
            title="タブを左へスクロール"
          >
            <ChevronLeftIcon />
            <ChevronLeftIcon />
          </button>
        )}
        <div className="tab-bar__list" role="tablist" ref={listRef}>
          {openTabIds.map((id) => {
            const meta = notes.find((n) => n.id === id);
            const title = meta?.title || '無題';
            const fullPath = meta
              ? buildPath(meta.folder, meta.title)
              : title;
            const isActive = id === activeId;
            return (
              <div
                key={id}
                data-tab-id={id}
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
        {showScrollControls && (
          <button
            type="button"
            className="tab-bar__nav tab-bar__nav--right"
            onClick={() => scrollBy(SCROLL_STEP)}
            disabled={!canScrollRight}
            aria-label="タブを右へスクロール"
            title="タブを右へスクロール"
          >
            <ChevronRightIcon />
            <ChevronRightIcon />
          </button>
        )}
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

function ChevronLeftIcon() {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}
