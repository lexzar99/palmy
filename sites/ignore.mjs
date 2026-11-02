// Vercel kör det här före bygget. Avslutas med 0 när inget som rör sajten har ändrats, och då hoppas bygget över.
import { execFileSync } from "node:child_process";

const paths = [`${process.env.SITE}`, "_kit", "build.mjs", "check.mjs", "package.json", "vercel.json"];
try {
  execFileSync("git", ["diff", "--quiet", "HEAD^", "HEAD", "--", ...paths]);
} catch {
  process.exit(1);
}
