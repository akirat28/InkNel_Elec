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

/** ギア（歯車）型の設定アイコン */
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
      <path d="M19.43 12.98a7.78 7.78 0 0 0 0-1.96l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.7 7.7 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.6.24-1.17.57-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65a7.78 7.78 0 0 0 0 1.96l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.52.41 1.09.74 1.69.98l.38 2.65c.05.24.26.42.5.42h4c.24 0 .45-.18.5-.42l.38-2.65c.6-.24 1.17-.57 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
