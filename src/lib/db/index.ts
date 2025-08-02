import { drizzle } from 'drizzle-orm/d1';
import type { RequestEventCommon } from '@builder.io/qwik-city';
import * as schema from './schema';

export function getDB(event: RequestEventCommon) {
  return drizzle(event.platform.env.DB, { schema });
}

export * from './schema';