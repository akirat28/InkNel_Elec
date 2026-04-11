import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Theme } from '../settings';

interface Props {
  value: string;
  onChange: (next: string) => void;
  theme: Theme;
}

/** テーマ名 → CodeMirror のテーマ extension。light は extension なし（デフォルト白）。 */
function themeExtension(theme: Theme): Extension {
  return theme === 'dark' ? oneDark : [];
}

/** EditorToolbar 等から CodeMirror に対して操作するためのコマンド群。 */
export interface EditorHandle {
  /** カーソル位置に文字列を挿入し、挿入後の末尾にカーソルを移動。 */
  insert(text: string): void;
  /**
   * 選択範囲を before / after で囲む。
   * 選択が空の場合は placeholder を挿入し、その範囲を新しい選択にする。
   */
  wrap(before: string, after: string, placeholder?: string): void;
  /** 選択行（複数行可）の各行頭に prefix を追加。 */
  prefixLine(prefix: string): void;
  focus(): void;
}

const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { value, onChange, theme },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 初回マウント時にのみ EditorView を生成
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        themeCompartmentRef.current.of(themeExtension(theme)),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // theme prop が変わったら Compartment を reconfigure
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(themeExtension(theme)),
    });
  }, [theme]);

  // 外部から value が変わったとき（ファイル切替時等）に同期
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // ----- ツールバーから呼ぶコマンドを公開 -----
  useImperativeHandle(
    ref,
    () => ({
      insert(text: string) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },

      wrap(before: string, after: string, placeholder = '') {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const selectedText = view.state.sliceDoc(from, to);
        const inner = selectedText || placeholder;
        const insertText = before + inner + after;
        view.dispatch({
          changes: { from, to, insert: insertText },
          selection: {
            anchor: from + before.length,
            head: from + before.length + inner.length,
          },
        });
        view.focus();
      },

      prefixLine(prefix: string) {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        const startLine = view.state.doc.lineAt(from);
        const endLine = view.state.doc.lineAt(to);
        const changes: { from: number; insert: string }[] = [];
        for (let n = startLine.number; n <= endLine.number; n++) {
          const line = view.state.doc.line(n);
          changes.push({ from: line.from, insert: prefix });
        }
        view.dispatch({ changes });
        view.focus();
      },

      focus() {
        viewRef.current?.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className="editor" />;
});

export default Editor;
