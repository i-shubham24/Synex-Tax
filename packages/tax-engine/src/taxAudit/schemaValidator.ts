import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

/**
 * Test helper: compiles the Department's draft-04 schema for Form 3CA-3CD or 3CB-3CD (V2.5) for
 * Ajv 8, the way itr/schemaValidator.ts does for the ITR schemas: boolean exclusiveMinimum and
 * exclusiveMaximum are turned into the draft-06 form and nothing else in the schema is changed.
 * multipleOfPrecision is set so that a value such as 33.33 passes "multipleOf 0.01" despite binary
 * floating point. Reads files, so it is not exported from the package index.
 */
export function taxAuditValidator(form: '3CA' | '3CB') {
  const file = form === '3CA' ? 'FORM3CA3CD_MainSchema_V2.5.json' : 'FORM3CB3CD_MainSchema_V2.5.json';
  // src/taxAudit or dist/taxAudit: the package root is two levels up.
  const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'schemas', 'taxAudit', file), 'utf-8'));
  delete raw.$schema;
  const fix = (n: any): any => {
    if (Array.isArray(n)) return n.map(fix);
    if (n && typeof n === 'object') {
      for (const k of ['exclusiveMinimum', 'exclusiveMaximum'] as const) {
        if (typeof n[k] === 'boolean') {
          const bound = k === 'exclusiveMinimum' ? 'minimum' : 'maximum';
          if (n[k] && n[bound] !== undefined) { n[k] = n[bound]; delete n[bound]; } else delete n[k];
        }
      }
      for (const key of Object.keys(n)) n[key] = fix(n[key]);
    }
    return n;
  };
  return new Ajv({ strict: false, allErrors: true, multipleOfPrecision: 8 }).compile(fix(raw));
}
