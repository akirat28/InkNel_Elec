import { initDb } from './index';

export interface NoteMeta {
  id: string;
  title: string;
  folder: string;
  protected: boolean;
  createdAt: number;
  updatedAt: number;
}

interface NoteRow {
  id: string;
  title: string;
  folder: string;
  protected: number;
  created_at: number;
  updated_at: number;
}

function rowToMeta(row: NoteRow): NoteMeta {
  return {
    id: row.id,
    title: row.title,
    folder: row.folder,
    protected: row.protected !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listNotes(): NoteMeta[] {
  const db = initDb();
  const rows = db
    .prepare(
      `SELECT id, title, folder, protected, created_at, updated_at
         FROM notes
        ORDER BY updated_at DESC`,
    )
    .all() as NoteRow[];
  return rows.map(rowToMeta);
}

export function getNote(id: string): NoteMeta | null {
  const db = initDb();
  const row = db
    .prepare(
      `SELECT id, title, folder, protected, created_at, updated_at FROM notes WHERE id = ?`,
    )
    .get(id) as NoteRow | undefined;
  return row ? rowToMeta(row) : null;
}

export function insertNote(meta: NoteMeta): void {
  const db = initDb();
  db.prepare(
    `INSERT INTO notes (id, title, folder, protected, created_at, updated_at)
     VALUES (@id, @title, @folder, @protectedInt, @createdAt, @updatedAt)`,
  ).run({
    ...meta,
    protectedInt: meta.protected ? 1 : 0,
  });
}

export function updateNoteMeta(
  id: string,
  patch: { title?: string; folder?: string },
): NoteMeta {
  const db = initDb();
  const current = getNote(id);
  if (!current) throw new Error(`note not found: ${id}`);
  const next: NoteMeta = {
    ...current,
    title: patch.title ?? current.title,
    folder: patch.folder ?? current.folder,
    updatedAt: Date.now(),
  };
  db.prepare(
    `UPDATE notes
        SET title = @title,
            folder = @folder,
            updated_at = @updatedAt
      WHERE id = @id`,
  ).run(next);
  return next;
}

export function setNoteProtected(id: string, isProtected: boolean): NoteMeta {
  const db = initDb();
  const current = getNote(id);
  if (!current) throw new Error(`note not found: ${id}`);
  db.prepare(`UPDATE notes SET protected = ? WHERE id = ?`).run(
    isProtected ? 1 : 0,
    id,
  );
  return { ...current, protected: isProtected };
}

export function touchNote(id: string): void {
  const db = initDb();
  db.prepare(`UPDATE notes SET updated_at = ? WHERE id = ?`).run(Date.now(), id);
}

export function deleteNote(id: string): void {
  const db = initDb();
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
}
