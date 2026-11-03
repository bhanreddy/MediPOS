/**
 * Shared snake_case ↔ camelCase helpers for REST payloads (Express/Zod uses snake_case).
 * Use domain-specific normalizers when you need enums, renamed fields, or joins — this is for plain DTO keys only.
 */

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** `medicineId` → `medicine_id` */
export function camelToSnakeKey(key: string): string {
  return key
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

/** `medicine_id` → `medicineId` */
export function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Deep-map object keys from camelCase → snake_case. Skips `undefined` values.
 * Arrays are mapped element-wise; nested plain objects recurse until `depth` hits 0.
 */
export function mapKeysToSnake(value: unknown, depth = 6): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    if (depth <= 0) return value;
    return value.map((item) => mapKeysToSnake(item, depth - 1));
  }
  if (!isPlainRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    const snakeKey = camelToSnakeKey(key);
    out[snakeKey] =
      val !== null && typeof val === 'object' && depth > 0 && !(val instanceof Date)
        ? mapKeysToSnake(val, depth - 1)
        : val;
  }
  return out;
}

/**
 * Deep-map object keys from snake_case → camelCase.
 */
export function mapKeysToCamel(value: unknown, depth = 6): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    if (depth <= 0) return value;
    return value.map((item) => mapKeysToCamel(item, depth - 1));
  }
  if (!isPlainRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    const camelKey = snakeToCamelKey(key);
    out[camelKey] =
      val !== null && typeof val === 'object' && depth > 0 && !(val instanceof Date)
        ? mapKeysToCamel(val, depth - 1)
        : val;
  }
  return out;
}
