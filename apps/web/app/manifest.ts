import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Palmyra Pizzeria',
    short_name: 'Palmyra',
    description: 'Bästa pizzan, rullarna och tallrikarna i Lund.',
    start_url: '/',
    display: 'standalone',
    background_color: '#050505',
    theme_color: '#d4a74a',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],

  }
}
