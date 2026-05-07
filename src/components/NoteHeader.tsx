interface Props {
  /** スラッシュ区切りのパス形式ファイル名（例: "階層1/テスト1"） */
  name: string;
  view: 'edit' | 'preview';
  onNameChange: (next: string) => void;
  onSelectView: (next: 'edit' | 'preview') => void;
  onSummarizeClick: (position: { x: number; y: number }) => void;
  summarizeDisabled: boolean;
  summarizeBusy: boolean;
}

/**
 * ノートヘッダ: ファイル名入力 + 表示モードトグル + ケバブメニュー（OS ネイティブ）。
 * ケバブはネイティブメニューを使うのでウィンドウ境界を超えて展開可能。
 */
export default function NoteHeader({
  name,
  view,
  onNameChange,
  onSelectView,
  onSummarizeClick,
  summarizeDisabled,
  summarizeBusy,
}: Props) {
  // 現在の表示モードと逆のモードへ切り替えるトグル。
  // ボタンには「次に切り替わる先」のアイコンを表示する。
  const next: 'edit' | 'preview' = view === 'edit' ? 'preview' : 'edit';
  const label = next === 'preview' ? 'プレビューに切替' : '編集に切替';

  const openKebabMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // ボタン左下にメニューを展開するよう位置を渡す
    void window.api.ui.showNoteMenu({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    });
  };

  const openSummarizeMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSummarizeClick({
      x: Math.round(rect.left),
      y: Math.round(rect.bottom),
    });
  };

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
        className="note-header__summary-btn"
        onClick={openSummarizeMenu}
        disabled={summarizeDisabled || summarizeBusy}
        title="AIでノートを整形・要約"
        aria-label="要約"
        aria-busy={summarizeBusy}
      >
        {summarizeBusy ? '処理中' : '要約'}
      </button>
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
      <button
        type="button"
        className="view-toggle__btn view-toggle__btn--single"
        onClick={openKebabMenu}
        title="メニュー"
        aria-label="その他のメニュー"
        aria-haspopup="menu"
      >
        <KebabIcon />
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

function KebabIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}
