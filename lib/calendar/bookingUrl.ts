// A booking_url claim's value is sometimes a link ("migri.vihta.com", "https://...") and sometimes an
// instruction ("call the Tax Administration ... to book an appointment"). Only the first may become a link.

/** https URL for a link-shaped value, else null. */
export function bookingHref(value: string | undefined): string | null {
  const v = value?.trim();
  if (!v || /\s/.test(v)) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol)) return null;
    // A real host: at least one dot, labels of letters / digits / hyphens, a 2+ letter TLD.
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}
