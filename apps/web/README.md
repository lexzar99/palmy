This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Den här appen körs INTE lokalt för verifiering — kod pushas till GitHub och
deployas via Vercel. Använd `vercel.com/dashboard` för live-preview.

You can start editing the page by modifying `app/page.tsx`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Launch-gate

Hemsidan är låst tills en signerad HttpOnly-cookie finns. Sätt dessa server-only
variabler i Vercel innan launch:

```text
LAUNCH_ACCESS_CODE_SHA256=<sha256-hash av intern åtkomstkod>
LAUNCH_ACCESS_COOKIE_SECRET=<slumpmässig lång hemlighet>
```

Klartextkoden ska inte läggas i repo, frontend eller publika miljövariabler.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
