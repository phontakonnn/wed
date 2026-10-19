declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string);
    exec(sql: string): this;
    prepare(sql: string): {
      all(...parameters: unknown[]): unknown[];
      get(...parameters: unknown[]): unknown;
      run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    };
    pragma(source: string, options?: { simple?: boolean }): unknown;
    transaction<T extends (...args: never[]) => unknown>(operation: T): (...args: Parameters<T>) => ReturnType<T>;
    close(): void;
  }

  namespace Database {
    type Database = InstanceType<typeof Database>;
  }

  export = Database;
}