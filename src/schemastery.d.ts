/**
 * The dsh-vendored schemastery ships no .d.ts alongside its ESM entry, so
 * declare the small surface this plugin uses. The host validates the Config
 * export through the same schema instance, which is untyped here anyway.
 */
declare module '@deepseek-ai/schemastery' {
  interface Schema<T = unknown> {
    default(value: T): Schema<T>;
    description(text: string): Schema<T>;
    min(value: number): Schema<T>;
    max(value: number): Schema<T>;
  }
  interface SchemaStatic {
    object<T>(shape: Record<string, Schema>): Schema<T>;
    string(): Schema<string>;
    boolean(): Schema<boolean>;
    number(): Schema<number>;
    natural(): Schema<number>;
    array<T>(inner: Schema<T>): Schema<T[]>;
  }
  const Schema: SchemaStatic;
  export default Schema;
}
