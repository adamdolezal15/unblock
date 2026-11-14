import type { z } from "zod";

/**
 * Validate provider output. If the whole object fails, keep the valid elements of any top-level
 * array (one malformed claim shouldn't sink the other eleven). Returns null when nothing survives.
 */
export function salvage<T>(schema: z.ZodType<T>, content: unknown): T | null {
  const full = schema.safeParse(content);
  if (full.success) return full.data;
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;

  // Rebuild the object with only the array items that validate on their own.
  const obj = { ...(content as Record<string, unknown>) };
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape;
  if (!shape) return null;
  for (const [key, field] of Object.entries(shape)) {
    const value = obj[key];
    const element = (field as unknown as { element?: z.ZodType }).element;
    if (Array.isArray(value) && element) obj[key] = value.filter((v) => element.safeParse(v).success);
    else if (value === undefined || value === null) {
      const fallback = field.safeParse(undefined);
      if (!fallback.success && element) obj[key] = [];
    }
  }
  const retry = schema.safeParse(obj);
  return retry.success ? retry.data : null;
}
