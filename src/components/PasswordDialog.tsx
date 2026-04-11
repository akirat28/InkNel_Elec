import { useEffect, useRef, useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  /** true を返すと正解、false でエラー表示 */
  onSubmit: (password: string) => boolean;
}

/**
 * 保護されたノートを編集ビューで開くための4桁パスワード入力ダイアログ。
 * Enter で送信、Escape で閉じる。
 */
export default function PasswordDialog({ open, onClose, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 開いた直後にリセット + フォーカス
  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
      // 描画後にフォーカス
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // ESC で閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    setValue(v);
    setError(null);
  };

  const handleSubmit = () => {
    if (value.length !== 4) {
      setError('パスワードは4桁の数字です');
      return;
    }
    const ok = onSubmit(value);
    if (!ok) {
      setError('パスワードが正しくありません');
      setValue('');
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="modal__backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal modal--password"
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id="password-title" className="modal__title">
            パスワード入力
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

        <div className="modal__body password-body">
          <p className="password-body__desc">
            このノートは保護されています。編集するには4桁のパスワードを入力してください。
          </p>
          <input
            ref={inputRef}
            className="password-body__input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={value}
            onChange={handleChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
            }}
            placeholder="••••"
            aria-invalid={error !== null}
          />
          {error && <p className="password-body__error">{error}</p>}
        </div>

        <footer className="modal__footer">
          <button type="button" className="modal__btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="modal__btn modal__btn--primary"
            onClick={handleSubmit}
          >
            解錠
          </button>
        </footer>
      </div>
    </div>
  );
}
