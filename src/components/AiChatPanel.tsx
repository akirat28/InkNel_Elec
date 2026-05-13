import { useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { getActiveAiSettings, type AppSettings } from '../settings';
import { useT } from '../i18n';
import type { NoteMeta } from '../global';

interface Props {
  onClose: () => void;
  settings: AppSettings;
  noteTitle: string;
  noteBody: string;
  linkedNotes: Pick<NoteMeta, 'id' | 'title'>[];
  width: number;
  /**
   * 折りたたみ表示。true のとき width 0 へアニメーションして見えなくする
   * （サイドバーと同じ挙動）。コンテンツは常時マウントされる。
   */
  collapsed?: boolean;
  onNoteCreated?: (note: NoteMeta) => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function getActiveModelName(settings: AppSettings): string {
  const m = getActiveAiSettings(settings).model.trim();
  if (m) return m;
  if (settings.aiProvider === 'claudeCode') return 'claude-3-5-sonnet-latest';
  return 'gpt-4o-mini';
}

/** AI会話保存用のノートタイトル: ローカル時刻で YYYY-MM-DD HH:mm:ss */
function formatNowForNoteTitle(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** チャットメッセージ列を Markdown 文書に変換 */
function buildMarkdownFromMessages(
  messages: { role: 'user' | 'assistant'; text: string }[],
  modelName: string,
  sourceNoteTitle: string,
): string {
  const lines: string[] = [];
  lines.push(`# AI会話 ${formatNowForNoteTitle()}`);
  lines.push('');
  lines.push(`- LLM: ${modelName}`);
  if (sourceNoteTitle.trim()) {
    lines.push(`- 元ノート: ${sourceNoteTitle}`);
  }
  lines.push('');
  for (const m of messages) {
    lines.push(m.role === 'user' ? '## ユーザー' : '## アシスタント');
    lines.push('');
    lines.push(m.text);
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export default function AiChatPanel({
  onClose,
  settings,
  noteTitle,
  noteBody,
  linkedNotes,
  width,
  collapsed = false,
  onNoteCreated,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // ノート化処理中フラグ（多重送信を防止）
  const [savingNote, setSavingNote] = useState(false);
  // 送信中の AI 要求 ID。停止ボタンから ai.abort(reqId) で中断するために保持。
  const inflightRequestIdRef = useRef<string | null>(null);

  // ----- 入力履歴ナビゲーション（↑↓キーで過去入力を呼び戻す、シェル風） -----
  // - historyRef: 送信済みの入力（chronological, 古い順）
  // - historyIndexRef: -1 = 通常編集中 / 0..len-1 = 履歴閲覧中の位置
  // - draftBufferRef: 履歴に入る直前の編集中テキストを保持し、↓ で抜けた時に復元
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const draftBufferRef = useRef<string>('');
  const HISTORY_MAX = 100;

  const handleArrowHistory = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const pos = el.selectionStart ?? 0;
    if (e.key === 'ArrowUp') {
      // カーソルより前に改行が無い = 1 行目にいる時だけ履歴へ
      const before = el.value.slice(0, pos);
      if (before.includes('\n')) return false;
      if (historyRef.current.length === 0) return false;
      if (historyIndexRef.current === -1) {
        // 履歴モードに入る: 現在の draft を退避
        draftBufferRef.current = el.value;
        historyIndexRef.current = historyRef.current.length - 1;
      } else if (historyIndexRef.current > 0) {
        historyIndexRef.current -= 1;
      } else {
        return true; // これ以上古いものは無い: イベントは消化する
      }
      e.preventDefault();
      setDraft(historyRef.current[historyIndexRef.current]);
      return true;
    }
    if (e.key === 'ArrowDown') {
      const after = el.value.slice(pos);
      if (after.includes('\n')) return false;
      if (historyIndexRef.current === -1) return false; // 履歴モードでなければ通常動作
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyIndexRef.current += 1;
        e.preventDefault();
        setDraft(historyRef.current[historyIndexRef.current]);
      } else {
        // 履歴の末尾を超えたら退避していた draft に戻る
        historyIndexRef.current = -1;
        e.preventDefault();
        setDraft(draftBufferRef.current);
        draftBufferRef.current = '';
      }
      return true;
    }
    return false;
  };

  // ----- 入力ボックスの高さ調整（上端のグリップを掴んでドラッグ） -----
  // ブラウザ既定の右下リサイズハンドルは使わず、テキスト領域の真上に
  // 専用のつまみを配置。ドラッグ中は body にカーソル / select 無効化のクラスを付与。
  const INPUT_MIN_H = 64;
  const INPUT_MAX_H = 360;
  const [inputHeight, setInputHeight] = useState(96);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startY: e.clientY, startH: inputHeight };
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      const ref = resizeRef.current;
      if (!ref) return;
      // 上方向ドラッグ (clientY が小さくなる) で高さを増やす
      const delta = ref.startY - ev.clientY;
      const next = Math.min(
        INPUT_MAX_H,
        Math.max(INPUT_MIN_H, ref.startH + delta),
      );
      setInputHeight(next);
    };
    const onUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // AI 応答の Markdown を HTML に変換するための markdown-it インスタンス。
  // - html: false で生 HTML を弾き、AI 出力に紛れ込んだスクリプト等の XSS を防止
  // - linkify: URL を自動リンク化
  // - breaks: 改行を <br> に（チャット風の見た目）
  const md = useMemo(
    () =>
      new MarkdownIt({
        html: false,
        linkify: true,
        breaks: true,
      }),
    [],
  );

  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const aiActive = getActiveAiSettings(settings);
    if (!aiActive.token.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: t.aiChat.tokenNotSet,
        },
      ]);
      return;
    }
    if (typeof window.api?.ai?.chat !== 'function') {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text:
            t.aiChat.notLoaded,
        },
      ]);
      return;
    }
    const now = Date.now();
    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: `u-${now}`, role: 'user', text },
    ];
    setMessages(nextMessages);
    // 履歴に追加（直前と同じ内容は重複追加しない）
    const hist = historyRef.current;
    if (hist[hist.length - 1] !== text) {
      hist.push(text);
      if (hist.length > HISTORY_MAX) hist.splice(0, hist.length - HISTORY_MAX);
    }
    historyIndexRef.current = -1;
    draftBufferRef.current = '';
    setDraft('');
    setBusy(true);
    // 停止ボタンから中断できるように、要求 ID を生成して ref に保持
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `chat-${crypto.randomUUID()}`
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    inflightRequestIdRef.current = requestId;
    // ストリーミングで AI からデルタが届くたびに追記するプレースホルダ。
    // 受信途中でも UI に都度反映されるよう、空テキストの assistant メッセージを
    // 先に積んでおき、`ai:chat-chunk` の delta を append していく。
    const placeholderId = `a-${requestId}`;
    setMessages((current) => [
      ...current,
      { id: placeholderId, role: 'assistant', text: '' },
    ]);
    const unsubscribeChunk = window.api.ai.onChatChunk(({
      requestId: incomingId,
      delta,
    }) => {
      if (incomingId !== requestId || !delta) return;
      setMessages((current) =>
        current.map((m) =>
          m.id === placeholderId ? { ...m, text: m.text + delta } : m,
        ),
      );
    });
    try {
      const relatedNotes = await Promise.all(
        linkedNotes.map(async (note) => ({
          title: note.title || '無題',
          body: await window.api.notes.readBody(note.id),
        })),
      );
      // basePrompt は空文字なら送らない（main 側でも trim チェックしている）
      const basePrompt = aiActive.basePrompt.trim();
      const response = await window.api.ai.chat(
        {
          provider: settings.aiProvider,
          token: aiActive.token,
          endpoint: aiActive.endpoint,
          model: aiActive.model,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.text,
          })),
          ...(basePrompt ? { basePrompt } : {}),
          noteContext: {
            title: noteTitle,
            body: noteBody,
            relatedNotes,
          },
        },
        requestId,
      );
      // ストリーミング中にチャンク欠落があった場合に備え、最終結果で整合させる。
      setMessages((current) =>
        current.map((m) =>
          m.id === placeholderId ? { ...m, text: response } : m,
        ),
      );
    } catch (err) {
      // 失敗時はプレースホルダをエラーメッセージで置き換える。
      const errText = err instanceof Error ? err.message : String(err);
      setMessages((current) =>
        current.map((m) =>
          m.id === placeholderId
            ? { ...m, id: `e-${Date.now()}`, text: errText }
            : m,
        ),
      );
    } finally {
      unsubscribeChunk();
      inflightRequestIdRef.current = null;
      setBusy(false);
    }
  };

  /**
   * 現在のチャット履歴を Markdown 化して新規ノートとして保存する。
   * ノート名は「AIノート」フォルダ配下に「現在日時」というタイトルで作成。
   */
  const handleSaveAsNote = async () => {
    if (savingNote) return;
    if (messages.length === 0) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: '保存する会話がありません。',
        },
      ]);
      return;
    }
    if (typeof window.api?.notes?.create !== 'function') {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text:
            'ノート作成 API が読み込まれていません。アプリを再起動してください。',
        },
      ]);
      return;
    }
    setSavingNote(true);
    try {
      const body = buildMarkdownFromMessages(
        messages.map((m) => ({ role: m.role, text: m.text })),
        getActiveModelName(settings),
        noteTitle,
      );
      const created = await window.api.notes.create({
        title: formatNowForNoteTitle(),
        folder: 'AIノート',
        body,
      });
      onNoteCreated?.(created);
      setMessages((prev) => [
        ...prev,
        {
          id: `n-${Date.now()}`,
          role: 'assistant',
          text: `**ノートを作成しました**: \`AIノート/${created.title}\``,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text:
            'ノートの作成に失敗しました: ' +
            (err instanceof Error ? err.message : String(err)),
        },
      ]);
    } finally {
      setSavingNote(false);
    }
  };

  /** 現在のチャット履歴をすべて消去する。AI 送信中は無効。 */
  const handleClearChat = () => {
    if (busy) return;
    if (messages.length === 0) return;
    if (!window.confirm('現在のチャット履歴をすべて削除しますか?')) return;
    setMessages([]);
    setDraft('');
    historyIndexRef.current = -1;
    draftBufferRef.current = '';
  };

  /** 進行中の AI 要求を中断する。busy 状態は ai.chat() の例外経由で解除される */
  const handleStop = () => {
    const id = inflightRequestIdRef.current;
    if (!id || typeof window.api?.ai?.abort !== 'function') return;
    void window.api.ai.abort(id);
  };

  return (
    <aside
      className={`ai-chat ${collapsed ? 'is-collapsed' : ''}`}
      aria-label={t.aiChat.title}
      aria-hidden={collapsed}
      style={{ width: collapsed ? 0 : width }}
    >
      {/* 折りたたみ中もコンテンツが横方向に潰れて再フローしないよう、
          内側コンテナで実幅を保持する（サイドバーと同じパターン）。 */}
      <div className="ai-chat__inner" style={{ width }}>
      <header className="ai-chat__header">
        <h2 className="ai-chat__title">{t.aiChat.title}</h2>
        <button
          type="button"
          className="ai-chat__save-note"
          onClick={() => void handleSaveAsNote()}
          disabled={savingNote || messages.length === 0}
          title={t.aiChat.saveAsNoteTitle}
          aria-label={t.aiChat.saveAsNoteAria}
        >
          {savingNote ? t.aiChat.savingNote : t.aiChat.saveAsNote}
        </button>
        <button
          type="button"
          className="ai-chat__clear"
          onClick={handleClearChat}
          disabled={busy || messages.length === 0}
          title={t.aiChat.clearChatTitle}
          aria-label={t.aiChat.clearChat}
        >
          {t.aiChat.clearChat}
        </button>
        <button
          type="button"
          className="ai-chat__close"
          onClick={onClose}
          aria-label={t.aiChat.closeAria}
          title={t.aiChat.closeTitle}
        >
          ×
        </button>
      </header>
      <div className="ai-chat__messages">
        {messages.length === 0 ? (
          <p className="ai-chat__empty">{t.aiChat.emptyState}</p>
        ) : (
          messages.map((message) =>
            message.role === 'assistant' ? (
              // AI 応答は Markdown としてレンダリング
              <div
                key={message.id}
                className="ai-chat__message ai-chat__message--assistant ai-chat__message--md"
                dangerouslySetInnerHTML={{
                  __html: md.render(message.text),
                }}
              />
            ) : (
              // ユーザー入力はプレーンテキスト（pre-wrap で改行保持）
              <div
                key={message.id}
                className="ai-chat__message ai-chat__message--user"
              >
                {message.text}
              </div>
            ),
          )
        )}
        {busy && messages[messages.length - 1]?.text === '' && (
          <div className="ai-chat__message ai-chat__message--assistant">
            {t.aiChat.waitingResponse}
          </div>
        )}
      </div>
      <div className="ai-chat__composer">
        <p className="ai-chat__hint" aria-live="polite">
          {t.aiChat.hint}
        </p>
        <div
          className="ai-chat__input-resizer"
          onMouseDown={handleResizerMouseDown}
          role="separator"
          aria-orientation="horizontal"
        >
          <span className="ai-chat__input-resizer-grip" aria-hidden="true" />
        </div>
        <textarea
          className="ai-chat__input"
          value={draft}
          style={{ height: inputHeight }}
          placeholder={t.aiChat.placeholder}
          onChange={(e) => {
            setDraft(e.target.value);
            // ユーザーがキー入力で変更したら履歴閲覧モードから抜ける
            if (historyIndexRef.current !== -1) {
              historyIndexRef.current = -1;
              draftBufferRef.current = '';
            }
          }}
          onKeyDown={(e) => {
            // IME 変換中の Enter は無視（確定キーと衝突しないよう）
            if (e.nativeEvent.isComposing || e.key === 'Process') return;
            // ↑↓ で過去入力ナビゲーション（1 行目で ↑、最終行で ↓ のみ反応）
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              if (handleArrowHistory(e)) return;
            }
            // Enter のみ → 送信。Shift+Enter は通常の改行（preventDefault しない）
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
              return;
            }
            // Escape → 進行中の AI 処理を中断
            if (e.key === 'Escape' && busy) {
              e.preventDefault();
              handleStop();
            }
          }}
        />
        <div className="ai-chat__composer-actions">
          <span className="ai-chat__model" aria-label="現在のLLM">
            LLM: {getActiveModelName(settings)}
          </span>
          <div className="ai-chat__composer-buttons">
            <button
              type="button"
              className="ai-chat__send"
              onClick={() => void handleSubmit()}
              disabled={draft.trim().length === 0 || busy}
            >
              {busy ? t.aiChat.sending : t.aiChat.send}
            </button>
            <button
              type="button"
              className="ai-chat__stop"
              onClick={handleStop}
              disabled={!busy}
              title={t.aiChat.stopTitle}
              aria-label={t.aiChat.stop}
            >
              {t.aiChat.stop}
            </button>
          </div>
        </div>
      </div>
      </div>{/* ai-chat__inner */}
    </aside>
  );
}
