import { ipcMain, shell, dialog, BrowserWindow } from 'electron';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  listNotes,
  getNote,
  insertNote,
  updateNoteMeta,
  setNoteProtected,
  setNoteSecret,
  touchNote,
  deleteNote,
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
import { readBody, writeBody, deleteBody } from './storage/notesFiles';
import { saveImage, imageExists, deleteImage } from './storage/imagesFiles';
import {
  saveAttachment,
  attachmentExists,
  attachmentPath,
  deleteAttachment,
} from './storage/attachmentsFiles';
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

/** 現在設定されているクラウド共有プロバイダを返す（'none' なら無効） */
function getActiveShareProvider(): ShareProvider {
  const settings = getAllSettings();
  const v = settings['share.provider'];
  if (v === 'icloud' || v === 'dropbox' || v === 'gdrive') return v;
  return 'none';
}

/** "a/b/c" 形式に正規化（前後スラッシュ除去・連続スラッシュ畳み込み・空セグメント除去） */
function normalizeFolderPath(input: string): string {
  return input
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
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
      insertNote(meta);
      writeBody(meta.id, input.body ?? '');
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
      writeBody(id, body);
      touchNote(id);
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
    },
  );

  ipcMain.handle(
    'notes:set-protected',
    (_e, id: string, isProtected: boolean): NoteMeta => {
      const updated = setNoteProtected(id, isProtected);
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
      return updated;
    },
  );

  ipcMain.handle(
    'notes:set-secret',
    (_e, id: string, isSecret: boolean): NoteMeta => {
      const updated = setNoteSecret(id, isSecret);
      const p = getActiveShareProvider();
      if (p !== 'none') pushSingleNote(p, id);
      return updated;
    },
  );

  ipcMain.handle('notes:search', (_e, query: string): NoteMeta[] => {
    const q = query.trim();
    if (!q) return [];

    const all = listNotes();
    const lower = q.toLowerCase();

    // 1) タイトル一致を先に拾う
    const titleMatched: NoteMeta[] = [];
    const titleMatchedIds = new Set<string>();
    for (const note of all) {
      if (note.title.toLowerCase().includes(lower)) {
        titleMatched.push(note);
        titleMatchedIds.add(note.id);
      }
    }

    // 2) 本文一致を追加（タイトルで既にヒットした分は除外）
    const bodyMatched: NoteMeta[] = [];
    for (const note of all) {
      if (titleMatchedIds.has(note.id)) continue;
      try {
        const body = readBody(note.id);
        if (body.toLowerCase().includes(lower)) {
          bodyMatched.push(note);
        }
      } catch {
        // 読み取り失敗は無視
      }
    }

    return [...titleMatched, ...bodyMatched];
  });

  ipcMain.handle(
    'notes:list-tags',
    (): Array<{ tag: string; notes: NoteMeta[] }> => {
      const all = listNotes();
      // タグ → ノートID集合
      const tagMap = new Map<string, Set<string>>();
      // #word パターン: 行頭/空白の直後の `#` + 文字/数字/_/-
      const tagRe = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;

      const addTag = (tag: string, noteId: string) => {
        let set = tagMap.get(tag);
        if (!set) {
          set = new Set();
          tagMap.set(tag, set);
        }
        set.add(noteId);
      };

      for (const note of all) {
        // ノートメタデータのタグ（TagBar 入力分）も含める
        for (const tag of note.tags) {
          if (tag) addTag(tag, note.id);
        }

        let body: string;
        try {
          body = readBody(note.id);
        } catch {
          continue;
        }
        let inCode = false;
        for (const line of body.split('\n')) {
          // fenced code block の境界 (``` または ~~~)
          if (/^\s*(```|~~~)/.test(line)) {
            inCode = !inCode;
            continue;
          }
          if (inCode) continue;
          // 見出し行 (`# ` 〜 `###### `) はスキップ
          if (/^#{1,6}\s/.test(line)) continue;
          for (const m of line.matchAll(tagRe)) {
            addTag(m[1], note.id);
          }
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
      renameFolder(oldNorm, newNorm);
    },
  );

  // ----- settings -----
  ipcMain.handle('settings:getAll', (): Record<string, string> => {
    return getAllSettings();
  });

  ipcMain.handle('settings:set', (_e, key: string, value: string): void => {
    setSetting(key, value);
  });

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
      // http(s) のみ許可（その他のプロトコルは無視）
      if (!/^https?:\/\//i.test(url)) return;
      await shell.openExternal(url);
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
