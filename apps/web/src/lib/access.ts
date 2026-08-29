export const WEB_UI_PROJECT_ID = "00000000-0000-0000-0000-000000000001";
export const LEGACY_PROJECT_ID = "00000000-0000-0000-0000-000000000002";

export const RESERVED_PROJECT_IDS = new Set([
  WEB_UI_PROJECT_ID,
  LEGACY_PROJECT_ID,
]);

export function isReservedProjectId(id: string): boolean {
  return RESERVED_PROJECT_IDS.has(id);
}
