import { useEffect, useState } from 'react';

interface ScanResult {
  storageRoot: string;
  dbNoteCount: number;
  diskFileCount: number;
  missingOnDisk: string[];
  extraOnDisk: string[];
}

interface Props {
  /** 同期完了後にノート一覧などを再取得するためのフック */
  onAfterSync?: () => void;
}

/**
 * サイドバーの「同期」モードに表示するパネル。
 * 保存先フォルダの内容と DB を比較して差分を表示し、
 * 「同期」ボタンで以下を一括反映する:
 *   - DB にあって disk に無いノート → ディスクへ書き出し
 *   - disk にあって DB に無い UUID 風ファイル → DB へ取り込み
 */
export default function StorageSyncPanel({ onAfterSync }: Props) {
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);

  const refresh = async () => {
    try {
      const result = await window.api.storage.scan();
      setScan(result);
    } catch (err) {
      setScan(null);
      setMessage({
        type: 'error',
        text:
          'スキャンに失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleSync = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.api.storage.sync();
      setMessage({
        type: 'ok',
        text: `同期完了: 書き出し ${result.saved} 件 / 取り込み ${result.imported} 件`,
      });
      await refresh();
      onAfterSync?.();
      // App.tsx 側でノート一覧を再取得させるためのカスタムイベント
      window.dispatchEvent(new CustomEvent('inknel:notes-changed'));
    } catch (err) {
      setMessage({
        type: 'error',
        text:
          '同期に失敗しました: ' +
          (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusy(false);
    }
  };

  const diffCount =
    (scan?.missingOnDisk.length ?? 0) + (scan?.extraOnDisk.length ?? 0);

  return (
    <div className="sync-panel">
      <h3 className="sync-panel__title">保存先と同期</h3>

      {scan ? (
        <>
          <dl className="sync-panel__meta">
            <dt>保存先フォルダ</dt>
            <dd>
              <code className="sync-panel__path">{scan.storageRoot}</code>
            </dd>
            <dt>DB のノート数</dt>
            <dd>{scan.dbNoteCount} 件</dd>
            <dt>ディスクの .md 数</dt>
            <dd>{scan.diskFileCount} 件</dd>
            <dt>差分</dt>
            <dd>
              {diffCount === 0 ? (
                <span className="sync-panel__same">差分なし</span>
              ) : (
                <span className="sync-panel__diff">
                  書き出し候補 {scan.missingOnDisk.length} / 取り込み候補{' '}
                  {scan.extraOnDisk.length}
                </span>
              )}
            </dd>
          </dl>

          <div className="sync-panel__actions">
            <button
              type="button"
              className="sync-panel__btn"
              onClick={() => void handleSync()}
              disabled={busy}
            >
              {busy ? '同期中…' : '同期'}
            </button>
            <button
              type="button"
              className="sync-panel__btn sync-panel__btn--ghost"
              onClick={() => void refresh()}
              disabled={busy}
            >
              再スキャン
            </button>
          </div>
        </>
      ) : (
        <p className="sync-panel__hint">スキャン中…</p>
      )}

      {message && (
        <p
          className={`sync-panel__message ${
            message.type === 'error' ? 'is-error' : 'is-ok'
          }`}
        >
          {message.text}
        </p>
      )}

      <p className="sync-panel__hint">
        差分があれば「同期」を押すと、DB のノートをディスクに書き出し、
        ディスクにある UUID 名の .md ファイルを DB に取り込みます。
      </p>
    </div>
  );
}
