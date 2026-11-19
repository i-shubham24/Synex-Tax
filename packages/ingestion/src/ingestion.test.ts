import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTallyXmlVouchers,
  buildTallyVoucherExportXml,
  TallyConnectionGuard,
  parseInvoiceCsv,
  sanitizeFilename,
  validateUploadedFile,
} from './index.js';

test('TallyXmlParser: parses sales voucher with GST tax splits', () => {
  const sampleTallyXml = `
  <ENVELOPE>
    <BODY>
      <DATA>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20261104</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV-2026/001</VOUCHERNUMBER>
            <PARTYNAME>Amritsar Textiles Pvt Ltd</PARTYNAME>
            <PARTYGSTIN>03AABCA1234F1ZJ</PARTYGSTIN>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Domestic Fabric Sales</LEDGERNAME>
              <AMOUNT>-100000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST @ 9%</LEDGERNAME>
              <AMOUNT>-9000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST @ 9%</LEDGERNAME>
              <AMOUNT>-9000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </DATA>
    </BODY>
  </ENVELOPE>`;

  const vouchers = parseTallyXmlVouchers(sampleTallyXml);
  assert.equal(vouchers.length, 1);
  const v = vouchers[0];
  assert.equal(v.sanitizedInvoiceNum, 'INV-2026/001');
  assert.equal(v.invoiceDate, '2026-11-04');
  assert.equal(v.voucherType, 'Sales');
  assert.equal(v.partyGstin, '03AABCA1234F1ZJ');
  assert.equal(v.posStateCode, '03');
  assert.equal(v.taxableValue, '100000.00');
  assert.equal(v.cgstAmount, '9000.00');
  assert.equal(v.sgstAmount, '9000.00');
  assert.equal(v.igstAmount, '0.00');
  assert.equal(v.totalAmount, '118000.00');
  assert.equal(v.isRule46Valid, true);
  assert.equal(v.isGstinValid, true);
});

test('TallyXmlParser: generates incremental export envelope', () => {
  const xml = buildTallyVoucherExportXml('Amritsar Textiles Pvt Ltd', '20261101', '20261130', 'Sales');
  assert.ok(xml.includes('<REPORTNAME>Voucher Register</REPORTNAME>'));
  assert.ok(xml.includes('<SVCURRENTCOMPANY>Amritsar Textiles Pvt Ltd</SVCURRENTCOMPANY>'));
  assert.ok(xml.includes('<SVFROMDATE>20261101</SVFROMDATE>'));
});

test('TallyConnectionGuard: serializes concurrent tasks', async () => {
  const guard = TallyConnectionGuard.getInstance();
  const executionOrder: number[] = [];

  const t1 = guard.schedule(async () => {
    executionOrder.push(1);
    return 'task1';
  });
  const t2 = guard.schedule(async () => {
    executionOrder.push(2);
    return 'task2';
  });

  const [r1, r2] = await Promise.all([t1, t2]);
  assert.equal(r1, 'task1');
  assert.equal(r2, 'task2');
  assert.deepEqual(executionOrder, [1, 2]);
});

test('ExcelCsvParser: parses CSV with smart header auto-detection', () => {
  const csvContent = `Invoice Number,Date,Buyer GSTIN,Taxable Value,CGST,SGST,IGST
INV-2026/010,04/11/2026,03AABCA1234F1ZJ,50000.00,4500.00,4500.00,0.00
INV-2026/011,06/11/2026,07AABCA1234F1ZB,100000.00,0.00,0.00,18000.00`;

  const result = parseInvoiceCsv(csvContent, '03'); // Supplier state = Punjab (03)
  assert.equal(result.totalRows, 2);
  assert.equal(result.validRowsCount, 2);
  assert.equal(result.errorRowsCount, 0);

  const r1 = result.rows[0];
  assert.equal(r1.invoiceNum, 'INV-2026/010');
  assert.equal(r1.invoiceDate, '2026-11-04'); // DD/MM/YYYY converted to YYYY-MM-DD
  assert.equal(r1.partyGstin, '03AABCA1234F1ZJ');
  assert.equal(r1.posStateCode, '03');
  assert.equal(r1.cgstAmount, '4500.00');
  assert.equal(r1.sgstAmount, '4500.00');

  const r2 = result.rows[1];
  assert.equal(r2.invoiceNum, 'INV-2026/011');
  assert.equal(r2.posStateCode, '07');
  assert.equal(r2.igstAmount, '18000.00');
  assert.equal(r2.cgstAmount, '0.00');

  assert.equal(result.totalTaxableValue, '150000.00');
  assert.equal(result.totalIgst, '18000.00');
  assert.equal(result.totalCgst, '4500.00');
  assert.equal(result.totalSgst, '4500.00');
});

test('FileValidator: sanitizeFilename prevents path traversal attacks', () => {
  const dirty1 = '../../../../etc/passwd.csv';
  assert.equal(sanitizeFilename(dirty1), 'passwd.csv');

  const dirty2 = '..\\..\\windows\\system32\\calc.exe';
  assert.equal(sanitizeFilename(dirty2), 'calc.exe');

  const dirty3 = 'my invoices (v1.2).xlsx';
  assert.equal(sanitizeFilename(dirty3), 'my_invoices_v1.2.xlsx');
});

test('FileValidator: rejects executable binary signatures spoofed as CSV', () => {
  // PE executable signature: 'MZ' (0x4D, 0x5A)
  const fakeCsv = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
  const result = validateUploadedFile('transactions.csv', fakeCsv);
  assert.equal(result.isValid, false);
  assert.match(result.error || '', /Executable binary signature detected/);
});

test('FileValidator: blocks XXE and DOCTYPE entity injections in XML', () => {
  const maliciousXml = `<?xml version="1.0"?>
  <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
  <ENVELOPE>&xxe;</ENVELOPE>`;

  const result = validateUploadedFile('tally_export.xml', Buffer.from(maliciousXml));
  assert.equal(result.isValid, false);
  assert.match(result.error || '', /XML DTD declarations are strictly prohibited/);
});

test('FileValidator: accepts clean CSV and XLSX files within limits', () => {
  const cleanCsv = Buffer.from('Invoice,Date,Taxable\nINV-001,2026-11-01,1000\n');
  const csvRes = validateUploadedFile('clean_sales.csv', cleanCsv);
  assert.equal(csvRes.isValid, true);

  // Valid XLSX starting with PK zip header
  const xlsxHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  const xlsxRes = validateUploadedFile('gstr1_data.xlsx', xlsxHeader);
  assert.equal(xlsxRes.isValid, true);
});
