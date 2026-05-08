import { app, ipcMain, shell, dialog, BrowserWindow, Menu } from 'electron';
import {
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { closeDb, initDb } from './db/index';
import { basename, extname, join, relative, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  listNotes,
  getNote,
  insertNote,
  updateNoteMeta,
  updateNoteBodyText,
  setNoteProtected,
  setNoteSecret,
  deleteNote,
  searchNotes,
  type NoteMeta,
} from './db/notes';
import {
  listFolders,
  insertFolder,
  deleteFolder,
  deleteFolderRecursive,
  renameFolder,
} from './db/folders';
import { getAllSettings, setSetting } from './db/settings';
import {
  readBody,
  readBodyWithMeta,
  writeBody,
  writeNoteFile,
  deleteBody,
} from './storage/notesFiles';
import { saveImage, imageExists, deleteImage } from './storage/imagesFiles';
import {
  saveAttachment,
  attachmentExists,
  attachmentPath,
  deleteAttachment,
} from './storage/attachmentsFiles';
import {
  clearStorageRootCache,
  getStorageRoot,
  STORAGE_PATH_SETTING_KEY,
} from './storage/storageRoot';
// テンプレートは notes テーブルで folder='template' のノートを利用する
import {
  checkAndSyncSingleNote,
  detectProviders,
  getSyncStatus,
  pushSingleMedia,
  pushSingleNote,
  removeSingleNote,
  runSync,
  type ShareProvider,
} from './sync/cloudSync';
import { imagePath } from './storage/imagesFiles';
import { attachmentPath as getAttachmentPath } from './storage/attachmentsFiles';

/** 画像 1 枚あたりの最大サイズ (バイト) */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
/** 添付ファイル 1 つあたりの最大サイズ (バイト) */
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB
/** AI へ送る本文の最大文字数。過大入力でアプリが固まるのを避ける。 */
const MAX_AI_INPUT_CHARS = 160_000;

type AiProvider = 'general' | 'chatgpt' | 'claudeCode' | 'copilot';
type AiAction =
  | 'summarizeByHeading'
  | 'organizeBullets'
  | 'improveCodeBlocks'
  | 'formatTables'
  | 'convertHtmlToMarkdown';

interface AiTransformInput {
  provider: AiProvider;
  token: string;
  endpoint: string;
  model: string;
  action: AiAction;
  content: string;
}

function buildAiInstruction(action: AiAction): string {
  const common =
    'あなたはMarkdownノートを整える編集者です。出力はMarkdown本文だけにしてください。説明文、前置き、コードフェンスでの全体囲みは不要です。元の情報を捏造せず、構造をできる限り保ってください。';
  switch (action) {
    case 'summarizeByHeading':
      return `${common}\nHTMLまたはMarkdownの内容を、見出し単位で要約してください。見出し階層を保持し、各見出しの下に重要点を短い箇条書きで整理してください。`;
    case 'organizeBullets':
      return `${common}\n箇条書きを読みやすく整理してください。重複を統合し、粒度をそろえ、必要なら親子関係を作ってください。見出しや本文の構造は保ってください。`;
    case 'improveCodeBlocks':
      return `${common}\nコードブロックだけを改善してください。コードの可読性、コメント、フォーマット、明らかな構文崩れを整えます。コード以外の本文は意味を変えず保持してください。`;
    case 'formatTables':
      return `${common}\n表だけをMarkdownテーブルとして整形してください。列数、見出し、セル内容を読みやすくそろえ、表以外の本文は意味を変えず保持してください。`;
    case 'convertHtmlToMarkdown':
      return `${common}\n貼り付けられたHTMLを、構造を保持したままMarkdownへ変換してください。見出し、箇条書き、コードブロック、表、リンクを適切なMarkdownにしてください。`;
  }
}

function defaultAiEndpoint(provider: AiProvider): string {
  if (provider === 'claudeCode') return 'https://api.anthropic.com/v1/messages';
  if (provider === 'chatgpt') return 'https://api.openai.com/v1/chat/completions';
  return 'https://api.openai.com/v1/chat/completions';
}

function defaultAiModel(provider: AiProvider): string {
  if (provider === 'claudeCode') return 'claude-3-5-sonnet-latest';
  if (provider === 'chatgpt') return 'gpt-4o-mini';
  return 'gpt-4o-mini';
}

function cleanAiOutput(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1')
    .trim();
}

async function callOpenAiCompatible(
  input: AiTransformInput,
  endpoint: string,
  model: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildAiInstruction(input.action) },
        { role: 'user', content: input.content },
      ],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(String(message));
  }
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('AIから有効な応答が返りませんでした');
  }
  return cleanAiOutput(text);
}

