// Cloudflare D1 type definitions for TypeScript

interface D1Database {
  exec<T = unknown>(query: string): Promise<D1ExecResult<T>>;
  prepare(query: string): D1PreparedStatement;
}

interface D1ExecResult<T = unknown> {
  results: T[];
  success: boolean;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run<T = unknown>(): Promise<D1ExecResult<T>>;
}
