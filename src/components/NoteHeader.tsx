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
  // 現在の表示モードと逆のモードへ切り替えるトグル。
  // ボタンには「次に切り替わる先」のアイコンを表示する。
  const next: 'edit' | 'preview' = view === 'edit' ? 'preview' : 'edit';
  const label = next === 'preview' ? 'プレビューに切替' : '編集に切替';

  return (
    <div className="note-header">
      <input
        className="note-header__name"
        type="text"
        value={name}
        placeholder="ファイル名 (例: 階層1/テスト1)"
        onChange={(e) => onNameChange(e.target.value)}
      />
      <button
        type="button"
        className="view-toggle__btn view-toggle__btn--single"
        onClick={() => onSelectView(next)}
        title={label}
        aria-label={label}
        aria-pressed={view === 'preview'}
      >
        {next === 'preview' ? <PreviewIcon /> : <EditIcon />}
      </button>
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
