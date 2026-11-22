/**
 * The first worksheet of an .xlsx file as rows of cell text, read in the browser with no library:
 * the zip is unpacked with DecompressionStream and the sheet XML read with DOMParser.
 * Dates stored as Excel day numbers are written out as dd/mm/yyyy.
 */

interface ZipEntry {
  name: string;
  method: number;
  size: number;
  offset: number;
}

function entries(buf: ArrayBuffer): ZipEntry[] {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This is not an Excel (.xlsx) file.');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    out.push({ name: dec.decode(new Uint8Array(buf, p + 46, nameLen)), method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readEntry(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const v = new DataView(buf);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const data = new Uint8Array(buf, start, e.size);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('This Excel file uses a compression the browser cannot read.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

const DATE_FMT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
const serialToDate = (n: number) => {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const list = entries(buf);
  const get = async (name: string) => {
    const e = list.find((x) => x.name === name);
    return e ? readEntry(buf, e) : null;
  };
  const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

  // The first sheet in workbook order.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml');
  const rels = await get('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rel = [...xml(rels).getElementsByTagName('Relationship')].find((r) => r.getAttribute('Id') === rid);
    const target = rel?.getAttribute('Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }

  const shared: string[] = [];
  const ss = await get('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push([...si.getElementsByTagName('t')].map((t) => t.textContent ?? '').join(''));

  // Styles that format a number as a date.
  const dateStyles = new Set<number>();
  const styles = await get('xl/styles.xml');
  if (styles) {
    const doc = xml(styles);
    const custom = new Map<number, string>();
    for (const f of doc.getElementsByTagName('numFmt')) custom.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
    const xfs = doc.getElementsByTagName('cellXfs')[0];
    if (xfs) {
      [...xfs.getElementsByTagName('xf')].forEach((xf, i) => {
        const id = Number(xf.getAttribute('numFmtId') ?? 0);
        const code = custom.get(id)?.toLowerCase().replace(/"[^"]*"|\[[^\]]*\]/g, '') ?? '';
        if (DATE_FMT_IDS.has(id) || (/[dy]/.test(code) && !/0/.test(code.replace(/[dmyhs]/g, '')))) dateStyles.add(i);
      });
    }
  }

  const sheet = await get(sheetPath);
  if (!sheet) throw new Error('The workbook has no worksheet.');
  const rows: string[][] = [];
  for (const row of xml(sheet).getElementsByTagName('row')) {
    const r = Number(row.getAttribute('r') ?? rows.length + 1) - 1;
    const cells: string[] = [];
    for (const c of row.getElementsByTagName('c')) {
      const i = colIndex(c.getAttribute('r') ?? '');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let text: string;
      if (t === 's') text = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') text = [...c.getElementsByTagName('t')].map((x) => x.textContent ?? '').join('');
      else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (!t || t === 'n') {
        const n = Number(v);
        text = v !== '' && dateStyles.has(Number(c.getAttribute('s') ?? -1)) && Number.isFinite(n) ? serialToDate(n) : v !== '' && Number.isFinite(n) ? String(Math.round(n * 100) / 100) : v;
      } else text = v;
      cells[i] = text;
    }
    rows[r] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}
