import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGstin, calculateGstinChecksum } from './gstin.js';
import { validatePan, validatePanForChallanHead } from './pan.js';
import { validatePlaceOfSupply } from './pos.js';
import { validateInvoiceNumberRule46 } from './rule46.js';
import { classifySection175BlockedCredit } from './section17-5.js';

test('GSTIN validation and Mod-36 checksum', () => {
  // Valid Punjab GSTIN: 03AAAAA0000A1ZC
  const chk = calculateGstinChecksum('03AAAAA0000A1Z');
  assert.equal(chk, 'C');

  const validRes = validateGstin('03AAAAA0000A1ZC');
  assert.equal(validRes.isValid, true);
  assert.equal(validRes.stateCode, '03');
  assert.equal(validRes.stateName, 'Punjab');

  // Corrupted checksum
  const invalidRes = validateGstin('03AAAAA0000A1Z9');
  assert.equal(invalidRes.isValid, false);
  assert.match(invalidRes.error || '', /Mod-36 checksum failure/);

  // Invalid state code
  const invalidState = validateGstin('98AAAAA0000A1ZC');
  assert.equal(invalidState.isValid, false);
  assert.match(invalidState.error || '', /Invalid GST state code/);
});

test('PAN constitution and challan head mapping', () => {
  // 4th character is constitution status:
  // ABCCA1234F -> 4th char is 'C' (Company)
  const compPan = validatePan('ABCCA1234F');
  assert.equal(compPan.isValid, true);
  assert.equal(compPan.constitution, 'COMPANY');
  assert.equal(compPan.isCompany, true);

  // ABCPA1234F -> 4th char is 'P' (Individual)
  const indPan = validatePan('ABCPA1234F');
  assert.equal(indPan.isValid, true);
  assert.equal(indPan.constitution, 'INDIVIDUAL');
  assert.equal(indPan.isCompany, false);

  // ABCFA1234F -> 4th char is 'F' (Firm / LLP)
  const firmPan = validatePan('ABCFA1234F');
  assert.equal(firmPan.isValid, true);
  assert.equal(firmPan.constitution, 'FIRM_LLP');
  assert.equal(firmPan.isCompany, false);

  // Challan head compatibility
  const compHeadOk = validatePanForChallanHead('ABCCA1234F', '0020');
  assert.equal(compHeadOk.isCompatible, true);

  const compHeadFail = validatePanForChallanHead('ABCPA1234F', '0020');
  assert.equal(compHeadFail.isCompatible, false);
  assert.match(compHeadFail.error || '', /strictly for Companies/);

  const nonCompHeadOk = validatePanForChallanHead('ABCPA1234F', '0021');
  assert.equal(nonCompHeadOk.isCompatible, true);
});

test('Place of Supply validation', () => {
  // Intra-state Punjab to Punjab: must have CGST+SGST, no IGST
  const intraValid = validatePlaceOfSupply({
    supplierStateCode: '03',
    posStateCode: '03',
    igstAmount: '0',
    cgstAmount: '90.00',
    sgstAmount: '90.00',
  });
  assert.equal(intraValid.isValid, true);
  assert.equal(intraValid.isIntraState, true);

  // Intra-state error: charging IGST
  const intraInvalid = validatePlaceOfSupply({
    supplierStateCode: '03',
    posStateCode: '03',
    igstAmount: '180.00',
    cgstAmount: '0',
    sgstAmount: '0',
  });
  assert.equal(intraInvalid.isValid, false);
  assert.match(intraInvalid.error || '', /Intra-state supplies require CGST \+ SGST/);

  // Inter-state Punjab to Delhi (07): must have IGST, no CGST/SGST
  const interValid = validatePlaceOfSupply({
    supplierStateCode: '03',
    posStateCode: '07',
    igstAmount: '180.00',
    cgstAmount: '0',
    sgstAmount: '0',
  });
  assert.equal(interValid.isValid, true);
  assert.equal(interValid.isIntraState, false);
});

test('Rule 46 invoice number validation', () => {
  // Valid invoice numbers
  assert.equal(validateInvoiceNumberRule46('INV-2026/001').isValid, true);
  assert.equal(validateInvoiceNumberRule46('TAX2026-99').isValid, true);

  // Invalid: exceeds 16 chars
  const tooLong = validateInvoiceNumberRule46('INV-2026-2027-00001');
  assert.equal(tooLong.isValid, false);
  assert.match(tooLong.error || '', /exceeds statutory 16-character limit/);

  // Invalid: contains disallowed special character (e.g. underscore or space)
  const invalidChar = validateInvoiceNumberRule46('INV_001');
  assert.equal(invalidChar.isValid, false);
  assert.match(invalidChar.error || '', /violates Rule 46\(b\)/);
});

test('Section 17(5) blocked credit routing', () => {
  // Motor vehicle
  const car = classifySection175BlockedCredit({ hsnOrSacCode: '870321' });
  assert.equal(car.isBlocked, true);
  assert.equal(car.routingTable, 'Table_4_B_1');

  // Motor vehicle for further supply (car dealership)
  const carDealer = classifySection175BlockedCredit({ hsnOrSacCode: '870321', isUsedForFurtherSupply: true });
  assert.equal(carDealer.isBlocked, false);
  assert.equal(carDealer.routingTable, 'Table_4_A_5');

  // Food & catering
  const food = classifySection175BlockedCredit({ hsnOrSacCode: '996331' });
  assert.equal(food.isBlocked, true);
  assert.equal(food.routingTable, 'Table_4_B_1');
});
