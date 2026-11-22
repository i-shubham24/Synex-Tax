/**
 * Parsers for the official listing pages the daily notification feed reads. Each was written
 * against the page as served on 22 November 2026; saved copies are in ./testdata.
 *
 *   EFILING  https://www.incometax.gov.in/iec/foportal/latest-news (Drupal view, server-rendered):
 *            div.views-row > div.up-date "06-Nov-2026" + div.gry-ft with the text and a PDF link.
 *            Items that are CBDT notifications or circulars are tagged CBDT.
 *   GSTC     https://gstcouncil.gov.in/press-release (Drupal table): td date "08-10-2026" and a
 *            td.views-field-title with the link and title.
 *   CBIC     https://cbic-gst.gov.in/ "What's New" block (the live #vmarquee list; the first one in
 *            the page is commented out). The page gives no dates, so the date is taken from the
 *            title when it carries one ("dated 05.06.2026"), else left empty.
 *
 * Not read: incometaxindia.gov.in/notifications and /circulars render their lists in the browser
 * from the site's search service, so the HTML holds no items (see the saved copy); CBDT items come
 * through the e-filing portal's news instead. CBIC's full notification list is on
 * taxinformation.cbic.gov.in, a browser app with no list in its HTML.
 */

export type FeedSource = 'CBDT' | 'EFILING' | 'CBIC' | 'GSTC';

export const FEED_SOURCES: Record<FeedSource, { label: string; url: string }> = {
  CBDT: { label: 'CBDT notifications and circulars (e-filing portal news)', url: 'https://www.incometax.gov.in/iec/foportal/latest-news' },
  EFILING: { label: 'Income-tax e-filing portal news', url: 'https://www.incometax.gov.in/iec/foportal/latest-news' },
  CBIC: { label: 'CBIC GST: what is new', url: 'https://cbic-gst.gov.in/' },
  GSTC: { label: 'GST Council press releases', url: 'https://gstcouncil.gov.in/press-release' },
};

/** The fixed pages the refresh job fetches. Nothing else is ever fetched. */
export const FEED_PAGES: ReadonlyArray<{ id: 'EFILING' | 'CBIC' | 'GSTC'; url: string }> = [
  { id: 'EFILING', url: 'https://www.incometax.gov.in/iec/foportal/latest-news' },
  { id: 'GSTC', url: 'https://gstcouncil.gov.in/press-release' },
  { id: 'CBIC', url: 'https://cbic-gst.gov.in/' },
];

export interface FeedItem {
  source: FeedSource;
  title: string;
  /** YYYY-MM-DD, or null when the page gives no date. */
  date: string | null;
  link: string;
  /** Longer text where the page has it (the e-filing news gives a paragraph). */
  text: string | null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"' };

export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function isoDate(y: string, m: string, d: string): string | null {
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** "06-Nov-2026", "08-10-2026", "05.06.2026" or "050626" after "dated". */
export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  if (m) return MONTHS[m[2].toLowerCase()] ? isoDate(m[3], MONTHS[m[2].toLowerCase()], m[1]) : null;
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(t);
  if (m) return isoDate(m[3], m[2], m[1]);
  return null;
}

function absolute(href: string, base: string): string | null {
  try {
    const u = new URL(href.replace(/&amp;/g, '&'), base);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function parseEfilingNews(html: string, base = FEED_SOURCES.EFILING.url): FeedItem[] {
  const view = html.indexOf('view-content');
  if (view < 0) return [];
  const chunks = html.slice(view).split('<div class="views-row">').slice(1);
  const out: FeedItem[] = [];
  for (const c of chunks) {
    const date = parseDate(htmlText(/<div class="up-date">([\s\S]*?)<\/div>/.exec(c)?.[1] ?? ''));
    const body = /<div class="d-flex gry-ft">([\s\S]*?)<\/div>\s*<\/span>/.exec(c)?.[1] ?? '';
    const text = htmlText(body).replace(/\s*Click here\.?\s*$/i, '').trim();
    if (!text) continue;
    const href = /<a[^>]+href="([^"]+)"/.exec(body)?.[1];
    const link = (href && absolute(href, base)) ?? base;
    const cbdt = /\bCBDT\b|Notification No\.?|Circular No\.?/i.test(text);
    out.push({ source: cbdt ? 'CBDT' : 'EFILING', title: clip(text.split(/(?<=\.)\s/)[0] ?? text, 300), date, link, text: clip(text, 4000) });
  }
  return out;
}

export function parseGstCouncilPress(html: string, base = 'https://gstcouncil.gov.in/'): FeedItem[] {
  const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? '';
  const out: FeedItem[] = [];
  for (const tr of tbody.split(/<tr[^>]*>/).slice(1)) {
    const date = parseDate(htmlText(/views-field-field-date-of-uploading[^>]*>([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? ''));
    const cell = /views-field-title[^>]*>([\s\S]*?)<\/td>/.exec(tr)?.[1] ?? '';
    const a = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(cell);
    if (!a) continue;
    const title = htmlText(a[2]);
    const link = absolute(a[1], base);
    if (!title || !link) continue;
    out.push({ source: 'GSTC', title: clip(title, 300), date, link, text: null });
  }
  return out;
}

export function parseCbicWhatsNew(html: string, base = FEED_SOURCES.CBIC.url): FeedItem[] {
  // Drop commented-out blocks first: the page keeps an older list inside a comment.
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const start = live.indexOf("What's New");
  if (start < 0) return [];
  const block = /<div id="vmarquee"[^>]*>([\s\S]*?)<\/div>/.exec(live.slice(start))?.[1] ?? '';
  const out: FeedItem[] = [];
  for (const m of block.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const title = htmlText(m[2]);
    const link = absolute(m[1].replace(/ /g, '%20'), base);
    if (!title || !link) continue;
    const d = /dated\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i.exec(title)?.[1] ?? /dated\s+(\d{2})(\d{2})(\d{2})\b/i.exec(title)?.slice(1).join('.') ?? null;
    let date: string | null = null;
    if (d) date = /^\d{2}\.\d{2}\.\d{2}$/.test(d) ? parseDate(`${d.slice(0, 6)}20${d.slice(6)}`) : parseDate(d);
    out.push({ source: 'CBIC', title: clip(title, 300), date, link, text: null });
  }
  return out;
}

export function parseFeedPage(id: 'EFILING' | 'CBIC' | 'GSTC', html: string): FeedItem[] {
  if (id === 'EFILING') return parseEfilingNews(html);
  if (id === 'GSTC') return parseGstCouncilPress(html);
  return parseCbicWhatsNew(html);
}
