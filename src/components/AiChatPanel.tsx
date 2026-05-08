import { useState } from 'react';
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
          messages.map((message) => (
            <div
              key={message.id}
              className={`ai-chat__message ai-chat__message--${message.role}`}
            >
              {message.text}
            </div>
          ))
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
