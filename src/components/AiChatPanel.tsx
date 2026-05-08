import { useMemo, useState } from 'react';
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
    try {
      const relatedNotes = await Promise.all(
        linkedNotes.map(async (note) => ({
          title: note.title || '無題',
          body: await window.api.notes.readBody(note.id),
        })),
      );
      const response = await window.api.ai.chat({
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
      });
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
      setBusy(false);
    }
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
        <textarea
          className="ai-chat__input"
          value={draft}
          rows={3}
          placeholder="AIに質問..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
        />
        <div className="ai-chat__composer-actions">
          <span className="ai-chat__model" aria-label="現在のLLM">
            LLM: {getActiveModelName(settings)}
          </span>
          <button
            type="button"
            className="ai-chat__send"
            onClick={() => void handleSubmit()}
            disabled={draft.trim().length === 0 || busy}
          >
            {busy ? '送信中' : '送信'}
          </button>
        </div>
      </div>
    </aside>
  );
}
