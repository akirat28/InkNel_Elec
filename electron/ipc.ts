import { ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  listNotes,
  getNote,
  insertNote,
  updateNoteMeta,
  setNoteProtected,
  touchNote,
  deleteNote,
  type NoteMeta,
} from './db/notes';
import {
  listFolders,
  insertFolder,
  deleteFolder,
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

/** 画像 1 枚あたりの最大サイズ (バイト) */
const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
/** 添付ファイル 1 つあたりの最大サイズ (バイト) */
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024; // 100 MB

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
        tags: [],
        createdAt: now,
        updatedAt: now,
      };
      insertNote(meta);
      writeBody(meta.id, input.body ?? '');
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
      return updateNoteMeta(id, patch);
    },
  );

  ipcMain.handle(
    'notes:update-body',
    (_e, id: string, body: string): void => {
      const note = getNote(id);
      if (!note) throw new Error(`note not found: ${id}`);
      writeBody(id, body);
      touchNote(id);
    },
  );

  ipcMain.handle(
    'notes:set-protected',
    (_e, id: string, isProtected: boolean): NoteMeta => {
      return setNoteProtected(id, isProtected);
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
      return saveImage(buf, ext);
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
      return saveAttachment(buf, ext);
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
}
