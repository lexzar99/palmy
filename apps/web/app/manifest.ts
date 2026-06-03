import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Delívera',
    short_name: 'Delívera',
    description: 'Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090f21',
    theme_color: '#e7b24b',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
