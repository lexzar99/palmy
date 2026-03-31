#!/bin/bash

# Palmyra Pizzeria - Lokalt Startskript
echo "🚀 Startar Palmyra Pizzeria System..."

# 1. Installera root-beroenden om de saknas
if [ ! -d "node_modules" ]; then
    echo "📦 Installerar beroenden..."
    pnpm install
fi

# 2. Starta Backend (API)
echo "📡 Startar Backend API på http://localhost:4000..."
(cd packages/api && npm run dev) &
API_PID=$!

# 3. Starta Kundsida (Web)
echo "🌍 Startar Kundsida på http://0.0.0.0:3000..."
(cd apps/web && npx next dev -H 0.0.0.0) &
WEB_PID=$!

# 4. Starta Adminpanel
echo "👮 Startar Adminpanel på http://0.0.0.0:3001..."
(cd apps/admin && npx next dev -p 3001 -H 0.0.0.0) &
ADMIN_PID=$!


# Hantera avslutning
trap "kill $API_PID $WEB_PID $ADMIN_PID; echo '🛑 Systemet stoppat.'; exit" INT TERM

echo "--------------------------------------------------------"
echo "✅ Allt körs!"
echo "📍 Kundsida:   http://localhost:3000"
echo "📍 Adminpanel: http://localhost:3001"
echo "📍 API:        http://localhost:4000"
echo "--------------------------------------------------------"
echo "Loggar för API nedan:"

# Vänta på processerna
wait
