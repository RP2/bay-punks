// bay-punks D1 migration worker entrypoint
import type { ExecutionContext } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Future API endpoints will go here
    return new Response("OK: Worker is running.", { status: 200 });
  },
};
