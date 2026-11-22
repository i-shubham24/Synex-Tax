import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';

/**
 * Test helper: compiles one of the Department's draft-04 ITR schemas for Ajv 8. Boolean
 * exclusiveMinimum/Maximum are turned into the draft-06 form; nothing else is changed. Reads files,
 * so it is not exported from the package index.
 */
export function itrValidator(file: string) {
  // src/itr or dist/itr: the package root is two levels up.
  const raw = JSON.parse(readFileSync(join(__dirname, '..', '..', 'schemas', 'itr', file), 'utf-8'));
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
  return new Ajv({ strict: false, allErrors: true }).compile(fix(raw));
}
