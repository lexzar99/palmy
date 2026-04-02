import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";

export async function POST(req: Request) {
  try {
    const { name, tagline, primaryColor, adminEmail, adminPassword, address, phone, theme, stripePublic, stripeSecret, deliveryFee, minOrder } = await req.json();
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const rootDir = process.cwd().includes("apps/factory") 
      ? path.join(process.cwd(), "../../") 
      : process.cwd();
    
    const targetDir = path.join(rootDir, "generated", slug);

    if (fs.existsSync(targetDir)) {
       fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });

    fs.writeFileSync(path.join(targetDir, "pnpm-workspace.yaml"), "packages:\n  - 'web'\n  - 'admin'\n  - 'api'\n");

    const copyOptions = {
       recursive: true,
       filter: (src: string) => !src.includes("node_modules") && !src.includes(".next") && !src.includes("dist") && !src.includes(".turbo")
    };

    fs.cpSync(path.join(rootDir, "apps/web"), path.join(targetDir, "web"), copyOptions);
    fs.cpSync(path.join(rootDir, "apps/admin"), path.join(targetDir, "admin"), copyOptions);
    fs.cpSync(path.join(rootDir, "packages/api"), path.join(targetDir, "api"), copyOptions);

    const seedScript = `
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hash = bcrypt.hashSync('${adminPassword}', 10);
  
  await prisma.adminUser.upsert({
    where: { email: '${adminEmail}' },
    update: { password: hash },
    create: {
      email: '${adminEmail}',
      password: hash,
      name: 'Admin',
      role: 'ADMIN',
      isActive: true
    }
  });

  await prisma.restaurantSettings.upsert({
    where: { id: 'settings' },
    update: {},
    create: { id: 'settings', isOpen: true, deliveryFee: ${Number(deliveryFee) || 4900}, minOrderAmount: ${Number(minOrder) || 15000} }
  });

  console.log('✅ Admin-konto och inställningar skapade!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
`;
    fs.writeFileSync(path.join(targetDir, "api/seed.js"), seedScript);

    const apiPkgPath = path.join(targetDir, "api/package.json");
    if (fs.existsSync(apiPkgPath)) {
      const apiPkg = JSON.parse(fs.readFileSync(apiPkgPath, "utf-8"));
      apiPkg.scripts["db:setup"] = "npx prisma generate && npx prisma db push --accept-data-loss && node seed.js";
      apiPkg.name = "@" + slug + "/api";
      fs.writeFileSync(apiPkgPath, JSON.stringify(apiPkg, null, 2));
    }

    const webPkgPath = path.join(targetDir, "web/package.json");
    if (fs.existsSync(webPkgPath)) {
      const webPkg = JSON.parse(fs.readFileSync(webPkgPath, "utf-8"));
      webPkg.name = "@" + slug + "/web";
      webPkg.scripts.dev = "next dev";
      fs.writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2));
    }

    const adminPkgPath = path.join(targetDir, "admin/package.json");
    if (fs.existsSync(adminPkgPath)) {
      const adminPkg = JSON.parse(fs.readFileSync(adminPkgPath, "utf-8"));
      adminPkg.name = "@" + slug + "/admin";
      adminPkg.scripts.dev = "next dev";
      fs.writeFileSync(adminPkgPath, JSON.stringify(adminPkg, null, 2));
    }

    const walkAndReplace = (dir: string) => {
       const files = fs.readdirSync(dir);
       for (const file of files) {
          const fullPath = path.join(dir, file);
          if (fs.statSync(fullPath).isDirectory()) {
             walkAndReplace(fullPath);
          } else if (/\.(tsx|ts|js|jsx|json|css|prisma|env|md)$/.test(file)) {
             let content = fs.readFileSync(fullPath, "utf-8");
             
             content = content.replace(/Palmyra Pizzeria/g, name);
             content = content.replace(/Palmyra/g, name);
             content = content.replace(/palmyra/gi, slug);
             
             content = content.replace(/Stora Södergatan 17, Lund/g, address);
             content = content.replace(/046-12 34 56/g, phone);

             content = content.replace(/#d4a74a/g, primaryColor);
             content = content.replace(/#e5b85c/g, primaryColor + "CC");
             content = content.replace(/#b38b3a/g, primaryColor + "AA");

             fs.writeFileSync(fullPath, content);
          }
       }
    };
    walkAndReplace(targetDir);

    const customHeroPath = path.join(targetDir, "web/components/Hero.tsx");
    let themeComponent = "";

    if (theme === "classic") {
      themeComponent = `
import Link from 'next/link';
import { MapPin, Phone } from 'lucide-react';

export default function Hero() {
  return (
    <div className="bg-white text-dark-500 min-h-screen">
      <div className="relative h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-dark-500/60 z-10" />
        <img src="/hero.jpg" className="absolute inset-0 w-full h-full object-cover" alt="Hero" />
        <div className="relative z-20 text-center text-white px-6">
          <h1 className="text-6xl md:text-8xl font-serif mb-6">${name}</h1>
          <p className="text-2xl font-light mb-12">${tagline}</p>
          <Link href="/menu" className="bg-[var(--color-gold-500)] text-white px-10 py-5 rounded-full text-lg font-bold hover:bg-opacity-90 transition-all uppercase tracking-widest">
            Se vår meny
          </Link>
        </div>
      </div>
      <section className="py-24 px-6 text-center max-w-4xl mx-auto">
         <h2 className="text-4xl font-serif mb-8 flex items-center justify-center gap-4">
           Vi finns på <MapPin className="text-[var(--color-gold-500)]" /> ${address}
         </h2>
         <p className="text-xl text-gray-600 mb-8">Ring oss på <Phone className="inline w-5 h-5"/> ${phone}</p>
      </section>
     </div>
  );
}`;
    } else if (theme === "minimal") {
      themeComponent = `
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function Hero() {
  return (
    <div className="bg-zinc-50 text-zinc-900 min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-[var(--color-gold-500)] mb-6">${tagline}</p>
      <h1 className="text-7xl font-light tracking-tighter mb-12">${name}.</h1>
      <Link href="/menu" className="group flex items-center gap-4 text-xl border-b border-zinc-900 pb-2 hover:text-[var(--color-gold-500)] hover:border-[var(--color-gold-500)] transition-all">
        Utforska menyn <ArrowRight className="group-hover:translate-x-2 transition-transform" />
      </Link>
      <div className="mt-24 flex gap-8 text-sm text-zinc-500 uppercase tracking-widest">
        <span>${address}</span>
        <span>${phone}</span>
      </div>
    </div>
  );
}`;
    } else {
      themeComponent = `
import Link from 'next/link';
import { Utensils } from 'lucide-react';

export default function Hero() {
  return (
    <div className="bg-dark-500 text-white min-h-screen">
      <div className="h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-dark-500 to-dark-400 z-0" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[var(--color-gold-500)]/10 blur-[120px] rounded-full z-0" />
        
        <div className="relative z-10 text-center">
          <Utensils className="w-16 h-16 text-[var(--color-gold-500)] mx-auto mb-8" />
          <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter mb-6">${name}</h1>
          <p className="text-xl md:text-3xl text-white/50 font-bold italic mb-12">${tagline}</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/menu" className="bg-[var(--color-gold-500)] text-dark-500 px-12 py-5 rounded-2xl text-lg font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-[var(--color-gold-500)]/20">
              Till Menyn
            </Link>
          </div>
          <div className="mt-16 flex justify-center gap-12 text-sm font-bold text-white/30 uppercase tracking-widest">
            <p>${address}</p>
            <p>${phone}</p>
          </div>
        </div>
      </div>
    </div>
  );
}`;
    }
    fs.writeFileSync(customHeroPath, themeComponent);

    const schemaPath = path.join(targetDir, "api/prisma/schema.prisma");
    if (fs.existsSync(schemaPath)) {
       let schema = fs.readFileSync(schemaPath, "utf-8");
       schema = schema.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
       schema = schema.replace(/url\s*=\s*env\("DATABASE_URL"\)/g, 'url = "file:./dev.db"');
       fs.writeFileSync(schemaPath, schema);
    }

    const updateEnv = (folder: string, envName: string, ports: any) => {
       const envPath = path.join(targetDir, folder, envName);
       if (!fs.existsSync(envPath)) {
         fs.writeFileSync(envPath, "");
       }
       let content = fs.readFileSync(envPath, "utf-8");
       
       const lines = content.split("\n");
       const updates: any = {
         PORT: ports.port,
         NEXT_PUBLIC_API_URL: "http://localhost:" + ports.api,
         DATABASE_URL: '"file:./dev.db"',
         JWT_SECRET: '"factory-secret-' + slug + '"',
         STRIPE_SECRET_KEY: stripeSecret ? '"' + stripeSecret + '"' : '"sk_test_placeholder"',
         NEXT_PUBLIC_STRIPE_PUBLIC_KEY: stripePublic ? '"' + stripePublic + '"' : '"pk_test_placeholder"',
       };

       const newLines = lines.map(line => {
          for (const key in updates) {
            if (line.startsWith(key + "=")) {
              return key + "=" + updates[key];
            }
          }
          return line;
       });

       for (const key in updates) {
          if (!newLines.some(l => l.startsWith(key + "="))) {
            newLines.push(key + "=" + updates[key]);
          }
       }
       fs.writeFileSync(envPath, newLines.join("\n"));
    };

    let basePort = 4000;
    for(let i=0; i<slug.length; i++) { basePort += slug.charCodeAt(i); }
    let finalBase = Math.floor(basePort / 10) * 10;
    while(finalBase < 4000) finalBase += 10;
    if(finalBase > 9000) finalBase = 4000;

    const ports = { web: finalBase, admin: finalBase + 1, api: finalBase + 2 };

    updateEnv("web", ".env.local", { port: ports.web, api: ports.api });
    updateEnv("admin", ".env.local", { port: ports.admin, api: ports.api });
    updateEnv("api", ".env", { port: ports.api, api: ports.api });

    // 8. Kör kommandon automatisk (Install, DB, Serve)
    try {
      console.log("Installerar beroenden för", slug);
      execSync("pnpm install", { cwd: targetDir, stdio: "ignore" });
      
      console.log("Sätter upp databasen", slug);
      execSync("pnpm run db:setup", { cwd: path.join(targetDir, "api"), stdio: "ignore" });

      console.log("Startar servrar i bakgrunden");
      const out = fs.openSync(path.join(targetDir, 'out.log'), 'a');
      const err = fs.openSync(path.join(targetDir, 'err.log'), 'a');
      
      const apiProc = spawn("pnpm", ["dev"], { cwd: path.join(targetDir, "api"), detached: true, stdio: ['ignore', out, err] });
      apiProc.unref();

      const webProc = spawn("pnpm", ["dev"], { cwd: path.join(targetDir, "web"), detached: true, env: { ...process.env, PORT: ports.web.toString() }, stdio: ['ignore', out, err] });
      webProc.unref();

      const adminProc = spawn("pnpm", ["dev"], { cwd: path.join(targetDir, "admin"), detached: true, env: { ...process.env, PORT: ports.admin.toString() }, stdio: ['ignore', out, err] });
      adminProc.unref();
      
    } catch(err) {
      console.error("Auto-start failed:", err);
      // We continue since the files are generated
    }

    return NextResponse.json({ 
       success: true, 
       slug, 
       path: targetDir,
       ports
    });

  } catch (error: any) {
    console.error("Factory Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
