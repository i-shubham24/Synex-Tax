/**
 * Company and contact details used by /privacy, /terms and /contact.
 *
 * Confirm before launch: the mailboxes below must exist and be monitored, the Grievance
 * Officer must be a named person, and the courts clause is the founders' choice.
 */
export const LEGAL = {
  product: 'SynexTax',
  company: 'Synex Labs',
  city: 'Amritsar, Punjab',
  updated: '20 November 2026',
  emails: {
    hello: 'hello@synextax.in',
    support: 'support@synextax.in',
    privacy: 'privacy@synextax.in',
    grievance: 'grievance@synextax.in',
  },
  grievanceOfficer: 'Grievance Officer, Synex Labs',
  courts: 'Amritsar, Punjab',
  dataRegion: 'AWS Mumbai (ap-south-1), with an encrypted standby copy in AWS Hyderabad (ap-south-2)',
} as const;
