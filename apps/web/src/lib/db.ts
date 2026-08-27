import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

type Sql = NeonQueryFunction<false, false>;

let cached: Sql | undefined;

function getSql(): Sql {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = neon(url);
  }
  return cached;
}

/** Lazy neon client — import-safe at build time without DATABASE_URL. */
export const sql: Sql = ((strings: TemplateStringsArray, ...values: any[]) =>
  getSql()(strings, ...values)) as Sql;
