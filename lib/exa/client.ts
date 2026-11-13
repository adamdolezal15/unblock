// The only module that imports exa-js. Lazy so scripts can load env before first use.
import Exa from "exa-js";

let client: Exa | null = null;

export function exa(): Exa {
  if (!client) {
    const key = process.env.EXA_API_KEY;
    if (!key) throw new Error("EXA_API_KEY is not set (expected in .env.local)");
    client = new Exa(key);
  }
  return client;
}
