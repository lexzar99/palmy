#!/bin/bash
echo "🚀 Startar Flutter Restaurant App..."
export PATH="$PATH:/Users/jalle/development/flutter/bin"
cd mobile_apps/restaurant_mobile

flutter clean
flutter pub get
flutter run
