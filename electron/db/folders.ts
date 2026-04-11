import { initDb } from './index';

interface FolderRow {
  path: string;
}

/** 空フォルダのパスを昇順で返す。 */
export function listFolders(): string[] {
  const db = initDb();
  const rows = db
    .prepare(`SELECT path FROM folders ORDER BY path ASC`)
    .all() as FolderRow[];
  return rows.map((r) => r.path);
}

/**
 * 空フォルダを追加する。既存の場合は no-op。
 * パスは事前に正規化済み（前後スラッシュを除いた "a/b/c" 形式）であることが前提。
 */
export function insertFolder(path: string): void {
  if (!path) return;
  const db = initDb();
  db.prepare(
    `INSERT OR IGNORE INTO folders (path, created_at) VALUES (?, ?)`,
  ).run(path, Date.now());
}

export function deleteFolder(path: string): void {
  const db = initDb();
  db.prepare(`DELETE FROM folders WHERE path = ?`).run(path);
}
