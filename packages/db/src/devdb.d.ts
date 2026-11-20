import type { PGlite } from '@electric-sql/pglite';

export declare const MIGRATIONS_DIR: string;
export declare const DEV_CONTEXT_KID: string;
export declare const DEV_CONTEXT_SECRET: string;

export declare function openDatabase(options?: { dataDir?: string }): Promise<PGlite>;
export declare function migrate(db: PGlite, options?: { log?: (message: string) => void }): Promise<string[]>;
export declare function ensureContextKey(db: PGlite, options?: { kid?: string; secret?: string | Buffer }): Promise<void>;

export interface DevDatabase {
  db: PGlite;
  port: number;
  host: string;
  stop(): Promise<void>;
}

export declare function startDevDatabase(options?: {
  dataDir?: string;
  port?: number;
  host?: string;
  kid?: string;
  secret?: string | Buffer;
  log?: (message: string) => void;
}): Promise<DevDatabase>;
