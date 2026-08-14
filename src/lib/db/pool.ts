import { Pool, type PoolConfig } from "pg";
import { getDatabaseUrl } from "./config";

let pool: Pool | undefined;

export function getPool(config?: PoolConfig): Pool {
  if (config) {
    return new Pool(config);
  }
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
