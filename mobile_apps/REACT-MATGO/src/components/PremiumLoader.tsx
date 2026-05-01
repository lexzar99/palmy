// Legacy alias — the actual implementation lives in SplashLoader.tsx now.
// Anything that still imports `PremiumLoader` will transparently get the new
// light-theme splash loader instead of the old dark fork/spoon design.
export { default } from "./SplashLoader";
