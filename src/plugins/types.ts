/**
 * プラグイン共通の型定義。
 *
 * 各プラグインは `src/plugins/<id>.ts` として配置し、`manifest` を export する。
 * registry はビルド時に `import.meta.glob` でこのフォルダを列挙し、
 * manifest を持つモジュールを自動的にプラグインとして認識する。
 *
 * 重い依存（例: mermaid 本体）は **モジュール先頭で import せず**、
 * `renderInPreview()` 等の関数内で動的 import すること。さもないと
 * registry の列挙だけで全プラグインのコストが乗ってしまう。
 */

export interface PluginManifest {
  /** 一意な ID（設定キー / ファイル名と揃える） */
  id: string;
  /** 設定画面に表示する名前 */
  label: string;
  /** 設定画面に表示する説明文 */
  description: string;
}

export interface PluginRenderContext {
  /** 現在の UI テーマ。テーマ追従するプラグイン用 */
  theme: 'dark' | 'light';
}

export interface PluginFenceArgs {
  /** コードブロックの中身 */
  code: string;
  /** ` ```xxx ` の `xxx` 部分（小文字化前） */
  lang: string;
  /** markdown-it の escape ヘルパ */
  escapeHtml: (s: string) => string;
}

/**
 * プラグインが「設定画面のプラグインリストに表示するインライン設定 UI」を
 * 提供したい場合に実装する React コンポーネントの Props 型。
 * PreferencesModal の他パネルと同じ shape を共有して onChange 互換にする。
 */
export interface PluginSettingsProps {
  settings: import('../settings').AppSettings;
  onChange: <K extends keyof import('../settings').AppSettings>(
    key: K,
    value: import('../settings').AppSettings[K],
  ) => void;
}

export interface PluginModule {
  manifest: PluginManifest;
  /**
   * 特定言語の fenced code block をプラグイン側で HTML 化したい場合に実装。
   * 該当しない言語なら null を返すと既定の fence renderer に委譲される。
   */
  renderFence?(args: PluginFenceArgs): string | null;
  /**
   * プレビュー HTML の DOM への挿入が終わった後に呼ばれる。
   * SVG への置換などをここで行う。
   */
  renderInPreview?(
    root: HTMLElement,
    ctx: PluginRenderContext,
  ): Promise<void> | void;
  /**
   * 再描画前に呼ばれる。テーマ切替や本文変更時に既存の DOM 状態を
   * 戻したい場合に実装。
   */
  resetInPreview?(root: HTMLElement): void;
  /**
   * プラグインが ON のときだけ、設定画面のプラグインリスト内に
   * インラインで描画される設定 UI（任意）。
   * 持たないプラグインではこのエリアが出ない。
   */
  SettingsComponent?: React.ComponentType<PluginSettingsProps>;
}