async function callAnthropic(
  input: AiTransformInput,
  endpoint: string,
  model: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.token,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.2,
      system: buildAiInstruction(input.action),
      messages: [{ role: 'user', content: input.content }],
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(String(message));
  }
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((part: { type?: string; text?: string }) =>
      part?.type === 'text' && typeof part.text === 'string' ? part.text : '',
    )
    .join('');
  if (text.trim().length === 0) {
    throw new Error('AIから有効な応答が返りませんでした');
  }
  return cleanAiOutput(text);
}

async function transformWithAi(input: AiTransformInput): Promise<string> {
  const provider = input.provider;
  if (
    provider !== 'general' &&
    provider !== 'chatgpt' &&
    provider !== 'claudeCode' &&
    provider !== 'copilot'
  ) {
    throw new Error('AIプロバイダの設定が不正です');
  }
  if (!input.token.trim()) {
    throw new Error('設定でAI接続用Tokenを入力してください');
  }
  const content = input.content.trim();
  if (!content) {
    throw new Error('変換する本文がありません');
  }
  if (content.length > MAX_AI_INPUT_CHARS) {
    throw new Error(
      `本文が長すぎます。${MAX_AI_INPUT_CHARS.toLocaleString('ja-JP')}文字以内にしてください。`,
    );
  }
  const endpoint = input.endpoint.trim() || defaultAiEndpoint(provider);
  const model = input.model.trim() || defaultAiModel(provider);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    if (provider === 'claudeCode') {
      return await callAnthropic(input, endpoint, model, controller.signal);
    }
    return await callOpenAiCompatible(input, endpoint, model, controller.signal);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('AIの応答がタイムアウトしました');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** 現在設定されているクラウド共有プロバイダを返す（'none' なら無効） */
function getActiveShareProvider(): ShareProvider {
  const settings = getAllSettings();
  const v = settings['share.provider'];
  if (v === 'icloud' || v === 'dropbox' || v === 'gdrive') return v;
  return 'none';
}

/**
 * "a/b/c" 形式に正規化（前後スラッシュ除去・連続スラッシュ畳み込み・空セグメント除去）。
 * パストラバーサル対策として `.` / `..` セグメントとバックスラッシュを含むセグメントは除外する。
 */
export function normalizeFolderPath(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..' && !s.includes('\\'))
    .join('/');
}

export function registerIpc(): void {
  ipcMain.handle('notes:list', (): NoteMeta[] => {
    return listNotes();
  });

  ipcMain.handle(
    'notes:create',
    (_e, input: { title?: string; folder?: string; body?: string }): NoteMeta => {
      const now = Date.now();
      const meta: NoteMeta = {
        id: randomUUID(),
        title: input.title?.trim() || '無題',
        folder: input.folder ?? '',
        protected: false,
        secret: false,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      insertNote(meta, input.body ?? '');
      writeNoteFile(meta, input.body ?? '');
      // ライトスルー: クラウドフォルダにも即時書き出し
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, meta.id);
      return meta;
    },
  );

  ipcMain.handle('notes:read-body', (_e, id: string): string => {
    return readBody(id);
  });

  ipcMain.handle(
    'notes:update-meta',
    (
      _e,
      id: string,
      patch: { title?: string; folder?: string; tags?: string[] },
    ): NoteMeta => {
      const updated = updateNoteMeta(id, patch);
      // ディスク上の front-matter も最新メタで書き換え
      try {
        const body = readBody(id);
        writeNoteFile(updated, body);
      } catch (err) {
        console.warn('[notes:update-meta] disk rewrite failed:', err);
      }
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
      return updated;
    },
  );

  ipcMain.handle(
    'notes:update-body',
    (_e, id: string, body: string): void => {
      const note = getNote(id);
      if (!note) throw new Error(`note not found: ${id}`);
      updateNoteBodyText(id, body);
      // body 更新後に最新の updated_at を含めて front-matter ごと書く
      const refreshed = getNote(id) ?? note;
      writeNoteFile(refreshed, body);
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
    },
  );

  ipcMain.handle(
    'notes:set-protected',
    (_e, id: string, isProtected: boolean): NoteMeta => {
      const updated = setNoteProtected(id, isProtected);
      try {
        const body = readBody(id);
        writeNoteFile(updated, body);
      } catch (err) {
        console.warn('[notes:set-protected] disk rewrite failed:', err);
      }
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
      return updated;
    },
  );

  ipcMain.handle(
    'notes:set-secret',
    (_e, id: string, isSecret: boolean): NoteMeta => {
      const updated = setNoteSecret(id, isSecret);
      try {
        const body = readBody(id);
        writeNoteFile(updated, body);
      } catch (err) {
        console.warn('[notes:set-secret] disk rewrite failed:', err);
      }
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
      return updated;
    },
  );

  ipcMain.handle('notes:search', (_e, query: string): NoteMeta[] => {
    return searchNotes(query);
  });

  ipcMain.handle(
    'notes:list-tags',
    (): Array<{ tag: string; notes: NoteMeta[] }> => {
      const all = listNotes();
      // タグ → ノートID集合。TagBar で明示的に設定されたタグのみ集計し、
      // 本文中の `#word` 自動検出は対象外（ユーザーが意図したタグだけを表示）。
      const tagMap = new Map<string, Set<string>>();

      const addTag = (tag: string, noteId: string) => {
        let set = tagMap.get(tag);
        if (!set) {
          set = new Set();
          tagMap.set(tag, set);
        }
        set.add(noteId);
      };

      for (const note of all) {
        for (const tag of note.tags) {
          if (tag) addTag(tag, note.id);
        }
      }

      const noteById = new Map(all.map((n) => [n.id, n] as const));
      const sortedTags = [...tagMap.keys()].sort((a, b) =>
        a.localeCompare(b, 'ja'),
      );
      return sortedTags.map((tag) => {
        const ids = tagMap.get(tag)!;
        const notes: NoteMeta[] = [];
        for (const id of ids) {
          const meta = noteById.get(id);
          if (meta) notes.push(meta);
        }
        notes.sort((a, b) => b.updatedAt - a.updatedAt);
        return { tag, notes };
      });
    },
  );

  ipcMain.handle('notes:delete', (_e, id: string): void => {
    const note = getNote(id);
    if (!note) return;
    if (note.protected) {
      throw new Error('保護されているノートは削除できません');
    }
    deleteNote(id);
    deleteBody(id);
    const p = getActiveShareProvider();
    if (p !== 'none') removeSingleNote(p, id);
  });

  // ----- folders -----
  ipcMain.handle('folders:list', (): string[] => {
    return listFolders();
  });

  ipcMain.handle('folders:create', (_e, path: string): void => {
    const normalized = normalizeFolderPath(path);
    if (!normalized) return;
    insertFolder(normalized);
  });

  ipcMain.handle('folders:delete', (_e, path: string): void => {
    const normalized = normalizeFolderPath(path);
    if (!normalized) return;
    deleteFolder(normalized);
  });

  // フォルダと配下のノート・サブフォルダをすべて削除
  ipcMain.handle(
    'folders:delete-recursive',
    (_e, path: string): { deletedCount: number } => {
      const normalized = normalizeFolderPath(path);
      if (!normalized) return { deletedCount: 0 };
      const noteIds = deleteFolderRecursive(normalized);
      const provider = getActiveShareProvider();
      // 本文 .md ファイル削除 + クラウド側のファイルも削除
      for (const id of noteIds) {
        try {
          deleteBody(id);
        } catch {
          // 失敗しても続行
        }
        if (provider !== 'none') {
          try {
            removeSingleNote(provider, id);
          } catch {
            // クラウド側削除失敗は無視（次回手動同期で整合性回復可能）
          }
        }
      }
      return { deletedCount: noteIds.length };
    },
  );

  ipcMain.handle(
    'folders:rename',
    (_e, oldPath: string, newPath: string): void => {
      const oldNorm = normalizeFolderPath(oldPath);
      const newNorm = normalizeFolderPath(newPath);
      if (!oldNorm || !newNorm) return;
      if (oldNorm === newNorm) return;

      // 影響を受けるノート ID を rename 前に確定（古い folder 値で判定）
      const affectedIds = listNotes()
        .filter(
          (n) =>
            n.folder === oldNorm || n.folder.startsWith(oldNorm + '/'),
        )
        .map((n) => n.id);

      renameFolder(oldNorm, newNorm);

      // 各ノートのディスクファイル front-matter も新しい folder で書き直す
      for (const id of affectedIds) {
        try {
          const note = getNote(id);
          if (!note) continue;
          const body = readBody(id);
          writeNoteFile(note, body);
        } catch (err) {
          console.warn(
            '[folders:rename] disk rewrite failed for',
            id,
            err,
          );
        }
      }
    },
  );

  // ----- settings -----
  ipcMain.handle('settings:getAll', (): Record<string, string> => {
    return getAllSettings();
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string): void => {
    setSetting(key, value);
    // 保存先パスが変わったら次の I/O で再解決させる
    if (key === STORAGE_PATH_SETTING_KEY) clearStorageRootCache();
  });

  // ----- ストレージ（ファイル保存先）操作 -----
  /** 現在解決済みのストレージルートを返す（UI 表示用） */
  ipcMain.handle('storage:get-root', (): string => getStorageRoot());

  /**
   * 保存先フォルダ選択ダイアログを開く。選ばれたパスを返し、キャンセル時は null。
   * 実際の設定保存は呼び出し元（renderer）の `settings.set('storage.path', ...)` で行う。
   */
  /**
   * アプリの DB 初期化:
   * 1. DB のテーブルを TRUNCATE（notes / folders / settings 全消去）
   * 2. SQLite を閉じて DB ファイルと WAL を削除
   * 3. アプリを再起動
   *
   * 注: **保存先フォルダの `.md` / 画像 / 添付ファイルは削除しない**。
   * iCloud 等の共有フォルダを使っている場合、他デバイスへ影響が及ぶため。
   * 初期化後は disk のファイルが残るので、再起動後に「同期」を押すことで
   * 必要なノートを取り込み直すこともできる。
   *
   * 呼び出し前に renderer 側で確認 UI を出すこと（テキスト入力 "初期化" で確定）。
   */
  ipcMain.handle('app:reset-all', async (): Promise<void> => {
    // (1) テーブルを空にする（ファイル削除に失敗してもデータは消える）
    try {
      const db = initDb();
      const tx = db.transaction(() => {
        db.exec('DELETE FROM notes');
        db.exec('DELETE FROM folders');
        db.exec('DELETE FROM settings');
      });
      tx();
      // WAL の内容も DB ファイルへ反映してから縮約
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // 失敗しても続行
      }
      try {
        db.exec('VACUUM');
      } catch {
        // 失敗しても続行
      }
    } catch (err) {
      console.warn('[app:reset-all] truncate failed:', err);
    }

    // (2) SQLite を閉じる
    try {
      closeDb();
    } catch {
      /* 既に閉じていれば無視 */
    }

    // (3) DB ファイル一式を削除（WAL / shm 含む）。OS が file lock 中なら
    // unlinkSync が失敗するが、(1) で TRUNCATE 済みなのでデータ消去は確定。
    const userData = app.getPath('userData');
    for (const f of ['inknel.db', 'inknel.db-wal', 'inknel.db-shm']) {
      try {
        unlinkSync(join(userData, f));
      } catch {
        /* 無くても OK */
      }
    }

    // 保存先フォルダ (storage root 配下の notes/ images/ attachments/) は
    // **削除しない**。共有ストレージで他デバイスにも波及させないため。

    // (4) 再起動
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle(
    'storage:choose-folder',
    async (event): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win ?? undefined!, {
        title: '保存先フォルダを選択',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    },
  );

  /**
   * 保存先フォルダの状態をスキャンして DB と差分を返す。
   *  - dbNoteCount: DB に登録されているノート数
   *  - diskFileCount: ストレージ直下 `notes/` の .md ファイル数
   *  - missingOnDisk: DB にあるがディスク上の .md が無いノート ID
   *  - extraOnDisk: ディスクにあるが DB に無い UUID 風ファイル名
   */
  ipcMain.handle(
    'storage:scan',
    (): {
      storageRoot: string;
      dbNoteCount: number;
      diskFileCount: number;
      missingOnDisk: string[];
      extraOnDisk: string[];
    } => {
      const root = getStorageRoot();
      const notesDir = join(root, 'notes');
      try {
        statSync(notesDir);
      } catch {
        // 無ければ作る（初回スキャン時）
        try {
          // mkdirSync は ipc.ts で import 済みでないので readdirSync で空フォルダ扱いに
        } catch {}
      }
      const dbNotes = listNotes();
      const dbIds = new Set(dbNotes.map((n) => n.id));
      let diskFiles: string[] = [];
      try {
        diskFiles = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
      } catch {
        diskFiles = [];
      }
      const diskIds = new Set(
        diskFiles.map((f) => f.replace(/\.md$/, '')),
      );
      const missingOnDisk = [...dbIds].filter((id) => !diskIds.has(id));
      // 取り込み対象は UUID 風の ID のみ（任意名は手動インポート機能で）
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const extraOnDisk = [...diskIds].filter(
        (id) => !dbIds.has(id) && UUID_RE.test(id),
      );
      return {
        storageRoot: root,
        dbNoteCount: dbIds.size,
        diskFileCount: diskIds.size,
        missingOnDisk,
        extraOnDisk,
      };
    },
  );

  /**
   * DB の全ノートを保存先フォルダに **強制上書き** する。
   * 既存ファイルの内容を問わず、DB のメタ + 既存 body を front-matter 付きで
   * 書き直す。設定画面の「データを上書き」ボタンから呼ぶ想定。
   */
  ipcMain.handle(
    'storage:overwrite-all',
    (): { written: number; failed: number } => {
      const allNotes = listNotes();
      let written = 0;
      let failed = 0;
      for (const note of allNotes) {
        try {
          // 既存ディスク内容（front-matter 剥離済み）を保ちつつメタを最新化
          const body = readBody(note.id);
          updateNoteBodyText(note.id, body, { touch: false });
          writeNoteFile(note, body);
          written++;
        } catch (err) {
          failed++;
          console.warn(
            '[storage:overwrite-all] failed for',
            note.id,
            err,
          );
        }
      }
      return { written, failed };
    },
  );

  /**
   * DB ↔ 保存先フォルダの双方向同期。
   *  - DB にあって disk に無い → 本文を書き出し
   *  - disk にあって DB に無い → 新規ノートとして DB に取り込み
   * 戻り値は処理件数。
   */
  ipcMain.handle(
    'storage:sync',
    (): { saved: number; imported: number } => {
      const root = getStorageRoot();
      const notesDir = join(root, 'notes');
      let saved = 0;
      let imported = 0;
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      // DB → disk
      // すべての DB ノートに対して front-matter 付きで書き出し（または上書き）。
      // - ファイルが無い        → 新規書き出し
      // - ファイルがある:
      //   - front-matter 無し or 内容が DB と異なる → 書き直し
      //   - 完全一致              → スキップ
      // body 部分は disk の最新内容（ユーザー外部編集を尊重）を残しつつ、
      // メタは DB を真として front-matter を更新する。
      const allNotes = listNotes();
      for (const note of allNotes) {
        const filePath = join(notesDir, `${note.id}.md`);
        try {
          let needsWrite = false;
          let bodyOnDisk = '';
          try {
            statSync(filePath);
            // 既存ファイル: front-matter を読み、メタが DB と一致するか確認
            const existing = readBodyWithMeta(note.id);
            bodyOnDisk = existing.body;
            updateNoteBodyText(note.id, bodyOnDisk, { touch: false });
            const m = existing.meta;
            const sameMeta =
              m.title === note.title &&
              m.folder === note.folder &&
              m.protected === note.protected &&
              m.secret === note.secret &&
              m.createdAt === note.createdAt &&
              m.updatedAt === note.updatedAt &&
              Array.isArray(m.tags) &&
              m.tags.length === note.tags.length &&
              m.tags.every((t, i) => t === note.tags[i]);
            if (!sameMeta) needsWrite = true;
          } catch {
            // ファイルが存在しないので新規書き出し
            needsWrite = true;
            // 新規時は読めないので body は空（renderer 経由で書き込まれていれば readBody で得られる）
            try {
              bodyOnDisk = readBody(note.id);
              updateNoteBodyText(note.id, bodyOnDisk, { touch: false });
            } catch {
              bodyOnDisk = '';
            }
          }
          if (needsWrite) {
            writeNoteFile(note, bodyOnDisk);
            saved++;
          }
        } catch (err) {
          console.warn('[storage:sync] write failed for', note.id, err);
        }
      }

      // disk → DB
      // ディスクの .md を front-matter 込みで解析し、DB に未登録のものを取り込む。
      // front-matter があればフォルダ階層・タグ・保護フラグ・タイムスタンプまで復元。
      let diskFiles: string[] = [];
      try {
        diskFiles = readdirSync(notesDir).filter((f) => f.endsWith('.md'));
      } catch {
        diskFiles = [];
      }
      const dbIds = new Set(listNotes().map((n) => n.id));
      for (const file of diskFiles) {
        const id = file.replace(/\.md$/, '');
        if (dbIds.has(id)) continue;
        if (!UUID_RE.test(id)) continue; // UUID 風以外は対象外
        try {
          const { meta, body } = readBodyWithMeta(id);
          const now = Date.now();
          // front-matter が無いファイル用フォールバック: 本文先頭見出し
          const fallbackTitle = (() => {
            const m = body.match(/^#+\s+(.+)$/m);
            return (m?.[1] ?? '').trim() || '取り込みノート';
          })();
          insertNote(
            {
              id,
              title: meta.title ?? fallbackTitle,
              folder: meta.folder ?? '',
              protected: meta.protected ?? false,
              secret: meta.secret ?? false,
              tags: Array.isArray(meta.tags) ? meta.tags : [],
              createdAt: meta.createdAt ?? now,
              updatedAt: meta.updatedAt ?? now,
            },
            body,
          );
          imported++;
        } catch (err) {
          console.warn('[storage:sync] import failed for', file, err);
        }
      }

      return { saved, imported };
    },
  );

  // ----- images -----
  ipcMain.handle(
    'images:save',
    (_e, data: ArrayBuffer, ext: string): string => {
      const buf = Buffer.from(data);
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(
          `画像が大きすぎます (${Math.round(buf.byteLength / 1024 / 1024)}MB)。25MB 以下にしてください。`,
        );
      }
      const filename = saveImage(buf, ext);
      // ライトスルー: クラウドフォルダにも即時コピー
      const p = getActiveShareProvider();
      if (p !== 'none') {
        pushSingleMedia(p, 'images', imagePath(filename), filename);
      }
      return filename;
    },
  );

  ipcMain.handle(
    'images:exists',
    (_e, filename: string): boolean => {
      return imageExists(filename);
    },
  );

  // ----- attachments -----
  ipcMain.handle(
    'attachments:save',
    (_e, data: ArrayBuffer, ext: string): string => {
      const buf = Buffer.from(data);
      if (buf.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new Error(
          `添付ファイルが大きすぎます (${Math.round(buf.byteLength / 1024 / 1024)}MB)。100MB 以下にしてください。`,
        );
      }
      const filename = saveAttachment(buf, ext);
      // ライトスルー: クラウドフォルダにも即時コピー
      const p = getActiveShareProvider();
      if (p !== 'none') {
        pushSingleMedia(p, 'attachments', getAttachmentPath(filename), filename);
      }
      return filename;
    },
  );

  ipcMain.handle(
    'attachments:exists',
    (_e, filename: string): boolean => {
      return attachmentExists(filename);
    },
  );

  ipcMain.handle(
    'attachments:open',
    async (_e, filename: string): Promise<void> => {
      try {
        const fullPath = attachmentPath(filename); // sanitize 込み
        if (!attachmentExists(filename)) {
          throw new Error('ファイルが存在しません');
        }
        const result = await shell.openPath(fullPath);
        if (result) {
          // openPath は失敗時にエラー文字列を返す
          throw new Error(result);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`添付ファイルを開けませんでした: ${msg}`);
      }
    },
  );

  // ----- shell（外部URL を既定ブラウザで開く） -----
  ipcMain.handle(
    'shell:open-external',
    async (_e, url: string): Promise<void> => {
      // 入力文字列を URL としてパースし、http/https のみを許可。
      // これで `javascript:` / `file:` / 制御文字を含む URL 等を確実に弾く。
      if (typeof url !== 'string' || url.length === 0) return;
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return;
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      await shell.openExternal(parsed.href);
    },
  );

  /**
   * 汎用の OS ネイティブコンテキストメニュー。renderer から `items` と画面座標を
   * 渡すと、ネイティブメニュー（ウィンドウ外まではみ出せる）を popup し、
   * 選択された項目の `id` を返す。キャンセル時は null。
   *
   * 各 item は `{ id, label, enabled?, danger?, separator? }`。
   * separator: true なら区切り線（id / label は無視）。
   */
  ipcMain.handle(
    'ui:show-context-menu',
    async (
      event,
      opts: {
        position?: { x?: number; y?: number };
        items: Array<{
          id?: string;
          label?: string;
          enabled?: boolean;
          separator?: boolean;
        }>;
      },
    ): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return new Promise<string | null>((resolve) => {
        let resolved = false;
        const safeResolve = (v: string | null) => {
          if (resolved) return;
          resolved = true;
          resolve(v);
        };

        const template = (opts.items || []).map((item) => {
          if (item.separator) {
            return { type: 'separator' as const };
          }
          return {
            label: item.label ?? '',
            enabled: item.enabled !== false,
            click: () => safeResolve(item.id ?? null),
          };
        });

        const menu = Menu.buildFromTemplate(template);
        const x = opts.position?.x;
        const y = opts.position?.y;
        menu.popup({
          window: win ?? undefined,
          x: typeof x === 'number' ? Math.round(x) : undefined,
          y: typeof y === 'number' ? Math.round(y) : undefined,
          callback: () => safeResolve(null),
        });
      });
    },
  );

  // ----- NoteHeader のケバブメニュー（OS ネイティブメニュー） -----
  // Web ベースのポップアップだとウィンドウ外にはみ出せないため、
  // OS ネイティブの Menu.popup() を使う。
  ipcMain.handle(
    'ui:show-note-menu',
    async (event, position?: { x?: number; y?: number }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const menu = Menu.buildFromTemplate([
        {
          label: 'PDF で出力',
          click: () => event.sender.send('menu:export-pdf'),
        },
        {
          label: 'Markdown で出力',
          click: () => event.sender.send('menu:export-markdown'),
        },
        { type: 'separator' },
        {
          label: '印刷',
          click: () => event.sender.send('menu:print'),
        },
      ]);
      // x/y は renderer 側で getBoundingClientRect から渡される。
      // 指定が無ければカーソル位置に開く。
      const x = position?.x;
      const y = position?.y;
      menu.popup({
        window: win ?? undefined,
        x: typeof x === 'number' ? Math.round(x) : undefined,
        y: typeof y === 'number' ? Math.round(y) : undefined,
      });
    },
  );

  // ----- ノートのエクスポート -----
  /**
   * 現在のノート本文を Markdown (.md) ファイルとして保存する。
   * Save ダイアログを開き、ユーザーが選んだ場所に書き出す。
   * @returns true なら保存成功、false ならキャンセル or 失敗
   */
  ipcMain.handle(
    'files:export-markdown',
    async (event, defaultName: string, body: string): Promise<boolean> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const safeBase =
        (typeof defaultName === 'string' && defaultName.trim()) || '無題';
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        title: 'Markdown として保存',
        defaultPath: `${safeBase}.md`,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
        ],
      });
      if (result.canceled || !result.filePath) return false;
      try {
        writeFileSync(result.filePath, body ?? '', 'utf8');
        return true;
      } catch (err) {
        console.error('[export-markdown] failed:', err);
        throw new Error(
          err instanceof Error
            ? err.message
            : 'Markdown の保存に失敗しました',
        );
      }
    },
  );

  /**
   * 現在のウィンドウの描画内容を PDF として保存する。
   * 呼び出し元 (renderer) はこの IPC を呼ぶ前に view を preview に切り替えておく。
   */
  ipcMain.handle(
    'files:export-pdf',
    async (event, defaultName: string): Promise<boolean> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return false;
      const safeBase =
        (typeof defaultName === 'string' && defaultName.trim()) || '無題';
      const result = await dialog.showSaveDialog(win, {
        title: 'PDF として保存',
        defaultPath: `${safeBase}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) return false;
      try {
        // `@media print` の CSS が UI を非表示にするので、印刷 CSS を優先させる。
        const pdf = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
        });
        writeFileSync(result.filePath, pdf);
        return true;
      } catch (err) {
        console.error('[export-pdf] failed:', err);
        throw new Error(
          err instanceof Error ? err.message : 'PDF の出力に失敗しました',
        );
      }
    },
  );

  // ----- media:gc（未参照メディアの GC） -----
  // 候補のうち、どのノートからも参照されていないファイルを削除する
  ipcMain.handle(
    'media:gc',
    (
      _e,
      candidates: { images: string[]; attachments: string[] },
    ): { deletedImages: string[]; deletedAttachments: string[] } => {
      const candidateImages = candidates?.images ?? [];
      const candidateAttachments = candidates?.attachments ?? [];
      if (candidateImages.length === 0 && candidateAttachments.length === 0) {
        return { deletedImages: [], deletedAttachments: [] };
      }

      // 全ノートを走査して、現在参照されている全ファイル名を集計
      const refImages = new Set<string>();
      const refAttachments = new Set<string>();
      const allNotes = listNotes();
      const imageRe = /images\/([a-f0-9]{64}\.[a-z0-9]{2,5})/gi;
      const attachmentRe = /attachments\/([a-f0-9]{64}\.[a-z0-9]{2,5})/gi;

      for (const note of allNotes) {
        try {
          const body = readBody(note.id);
          for (const m of body.matchAll(imageRe)) refImages.add(m[1]);
          for (const m of body.matchAll(attachmentRe))
            refAttachments.add(m[1]);
        } catch {
          // 読めないノートはスキップ
        }
      }

      const deletedImages: string[] = [];
      for (const filename of candidateImages) {
        if (!refImages.has(filename) && imageExists(filename)) {
          try {
            deleteImage(filename);
            deletedImages.push(filename);
          } catch {
            // 削除失敗は無視
          }
        }
      }

      const deletedAttachments: string[] = [];
      for (const filename of candidateAttachments) {
        if (!refAttachments.has(filename) && attachmentExists(filename)) {
          try {
            deleteAttachment(filename);
            deletedAttachments.push(filename);
          } catch {
            // 削除失敗は無視
          }
        }
      }

      return { deletedImages, deletedAttachments };
    },
  );

  // ----- share (クラウド同期) -----
  // ----- template -----
  // 設定 template.folder で指定されたフォルダのノートをテンプレートとして扱う
  // ----- .md ファイルのインポート -----
  // ダイアログで選択した .md ファイルを読み込み、内容と元のファイル名を返す。
  ipcMain.handle(
    'notes:import-md',
    async (event): Promise<Array<{ name: string; body: string }>> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: 'Markdown ファイルの読み込み',
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
        ],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }
      const imported: Array<{ name: string; body: string }> = [];
      for (const filePath of result.filePaths) {
        try {
          const body = readFileSync(filePath, 'utf8');
          const name = basename(filePath, extname(filePath));
          imported.push({ name, body });
        } catch (err) {
          console.error(`[import-md] 読み込み失敗: ${filePath}`, err);
        }
      }
      return imported;
    },
  );

  // ----- ディレクトリの .md を再帰的にインポート -----
  // 選択したディレクトリ配下を再帰的に走査し、全ての .md / .markdown を返す。
  // 相対パスをサブフォルダとして保持することで、階層構造も再現できる。
  ipcMain.handle(
    'notes:import-dir',
    async (
      event,
    ): Promise<
      Array<{ name: string; body: string; subFolder: string }>
    > => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        title: 'ディレクトリの読み込み',
        properties: ['openDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return [];
      }
      const rootDir = result.filePaths[0];
      const imported: Array<{
        name: string;
        body: string;
        subFolder: string;
      }> = [];

      const walk = (dir: string) => {
        let entries: import('node:fs').Dirent[];
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue; // 隠しファイル/隠しフォルダは除外
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (ext === '.md' || ext === '.markdown') {
              try {
                const body = readFileSync(full, 'utf8');
                const name = basename(entry.name, ext);
                // ルートからの相対サブフォルダ（スラッシュ区切り）
                const rel = relative(rootDir, dirname(full));
                const subFolder = rel
                  .split(/[\\/]/)
                  .filter((s) => s.length > 0)
                  .join('/');
                imported.push({ name, body, subFolder });
              } catch (err) {
                console.error(`[import-dir] 読み込み失敗: ${full}`, err);
              }
            }
          }
        }
      };
      walk(rootDir);
      // ルートフォルダ名を先頭に追加して返す（呼び出し元で
      // 読み込みファイル/<rootName>/<subFolder>/<note> の形にする）
      const rootName = basename(rootDir);
      return imported.map((i) => ({
        ...i,
        subFolder: i.subFolder ? `${rootName}/${i.subFolder}` : rootName,
      }));
    },
  );

  ipcMain.handle('template:list', () => {
    const settings = getAllSettings();
    const folder = settings['template.folder']?.trim() || 'template';
    const all = listNotes();
    // 最上位のフォルダのみ対応: folder が完全一致するノートだけ
    // template/aaaa → OK (folder='template')
    // test/template/aaaa → NG (folder='test/template')
    return all
      .filter((n) => n.folder === folder)
      .map((n) => ({ name: n.title || '無題', noteId: n.id }));
  });

  ipcMain.handle('template:read', (_e, noteId: string) => {
    return readBody(noteId);
  });

  ipcMain.handle('ai:transform', async (_e, input: AiTransformInput) => {
    try {
      return await transformWithAi(input);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'AI処理に失敗しました';
      throw new Error(`AI処理に失敗しました: ${message}`);
    }
  });

  ipcMain.handle('share:detect-providers', () => {
    return detectProviders();
  });

  ipcMain.handle('share:get-status', (_e, provider: ShareProvider) => {
    return getSyncStatus(provider);
  });

  ipcMain.handle(
    'share:check-note',
    (_e, provider: ShareProvider, noteId: string): string => {
      return checkAndSyncSingleNote(provider, noteId);
    },
  );

  ipcMain.handle('share:sync', async (event, provider: ShareProvider) => {
    // 進捗イベントを送信元の webContents に流す。
    // renderer 側は window.api.share.onProgress で購読する。
    return runSync(provider, (ev) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('share:progress', ev);
      }
    });
  });
}
