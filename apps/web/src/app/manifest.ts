import type { MetadataRoute } from 'next';

// Lets clients add their upload page to the home screen, and staff install the workspace.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SynexTax',
    short_name: 'SynexTax',
    description: 'GST and TDS filing for CA practices, and document upload for their clients.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2f8ae0',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
