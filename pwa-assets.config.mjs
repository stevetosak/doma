// Config for @vite-pwa/assets-generator, run by `npm run generate:pwa-assets`.
//
// Deliberately self-contained — no `import` from the generator package — so
// it can run through `npx` without the package being a project dependency
// (it drags in an old sharp/libvips with open CVEs and is only ever needed
// here, by hand, when the logo changes).
//
// GROUND (#e9e4d8) = --color-ground (DESIGN.md). The iOS splash uses it so
// the launch screen dissolves into the app's first painted frame. Light
// only — the ground is identical in both themes, a dark splash would be a
// byte-for-byte duplicate. `apple-splash-portrait-*` is what ships;
// scripts/generate-pwa-assets.mjs deletes the landscape pair afterwards.
//
// `appleSplashScreens.sizes` is the de-duplicated set of iOS portrait
// device resolutions (mirrors the generator's own AllAppleDeviceNames
// table, v1.0.2). Add a row when Apple ships a new screen size.

const GROUND = '#e9e4d8'

/** @type {{ width: number, height: number, scaleFactor: number }[]} */
const appleDevicePortraitSizes = [
  { width: 2048, height: 2732, scaleFactor: 2 }, // iPad Pro 12.9" / Air 13"
  { width: 1668, height: 2388, scaleFactor: 2 }, // iPad Pro 11" / 10.5"
  { width: 1640, height: 2360, scaleFactor: 2 }, // iPad Air 11" / iPad 11"
  { width: 1668, height: 2224, scaleFactor: 2 }, // iPad Air 10.5"
  { width: 1620, height: 2160, scaleFactor: 2 }, // iPad 10.2"
  { width: 1536, height: 2048, scaleFactor: 2 }, // iPad 9.7" / mini 7.9"
  { width: 1488, height: 2266, scaleFactor: 2 }, // iPad mini 8.3"
  { width: 1320, height: 2868, scaleFactor: 3 }, // iPhone 16 Pro Max
  { width: 1206, height: 2622, scaleFactor: 3 }, // iPhone 16 Pro
  { width: 1290, height: 2796, scaleFactor: 3 }, // iPhone 16 Plus / 15 Pro Max / 14 Pro Max
  { width: 1179, height: 2556, scaleFactor: 3 }, // iPhone 16 / 15 Pro / 15 / 14 Pro
  { width: 1170, height: 2532, scaleFactor: 3 }, // iPhone 16e / 14 / 13 Pro / 13 / 12
  { width: 1284, height: 2778, scaleFactor: 3 }, // iPhone 14 Plus / 13 Pro Max / 12 Pro Max
  { width: 1242, height: 2688, scaleFactor: 3 }, // iPhone 11 Pro Max / XS Max
  { width: 1125, height: 2436, scaleFactor: 3 }, // iPhone 13 mini / 12 mini / 11 Pro / XS / X
  { width: 828, height: 1792, scaleFactor: 2 }, //  iPhone 11 / XR
  { width: 1242, height: 2208, scaleFactor: 3 }, // iPhone 8 Plus / 7 Plus / 6s Plus
  { width: 750, height: 1334, scaleFactor: 2 }, //  iPhone SE / 8 / 7 / 6s
  { width: 640, height: 1136, scaleFactor: 2 }, //  iPhone SE (1st gen)
]

export default {
  headLinkOptions: { preset: '2023', basePath: '/' },
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']] },
    maskable: { sizes: [512] },
    apple: { sizes: [180] },
    appleSplashScreens: {
      sizes: appleDevicePortraitSizes,
      padding: 0.16,
      resizeOptions: { background: GROUND, fit: 'contain' },
      linkMediaOptions: {
        log: true,
        addMediaScreen: true,
        basePath: '/',
        xhtml: false,
      },
      png: { compressionLevel: 9, quality: 80 },
    },
  },
  images: ['public/doma-icon.svg'],
}
