This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Den här appen körs INTE lokalt för verifiering — kod pushas till GitHub och
deployas via Vercel. Använd `vercel.com/dashboard` för live-preview.

You can start editing the page by modifying `app/page.tsx`.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Launch-gate

Webben använder samma `PRELAUNCH_MODE` som API:t. Variabeln är server-only:

- `PRELAUNCH_MODE=1` låser användarsidor bakom en signerad HttpOnly-cookie.
- `PRELAUNCH_MODE=0` öppnar hela kundwebben publikt.

Saknad eller ogiltig flagga låser webben i produktion. Lokal utveckling är
öppen som standard om flaggan saknas. Sätt dessa server-only-variabler i
Vercel inför det låsta smoke-testet:

```text
PRELAUNCH_MODE=1
LAUNCH_ACCESS_CODE_SHA256=<sha256-hash av intern åtkomstkod>
LAUNCH_ACCESS_COOKIE_SECRET=<slumpmässig lång hemlighet>
```

Samma `LAUNCH_ACCESS_COOKIE_SECRET` måste finnas på webb och API. Klartextkoden
ska inte läggas i repo, frontend eller publika miljövariabler. När smoke-testet
är godkänt ska både webb och API deployas med `PRELAUNCH_MODE=0`.

`/manifest.webmanifest` och `/.well-known/*` är alltid publika så PWA-metadata,
Apple-associationer och Android App Links förblir maskinläsbara även när gaten
är låst.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
