import { useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import type { AppSettings } from '../settings';
import type { NoteMeta } from '../global';

interface Props {
  onClose: () => void;
  settings: AppSettings;
  noteTitle: string;
  noteBody: string;
  linkedNotes: Pick<NoteMeta, 'id' | 'title'>[];
  width: number;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

function getActiveModelName(settings: AppSettings): string {
  if (settings.aiModel.trim()) return settings.aiModel.trim();
  if (settings.aiProvider === 'claudeCode') return 'claude-3-5-sonnet-latest';
  return 'gpt-4o-mini';
}

export default function AiChatPanel({
  onClose,
  settings,
  noteTitle,
  noteBody,
  linkedNotes,
  width,
}: Props) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  // 送信中の AI 要求 ID。停止ボタンから ai.abort(reqId) で中断するために保持。
  const inflightRequestIdRef = useRef<string | null>(null);

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
    if (!settings.aiToken.trim()) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: '設定 > AI でTokenを設定してください。',
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
            'AI接続が読み込まれていません。アプリを再起動してから再度お試しください。',
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
    setDraft('');
    setBusy(true);
    // 停止ボタンから中断できるように、要求 ID を生成して ref に保持
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `chat-${crypto.randomUUID()}`
        : `chat-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    inflightRequestIdRef.current = requestId;
    try {
      const relatedNotes = await Promise.all(
        linkedNotes.map(async (note) => ({
          title: note.title || '無題',
          body: await window.api.notes.readBody(note.id),
        })),
      );
      const response = await window.api.ai.chat(
        {
          provider: settings.aiProvider,
          token: settings.aiToken,
          endpoint: settings.aiEndpoint,
          model: settings.aiModel,
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.text,
          })),
          noteContext: {
            title: noteTitle,
            body: noteBody,
            relatedNotes,
          },
        },
        requestId,
      );
      setMessages((current) => [
        ...current,
        { id: `a-${Date.now()}`, role: 'assistant', text: response },
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      inflightRequestIdRef.current = null;
      setBusy(false);
    }
  };

  /** 進行中の AI 要求を中断する。busy 状態は ai.chat() の例外経由で解除される */
  const handleStop = () => {
    const id = inflightRequestIdRef.current;
    if (!id || typeof window.api?.ai?.abort !== 'function') return;
    void window.api.ai.abort(id);
  };

  return (
    <aside className="ai-chat" aria-label="AIチャット" style={{ width }}>
      <header className="ai-chat__header">
        <h2 className="ai-chat__title">AI</h2>
        <button
          type="button"
          className="ai-chat__close"
          onClick={onClose}
          aria-label="AIチャットを閉じる"
          title="閉じる"
        >
          ×
        </button>
      </header>
      <div className="ai-chat__messages">
        {messages.length === 0 ? (
          <p className="ai-chat__empty">ノートについてAIに相談できます。</p>
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
        {busy && (
          <div className="ai-chat__message ai-chat__message--assistant">
            応答を待っています...
          </div>
        )}
      </div>
      <div className="ai-chat__composer">
        <p className="ai-chat__hint" aria-live="polite">
          Enter で送信 / Shift+Enter で改行 / Esc で中断
        </p>
        <textarea
          className="ai-chat__input"
          value={draft}
          rows={3}
          placeholder="AIに質問..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // IME 変換中の Enter は無視（確定キーと衝突しないよう）
            if (e.nativeEvent.isComposing || e.key === 'Process') return;
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
              {busy ? '送信中' : '送信'}
            </button>
            <button
              type="button"
              className="ai-chat__stop"
              onClick={handleStop}
              disabled={!busy}
              title="AI の処理を中断"
              aria-label="中断"
            >
              停止
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
