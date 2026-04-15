import type { NoteMeta } from '../global';
import { buildPath } from '../utils/notePath';

interface Props {
  openTabIds: string[];
  activeId: string | null;
  notes: NoteMeta[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * メイン領域の最上部に表示するタブバー。
 * 開かれているノートを横並びで表示し、クリックでアクティブタブを切替、
 * × ボタンで個別に閉じる。
 */
export default function TabBar({
  openTabIds,
  activeId,
  notes,
  onSelect,
  onClose,
}: Props) {
  if (openTabIds.length === 0) return null;

  return (
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
  );
}
