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

const tagged = (strings: TemplateStringsArray, ...values: unknown[]) =>
  getSql()(strings, ...values);

/**
 * Lazy neon client — import-safe at build time without DATABASE_URL.
 * Forwards tagged-template calls plus `.query` / `.unsafe` / `.transaction`
 * (`.query` is required for parameterized SQL from `buildUsageQuery`).
 */
export const sql: Sql = Object.assign(tagged, {
  query: ((queryWithPlaceholders: string, params?: unknown[]) =>
    getSql().query(queryWithPlaceholders, params)) as Sql["query"],
  unsafe: ((rawSQL: string) => getSql().unsafe(rawSQL)) as Sql["unsafe"],
  transaction: ((
    ...args: Parameters<Sql["transaction"]>
  ) => getSql().transaction(...args)) as Sql["transaction"],
}) as Sql;
