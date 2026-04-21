import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  /** 「次を検索」: カーソル以降で次のヒットへ移動 */
  onFindNext: (query: string) => boolean;
  /** 「置換」: 現在の選択が query と一致していれば置換し、次のヒットへ */
  onReplaceCurrent: (query: string, replacement: string) => boolean;
  /** 「すべて置換」: 全ての一致を一括置換。置換件数を返す */
  onReplaceAll: (query: string, replacement: string) => number;
  onClose: () => void;
}

/**
 * 編集中ノートの検索・置換ダイアログ。
 * - 検索文字列と置換文字列を 2 つのテキスト欄で入力
 * - 「次を検索」「置換」「すべて置換」の 3 つのアクションを提供
 * - 結果メッセージ（件数や「見つかりません」）を下段に表示
 * - Escape で閉じる、Enter で次を検索
 */
export default function ReplaceDialog({
  open,
  onFindNext,
  onReplaceCurrent,
  onReplaceAll,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const queryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    setTimeout(() => {
      queryRef.current?.focus();
      queryRef.current?.select();
    }, 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const canSearch = query.length > 0;

  const handleFindNext = () => {
    if (!canSearch) return;
    const found = onFindNext(query);
    setMessage(found ? null : '該当する文字列は見つかりません');
  };

  const handleReplaceOnce = () => {
    if (!canSearch) return;
    const didReplace = onReplaceCurrent(query, replacement);
    if (didReplace) {
      setMessage('1 件置換しました');
      // 次のヒットに進む
      const next = onFindNext(query);
      if (!next) setMessage('1 件置換しました（他に一致はありません）');
    } else {
      // 選択が一致していない場合は、最初の一致に進むだけ
      const found = onFindNext(query);
      setMessage(
        found
          ? 'まず「置換」をもう一度押すと置換されます'
          : '該当する文字列は見つかりません',
      );
    }
  };

  const handleReplaceAll = () => {
    if (!canSearch) return;
    const count = onReplaceAll(query, replacement);
    setMessage(
      count > 0 ? `${count} 件を一括置換しました` : '該当する文字列は見つかりません',
    );
  };

  return (
    <div className="modal__backdrop" onClick={onClose} role="presentation">
      <div
        className="modal modal--replace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="replace-title" className="modal__title">
            置換
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ×
          </button>
        </header>

        <div className="modal__body replace-body">
          <label className="replace-body__label">
            検索
            <input
              ref={queryRef}
              className="replace-body__input"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFindNext();
              }}
              placeholder="置換元の文字列"
            />
          </label>

          <label className="replace-body__label">
            置換
            <input
              className="replace-body__input"
              type="text"
              value={replacement}
              onChange={(e) => {
                setReplacement(e.target.value);
                setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleReplaceOnce();
              }}
              placeholder="置換後の文字列（空欄で削除）"
            />
          </label>

          {message && <p className="replace-body__message">{message}</p>}
        </div>

        <footer className="modal__footer modal__footer--replace">
          <button
            type="button"
            className="modal__btn"
            onClick={handleFindNext}
            disabled={!canSearch}
          >
            次を検索
          </button>
          <button
            type="button"
            className="modal__btn"
            onClick={handleReplaceOnce}
            disabled={!canSearch}
          >
            置換
          </button>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={handleReplaceAll}
            disabled={!canSearch}
          >
            すべて置換
          </button>
          <button type="button" className="modal__btn" onClick={onClose}>
            閉じる
          </button>
        </footer>
      </div>
    </div>
  );
}
