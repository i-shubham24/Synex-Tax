import type { Metadata } from 'next';
import { buildPrivateMetadata } from '../../../seo/meta';

export const metadata: Metadata = buildPrivateMetadata(
  'Document Upload | SynTax',
  'Private one-time document upload checklist link shared by your Chartered Accountant on SynTax.',
  '/upload',
);

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
