/**
 * Mermaid プラグイン (DL 版 / ランタイムロード対応)
 *
 * このファイルは InkNel のプラグインローダによって、
 *   userData/plugins/mermaid.js
 * から Blob URL 経由で動的 import される。
 *
 * mermaid 本体は CDN から動的 import するので、配布ファイルは小さい。
 * 初回プレビュー時にだけ CDN から ~600KB をダウンロードして以降キャッシュ。
 */

const MERMAID_CDN =
  'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

let mermaidPromise = null;
let currentTheme = null;

async function loadMermaid(theme) {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_CDN).then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  if (currentTheme !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily:
        'system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    });
    currentTheme = theme;
  }
  return mermaid;
}

function escape(s) {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export const manifest = {
  id: 'mermaid',
  label: 'Mermaid',
  description:
    '```mermaid コードブロックを、シーケンス図 / フローチャート / ER 図 / ガントチャート等として描画します。Mermaid 本体は初回プレビュー時に CDN から動的に読み込みます。',
};

export const renderFence = ({ code, lang, escapeHtml }) => {
  if (lang.toLowerCase() !== 'mermaid') return null;
  return (
    `<div class="mermaid-block" data-mermaid-source="${encodeURIComponent(code)}">` +
    escapeHtml(code) +
    `</div>`
  );
};

export const renderInPreview = async (root, { theme }) => {
  const blocks = root.querySelectorAll(
    '.mermaid-block:not([data-mermaid-rendered])',
  );
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid(theme);

  await Promise.all(
    Array.from(blocks).map(async (el, i) => {
      const source = decodeURIComponent(
        el.getAttribute('data-mermaid-source') ?? '',
      );
      const id = `mermaid-${Date.now()}-${i}`;
      try {
        const { svg, bindFunctions } = await mermaid.render(id, source);
        el.innerHTML = svg;
        bindFunctions?.(el);
        el.setAttribute('data-mermaid-rendered', 'true');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        el.innerHTML =
          `<pre class="mermaid-block__error">Mermaid 描画エラー: ` +
          `${escape(msg)}</pre>`;
        el.setAttribute('data-mermaid-rendered', 'error');
      } finally {
        // mermaid v11 は構文エラー時に document.body 直下へ
        // 「Syntax error in text / mermaid version …」を含む一時要素を
        // 残すことがあるため、ここで明示的に除去する。
        cleanupMermaidLeftovers(id);
      }
    }),
  );
  // 取りこぼし対策: ID で特定できなかった残骸（mermaid 内部で生成された
  // 別 ID の error SVG / tooltip 等）も最後にまとめて掃除する
  cleanupMermaidLeftovers();
};

/**
 * mermaid.render() が document.body 直下に残す一時要素を除去。
 * id を渡せばその id に紐づくものだけ、未指定なら mermaid 関連すべてを掃除する。
 */
function cleanupMermaidLeftovers(id) {
  const selectors = id
    ? [
        `body > #d${id}`,
        `body > #${id}`,
        `body > svg#${id}`,
      ]
    : [
        'body > div[id^="dmermaid-"]',
        'body > svg[id^="mermaid-"]',
        'body > .mermaidTooltip',
        'body > .mermaid',
      ];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((n) => {
      if (n.parentElement === document.body) n.remove();
    });
  }
}

export const resetInPreview = (root) => {
  root
    .querySelectorAll('.mermaid-block[data-mermaid-rendered]')
    .forEach((el) => {
      el.removeAttribute('data-mermaid-rendered');
      const source = decodeURIComponent(
        el.getAttribute('data-mermaid-source') ?? '',
      );
      el.textContent = source;
    });
};
