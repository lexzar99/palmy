import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MatGo',
    short_name: 'MatGo',
    description: 'Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090f21',
    theme_color: '#e7b24b',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
