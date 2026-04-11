interface Props {
  /** スラッシュ区切りのパス形式ファイル名（例: "階層1/テスト1"） */
  name: string;
  view: 'edit' | 'preview';
  onNameChange: (next: string) => void;
  onSelectView: (next: 'edit' | 'preview') => void;
}

export default function NoteHeader({
  name,
  view,
  onNameChange,
  onSelectView,
}: Props) {
  return (
    <div className="note-header">
      <input
        className="note-header__name"
        type="text"
        value={name}
        placeholder="ファイル名 (例: 階層1/テスト1)"
        onChange={(e) => onNameChange(e.target.value)}
      />
      <div className="view-toggle" role="tablist" aria-label="表示切替">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'edit'}
          className={`view-toggle__btn ${view === 'edit' ? 'is-active' : ''}`}
          onClick={() => onSelectView('edit')}
          title="編集"
          aria-label="編集"
        >
          <EditIcon />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'preview'}
          className={`view-toggle__btn ${view === 'preview' ? 'is-active' : ''}`}
          onClick={() => onSelectView('preview')}
          title="プレビュー"
          aria-label="プレビュー"
        >
          <PreviewIcon />
        </button>
      </div>
    </div>
  );
}

// ----- 16x16 SVGアイコン -----

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20 L4.5 16 L16.5 4 A1.4 1.4 0 0 1 18.5 4 L20 5.5 A1.4 1.4 0 0 1 20 7.5 L8 19.5 Z" />
      <path d="M14.5 6 L18 9.5" />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12 C 5 6.5, 8.5 4.5, 12 4.5 C 15.5 4.5, 19 6.5, 21.5 12 C 19 17.5, 15.5 19.5, 12 19.5 C 8.5 19.5, 5 17.5, 2.5 12 Z" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  );
}
