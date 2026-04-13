#!/bin/bash
echo "🚀 Startar React Native MatGo..."
cd mobile_apps/REACT-MATGO

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "📦 Installerar saknade paket..."
  npm install
fi

# Start expo
npx expo start
