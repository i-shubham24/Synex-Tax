/** Statement imports for income tax returns: Form 16 (Form 130), Form 26AS (Form 168) and capital gains reports. */
export { textLines as itrStatementTextLines, type StatementIssue as ItrStatementIssue } from './common.js';
export * from './form16.js';
export * from './form26as.js';
export * from './capitalGains.js';
