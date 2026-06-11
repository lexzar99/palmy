import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Delívera',
    short_name: 'Delívera',
    description: 'Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.',
    start_url: '/',
    display: 'standalone',
    // Vit splash/statusyta — matchar appens ljusa default-tema. Mörka färger
    // här gav svart band vid dynamic island och mörk splash mot vit app.
    background_color: '#ffffff',
    theme_color: '#ffffff',
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
