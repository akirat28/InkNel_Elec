import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import MarkdownIt from 'markdown-it';
import {
  highlightCode,
  resolveHighlightLangId,
} from '../utils/highlight';

interface Props {
  value: string;
  /** TagBar で設定された、このノートに紐づくタグ一覧（プレビュー先頭に表示） */
  tags?: string[];
  /** コードブロックのコピーボタンを常に表示するか（false ならホバー時のみ） */
  codeCopyAlwaysVisible?: boolean;
  /** シンタックスハイライトを適用する言語の id 一覧 */
  enabledHighlightLangs?: string[];
}

export default function Preview({
  value,
  tags,
  codeCopyAlwaysVisible,
  enabledHighlightLangs,
}: Props) {
  // 有効な言語の Set を作って fence ルールから参照
  const enabledLangSet = useMemo(
    () => new Set(enabledHighlightLangs ?? []),
    [enabledHighlightLangs],
  );
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

    // ----- コード（fenced / インデント / インライン）にコピーボタンを埋め込む -----
    // クリック時のハンドラは renderer 側ではなく、上位の handleClick で
    // [data-copy-code] への delegation で処理する。
    // コード本体は data 属性に encodeURIComponent して格納（XSS / 引用符問題を回避）。
    const escapeHtml = instance.utils.escapeHtml;

    // コピー前/コピー後のアイコン (16x16 線画 SVG)。
    // .is-copied クラスで表示が切り替わる。
    const COPY_ICON_SVG =
      '<svg class="code-copy-btn__icon code-copy-btn__icon--copy" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="5" y="5" width="9" height="9" rx="1.4"/>' +
      '<path d="M11 5 V3.4 a1 1 0 0 0 -1 -1 H3.4 a1 1 0 0 0 -1 1 V10 a1 1 0 0 0 1 1 H5"/>' +
      '</svg>';
    const CHECK_ICON_SVG =
      '<svg class="code-copy-btn__icon code-copy-btn__icon--check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 8.5 L6.5 12 L13 4.5"/>' +
      '</svg>';

    const renderCopyBtn = (code: string, inline: boolean): string => {
      const encoded = encodeURIComponent(code);
      const cls = inline
        ? 'code-copy-btn code-copy-btn--inline'
        : 'code-copy-btn';
      return (
        `<button type="button" class="${cls}" data-copy-code="${encoded}"` +
        ` title="コードをコピー" aria-label="コードをコピー">` +
        COPY_ICON_SVG +
        CHECK_ICON_SVG +
        `</button>`
      );
    };

    instance.renderer.rules.fence = (tokens, idx) => {
      const token = tokens[idx];
      const code = token.content;
      const rawLang = token.info.trim().split(/\s+/)[0];

      // 設定で有効化されている言語ならハイライトを適用
      const langId = resolveHighlightLangId(rawLang);
      let codeHtml: string;
      let codeClass: string;
      if (langId && enabledLangSet.has(langId)) {
        const highlighted = highlightCode(code, langId);
        if (highlighted !== null) {
          codeHtml = highlighted;
          codeClass = ` class="hljs language-${escapeHtml(langId)}"`;
        } else {
          codeHtml = escapeHtml(code);
          codeClass = ` class="language-${escapeHtml(langId)}"`;
        }
      } else {
        codeHtml = escapeHtml(code);
        codeClass = rawLang
          ? ` class="language-${escapeHtml(rawLang)}"`
          : '';
      }

      const langLabel = rawLang
        ? `<span class="code-block-wrap__lang">${escapeHtml(rawLang)}</span>`
        : '';
      return (
        `<div class="code-block-wrap">` +
        `${langLabel}` +
        `${renderCopyBtn(code, false)}` +
        `<pre><code${codeClass}>${codeHtml}</code></pre>` +
        `</div>`
      );
    };

    instance.renderer.rules.code_block = (tokens, idx) => {
      const code = tokens[idx].content;
      return (
        `<div class="code-block-wrap">` +
        `${renderCopyBtn(code, false)}` +
        `<pre><code>${escapeHtml(code)}</code></pre>` +
        `</div>`
      );
    };

    instance.renderer.rules.code_inline = (tokens, idx) => {
      const code = tokens[idx].content;
      return (
        `<span class="code-inline-wrap">` +
        `<code>${escapeHtml(code)}</code>` +
        `${renderCopyBtn(code, true)}` +
        `</span>`
      );
    };

    return instance;
    // enabledLangSet が変わったらインスタンス再生成（fence ルールが set をクロージャで掴むため）
  }, [enabledLangSet]);

  const html = useMemo(() => md.render(value), [md, value]);

  // ----- ライトボックス（クリックで拡大表示） -----
  const [zoomedSrc, setZoomedSrc] = useState<string | null>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // 0) コピーボタン: コード内容をクリップボードへ
    const copyBtn = target.closest('[data-copy-code]') as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const encoded = copyBtn.getAttribute('data-copy-code') ?? '';
      let code = '';
      try {
        code = decodeURIComponent(encoded);
      } catch {
        code = encoded;
      }
      void navigator.clipboard
        .writeText(code)
        .then(() => {
          copyBtn.classList.add('is-copied');
          copyBtn.setAttribute('aria-label', 'コピーしました');
          window.setTimeout(() => {
            copyBtn.classList.remove('is-copied');
            copyBtn.setAttribute('aria-label', 'コードをコピー');
          }, 1500);
        })
        .catch(() => {
          copyBtn.classList.add('is-failed');
          window.setTimeout(() => {
            copyBtn.classList.remove('is-failed');
          }, 1500);
        });
      return;
    }

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

  const visibleTags = tags?.filter((t) => t.length > 0) ?? [];

  return (
    <>
      <div
        className={`preview markdown-body ${codeCopyAlwaysVisible ? 'is-code-copy-pinned' : ''}`}
        onClick={handleClick}
      >
        {visibleTags.length > 0 && (
          <div className="preview__tags" aria-label="タグ">
            {visibleTags.map((tag, i) => (
              <span key={`${tag}-${i}`} className="preview__tag-badge">
                <span className="preview__tag-dot" aria-hidden="true" />
                <span className="preview__tag-hash" aria-hidden="true">
                  #
                </span>
                <span className="preview__tag-name">{tag}</span>
              </span>
            ))}
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
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
