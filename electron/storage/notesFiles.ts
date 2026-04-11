import { app } from 'electron';
import { join } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';

/**
 * ノート本文 (.md) を userData/notes/ にフラット配置で保存する。
 * ディレクトリ階層は DB の `folder` カラムで仮想的に管理し、
 * ファイルシステム上はネストしない（同期/検索/バックアップが単純になる）。
 */

function notesDir(): string {
  const dir = join(app.getPath('userData'), 'notes');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function notePath(id: string): string {
  return join(notesDir(), `${id}.md`);
}

export function readBody(id: string): string {
  const p = notePath(id);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf-8');
}

export function writeBody(id: string, body: string): void {
  writeFileSync(notePath(id), body, 'utf-8');
}

export function deleteBody(id: string): void {
  const p = notePath(id);
  if (existsSync(p)) unlinkSync(p);
}
