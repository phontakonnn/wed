declare module 'better-sqlite3' {
  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (message?: unknown, ...additionalArguments: unknown[]) => void;
  }

  interface BackupProgress {
    totalPages: number;
    remainingPages: number;
  }

  interface BackupMetadata {
    totalPages: number;
    remainingPages: number;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    exec(sql: string): this;
    prepare(sql: string): {
      all(...parameters: unknown[]): unknown[];
      get(...parameters: unknown[]): unknown;
      run(...parameters: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    };
    pragma(source: string, options?: { simple?: boolean }): unknown;
    function<Arguments extends unknown[], Result>(
      name: string,
      options: { deterministic?: boolean; directOnly?: boolean; safeIntegers?: boolean } | undefined,
      implementation: (...parameters: Arguments) => Result,
    ): this;
    transaction<T extends (...args: never[]) => unknown>(operation: T): (...args: Parameters<T>) => ReturnType<T>;
    backup(destination: string, options?: { progress?: (progress: BackupProgress) => void }): Promise<BackupMetadata>;
    close(): void;
  }

  namespace Database {
    type Database = InstanceType<typeof Database>;
  }

  export = Database;
}
