import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import MarkdownIt from 'markdown-it';

interface Props {
  value: string;
}

export default function Preview({ value }: Props) {
  const md = useMemo(() => {
    const instance = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true,
    });

    // 画像 src の書き換え:
    //   "images/<sha256>.<ext>" → "inknel-image://<sha256>.<ext>"
    // それ以外（http(s):, data:, file:, 既に inknel-image: など）はそのまま
    const defaultImageRule =
      instance.renderer.rules.image ??
      ((tokens, idx, opts, _env, self) =>
        self.renderToken(tokens, idx, opts));

    instance.renderer.rules.image = (tokens, idx, opts, env, self) => {
      const token = tokens[idx];
      const srcIdx = token.attrIndex('src');
      if (srcIdx >= 0 && token.attrs) {
        const src = token.attrs[srcIdx][1];
        // images/<hash>.<ext> 形式のみ書き換え（パス trasversal は受け付けない）
        if (/^images\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(src)) {
          const filename = src.slice('images/'.length);
          token.attrs[srcIdx][1] = `inknel-image://${filename}`;
        }
      }
      return defaultImageRule(tokens, idx, opts, env, self);
    };

    return instance;
  }, []);

  const html = useMemo(() => md.render(value), [md, value]);

  // ----- ライトボックス（クリックで拡大表示） -----
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 1) 先にアンカー判定（画像内アンカー = サムネイル付き添付リンクに対応）
    const anchor = target.closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href') ?? '';
      // 添付ファイル: attachments/<hash>.<ext> → OS既定アプリで開く
      const attMatch = href.match(/^attachments\/([a-f0-9]{64}\.[a-z0-9]{2,5})$/i);
      if (attMatch) {
        e.preventDefault();
        const filename = attMatch[1];
        void window.api.attachments.open(filename).catch((err) => {
          window.alert(
            err instanceof Error
              ? err.message
              : 'ファイルを開けませんでした',
          );
        });
        return;
      }
      // 外部URL: 既定ブラウザで開く（レンダラ内遷移を防ぐ）
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        void window.api.shell.openExternal(href);
        return;
      }
    }

    // 2) スタンドアロン画像（リンク内ではない） → ライトボックスで拡大
    if (target.tagName === 'IMG') {
      e.preventDefault();
      setZoomedSrc((target as HTMLImageElement).src);
      return;
    }
  };

  return (
    <>
      <div
        className="preview markdown-body"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {zoomedSrc && (
        <ImageLightbox
          src={zoomedSrc}
          onClose={() => setZoomedSrc(null)}
        />
      )}
    </>
  );
}

interface LightboxProps {
  src: string;
  onClose: () => void;
}

function ImageLightbox({ src, onClose }: LightboxProps) {
  // Escape キーで閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="拡大画像"
      onClick={onClose}
    >
      <img
        className="lightbox__img"
        src={src}
        alt=""
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        className="lightbox__close"
        onClick={onClose}
        aria-label="閉じる"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
