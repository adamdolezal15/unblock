import { z } from "zod";

/** Exa outputSchema limits (CLAUDE.md): max 10 properties, 2 nesting levels. */
export const EXA_MAX_PROPERTIES = 10;
export const EXA_MAX_DEPTH = 2;

type Json = Record<string, unknown>;

/** Counts object properties at every level and the deepest object nesting (root object = level 1). */
export function schemaStats(schema: Json): { properties: number; depth: number } {
  let properties = 0;
  let depth = 0;
  const walk = (node: unknown, level: number) => {
    if (!node || typeof node !== "object") return;
    const n = node as Json;
    if (n.type === "object" && n.properties && typeof n.properties === "object") {
      depth = Math.max(depth, level);
      for (const child of Object.values(n.properties as Json)) {
        properties++;
        walk(child, level + 1);
      }
    } else if (n.type === "array" && n.items) {
      walk(n.items, level); // arrays don't add a level; the object inside does
    }
  };
  walk(schema, 1);
  return { properties, depth };
}

/** Drop JSON Schema keys Exa doesn't need. */
function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (!node || typeof node !== "object") return node;
  const out: Json = {};
  for (const [k, v] of Object.entries(node as Json)) {
    if (k === "$schema" || k === "additionalProperties") continue;
    out[k] = strip(v);
  }
  return out;
}

/** zod -> JSON Schema for Exa outputSchema. Throws if the schema breaks Exa's limits. */
export function toExaSchema(schema: z.ZodType): Json {
  const json = strip(z.toJSONSchema(schema)) as Json;
  const { properties, depth } = schemaStats(json);
  if (properties > EXA_MAX_PROPERTIES || depth > EXA_MAX_DEPTH) {
    throw new Error(
      `outputSchema too large for Exa: ${properties} properties (max ${EXA_MAX_PROPERTIES}), depth ${depth} (max ${EXA_MAX_DEPTH})`,
    );
  }
  return json;
}
