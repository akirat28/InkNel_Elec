import type { RefObject } from 'react';
import type { EditorHandle } from './Editor';

interface Props {
  editorRef: RefObject<EditorHandle>;
}

/**
 * 編集ビュー時の上部に表示するマークダウン挿入ツールバー。
 * 編集/プレビューの切替は NoteHeader 側のセグメントトグルが担当する。
 */
export default function EditorToolbar({ editorRef }: Props) {
  const wrap = (before: string, after: string, placeholder?: string) =>
    editorRef.current?.wrap(before, after, placeholder);
  const prefix = (p: string) => editorRef.current?.prefixLine(p);
  const insert = (s: string) => editorRef.current?.insert(s);

  return (
    <div className="md-toolbar" role="toolbar" aria-label="編集ツールバー">
      <div className="md-toolbar__group">
        <ToolBtn label="見出し1 (#)" onClick={() => prefix('# ')}>
          H1
        </ToolBtn>
        <ToolBtn label="見出し2 (##)" onClick={() => prefix('## ')}>
          H2
        </ToolBtn>
        <ToolBtn label="見出し3 (###)" onClick={() => prefix('### ')}>
          H3
        </ToolBtn>
      </div>

      <div className="md-toolbar__divider" />

      <div className="md-toolbar__group">
        <ToolBtn label="太字 (**…**)" onClick={() => wrap('**', '**', '太字')}>
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn label="斜体 (*…*)" onClick={() => wrap('*', '*', '斜体')}>
          <em>I</em>
        </ToolBtn>
        <ToolBtn
          label="取り消し線 (~~…~~)"
          onClick={() => wrap('~~', '~~', '取り消し線')}
        >
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolBtn>
        <ToolBtn
          label="インラインコード (`…`)"
          onClick={() => wrap('`', '`', 'code')}
        >
          <code>{'<>'}</code>
        </ToolBtn>
      </div>

      <div className="md-toolbar__divider" />

      <div className="md-toolbar__group">
        <ToolBtn label="箇条書き (- )" onClick={() => prefix('- ')}>
          •
        </ToolBtn>
        <ToolBtn label="番号付きリスト (1. )" onClick={() => prefix('1. ')}>
          1.
        </ToolBtn>
        <ToolBtn label="タスクリスト (- [ ])" onClick={() => prefix('- [ ] ')}>
          ☐
        </ToolBtn>
        <ToolBtn label="引用 (> )" onClick={() => prefix('> ')}>
          ❝
        </ToolBtn>
      </div>

      <div className="md-toolbar__divider" />

      <div className="md-toolbar__group">
        <ToolBtn
          label="リンク [text](url)"
          onClick={() => wrap('[', '](url)', 'リンクテキスト')}
        >
          🔗
        </ToolBtn>
        <ToolBtn
          label="コードブロック (```)"
          onClick={() => insert('\n```\n\n```\n')}
        >
          {'{ }'}
        </ToolBtn>
        <ToolBtn label="区切り線 (---)" onClick={() => insert('\n---\n')}>
          ―
        </ToolBtn>
      </div>
    </div>
  );
}

interface ToolBtnProps {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}

function ToolBtn({ label, onClick, children }: ToolBtnProps) {
  return (
    <button
      type="button"
      className="md-toolbar__btn"
      onClick={onClick}
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
