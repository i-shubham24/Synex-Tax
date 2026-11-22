// Copies the pdf.js and Tesseract browser files into public/vendor so the Bank to books page
// loads them from this app (the Content-Security-Policy allows no CDN).
//
//   node scripts/copy-vendor.mjs            (from apps/web)
//
// Run it after installing or upgrading pdfjs-dist or tesseract.js. English OCR data comes from
// the @tesseract.js-data/eng package when it is installed, or from a file named in
// TESSERACT_ENG_DATA (an eng.traineddata.gz, the 4.0.0_best_int build).
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'vendor');
const require = createRequire(join(here, '..', 'package.json'));
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

// pdf.js: worker, wasm decoders (JPEG 2000 and JBIG2, common in scanned statements), fonts, CMaps.
const pdf = pkgDir('pdfjs-dist');
mkdirSync(join(out, 'pdfjs'), { recursive: true });
copyFileSync(join(pdf, 'build', 'pdf.worker.min.mjs'), join(out, 'pdfjs', 'pdf.worker.min.mjs'));
for (const d of ['wasm', 'standard_fonts', 'cmaps']) cpSync(join(pdf, d), join(out, 'pdfjs', d), { recursive: true });

// Tesseract: the worker script and the LSTM cores (the worker picks one by SIMD support).
const tjs = pkgDir('tesseract.js');
const core = pkgDir('tesseract.js-core');
mkdirSync(join(out, 'tesseract', 'core'), { recursive: true });
mkdirSync(join(out, 'tesseract', 'lang'), { recursive: true });
copyFileSync(join(tjs, 'dist', 'worker.min.js'), join(out, 'tesseract', 'worker.min.js'));
for (const f of readdirSync(core)) if (/^tesseract-core.*-lstm\.wasm\.js$|^tesseract-core-lstm\.wasm\.js$/.test(f)) copyFileSync(join(core, f), join(out, 'tesseract', 'core', f));

let eng = process.env.TESSERACT_ENG_DATA;
if (!eng) {
  try {
    eng = join(pkgDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz');
  } catch {
    eng = undefined;
  }
}
if (eng && existsSync(eng)) {
  copyFileSync(eng, join(out, 'tesseract', 'lang', 'eng.traineddata.gz'));
  console.log('Copied English OCR data.');
} else if (!existsSync(join(out, 'tesseract', 'lang', 'eng.traineddata.gz'))) {
  console.warn('English OCR data not found: install @tesseract.js-data/eng or set TESSERACT_ENG_DATA. Scanned statements cannot be read until it is in public/vendor/tesseract/lang.');
}
console.log(`Vendor files are in ${out}`);
