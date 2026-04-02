import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Palmyra Delivery',
    short_name: 'Palmyra',
    description: 'Beställ Palmyra och andra restauranger i en Foodora-liknande upplevelse.',
    start_url: '/',
    display: 'standalone',
    background_color: '#fff3d1',
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
