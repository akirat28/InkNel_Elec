import { useState, type RefObject } from 'react';
import type { EditorHandle } from './Editor';
import TablePicker from './TablePicker';

interface Props {
  editorRef: RefObject<EditorHandle>;
}

/**
 * 行 × 列の指定からマークダウンテーブルの雛形を組み立てる。
 * 1 行目はヘッダ（`列1`, `列2`, ...）+ 区切り、残りはデータ行。
 */
function buildTableMarkdown(rows: number, cols: number): string {
  const headerCells = Array.from({ length: cols }, (_, i) => `列${i + 1}`);
  const sepCells = Array.from({ length: cols }, () => '---');
  const emptyCells = Array.from({ length: cols }, () => '   ');
  const buildRow = (cells: string[]) => '| ' + cells.join(' | ') + ' |';

  const lines: string[] = [];
  lines.push(buildRow(headerCells));
  lines.push(buildRow(sepCells));
  for (let i = 0; i < Math.max(0, rows - 1); i++) {
    lines.push(buildRow(emptyCells));
  }
  return '\n' + lines.join('\n') + '\n';
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

  // テーブルピッカー（吹き出し型ポップアップ）の表示位置
  const [tablePickerPos, setTablePickerPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const openTablePicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // ボタン真下に三角ポインタ分（8px）の余白を空けて配置
    setTablePickerPos({ x: rect.left, y: rect.bottom + 8 });
  };

  const handleTablePickerSelect = (rows: number, cols: number) => {
    insert(buildTableMarkdown(rows, cols));
    setTablePickerPos(null);
  };

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
        <ToolBtn label="見出し4 (####)" onClick={() => prefix('#### ')}>
          H4
        </ToolBtn>
        <ToolBtn label="見出し5 (#####)" onClick={() => prefix('##### ')}>
          H5
        </ToolBtn>
        <ToolBtn label="見出し6 (######)" onClick={() => prefix('###### ')}>
          H6
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
        <ToolBtn label="テーブル" onClick={openTablePicker}>
          <TableIcon />
        </ToolBtn>
      </div>
      {tablePickerPos && (
        <TablePicker
          x={tablePickerPos.x}
          y={tablePickerPos.y}
          onSelect={handleTablePickerSelect}
          onClose={() => setTablePickerPos(null)}
        />
      )}
    </div>
  );
}

interface ToolBtnProps {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
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

/** テーブル挿入ボタン用アイコン（3列の表を表す14x14の線画） */
function TableIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="10" rx="1" />
      <line x1="2" y1="6.3" x2="14" y2="6.3" />
      <line x1="6" y1="3" x2="6" y2="13" />
      <line x1="10" y1="3" x2="10" y2="13" />
    </svg>
  );
}
