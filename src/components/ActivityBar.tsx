export type SidebarMode = 'files' | 'search' | 'tags';

interface Props {
  sidebarMode: SidebarMode;
  onSelectFiles: () => void;
  onSelectSearch: () => void;
  onSelectTags: () => void;
  onOpenSettings: () => void;
}

interface IconButtonProps {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function IconButton({ active, label, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`activity__btn ${active ? 'is-active' : ''}`}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export default function ActivityBar({
  sidebarMode,
  onSelectFiles,
  onSelectSearch,
  onSelectTags,
  onOpenSettings,
}: Props) {
  const filesActive = sidebarMode === 'files';
  const searchActive = sidebarMode === 'search';
  const tagsActive = sidebarMode === 'tags';

  return (
    <nav className="activity" aria-label="アクティビティバー">
      <div className="activity__group activity__group--top">
        <IconButton
          label="ファイル"
          active={filesActive}
          onClick={onSelectFiles}
        >
          <FileIcon />
        </IconButton>
        <IconButton
          label="検索"
          active={searchActive}
          onClick={onSelectSearch}
        >
          <SearchIcon />
        </IconButton>
        <IconButton
          label="タグ"
          active={tagsActive}
          onClick={onSelectTags}
        >
          <TagIcon />
        </IconButton>
      </div>
      <div className="activity__group activity__group--bottom">
        <IconButton label="設定" onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
      </div>
    </nav>
  );
}

// ----- 24x24 SVGアイコン（線画スタイル、currentColor で色追従） -----

function FileIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 3 h9 L19 8 v12 a1 1 0 0 1 -1 1 H5 a1 1 0 0 1 -1 -1 V4 a1 1 0 0 1 1 -1 z" />
      <path d="M14 3 v5 h5" />
      <path d="M8 13 h7 M8 16.5 h7 M8 20 h4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5 L20 20" />
    </svg>
  );
}

/** タグ（値札）アイコン */
function TagIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12 L12 3 H21 V12 L12 21 Z" />
      <circle cx="16.5" cy="7.5" r="1.3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2 L12 5 M12 19 L12 22 M2 12 L5 12 M19 12 L22 12 M4.6 4.6 L6.7 6.7 M17.3 17.3 L19.4 19.4 M4.6 19.4 L6.7 17.3 M17.3 6.7 L19.4 4.6" />
    </svg>
  );
}
