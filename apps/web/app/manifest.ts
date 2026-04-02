import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Palmyra Lund',
    short_name: 'Palmyra',
    description: 'Beställ mat från Palmyra Pizzeria och andra restauranger i Lund med snabb leverans.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#fbbf24',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
