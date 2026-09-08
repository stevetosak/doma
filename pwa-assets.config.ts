import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// Icon + splash background. Matches --color-ground (DESIGN.md) so the
// iOS install screen dissolves into the app's first painted frame with
// no colour jump. No dark splash: the ground is the same in both themes,
// so a dark variant would be a byte-for-byte duplicate.
//
// Source art: brand/doma-icon.svg. public/doma-icon.svg is the working
// copy the generator reads, so every output lands in public/.
// Regenerate with:  npm run generate:pwa-assets
const GROUND = '#e9e4d8'

export default defineConfig({
  headLinkOptions: { preset: '2023', basePath: '/' },
  preset: {
    ...minimal2023Preset,
    appleSplashScreens: createAppleSplashScreens({
      padding: 0.16,
      resizeOptions: { background: GROUND, fit: 'contain' },
      linkMediaOptions: {
        log: true,
        addMediaScreen: true,
        basePath: '/',
        xhtml: false,
      },
      png: { compressionLevel: 9, quality: 80 },
    }),
  },
  images: ['public/doma-icon.svg'],
})
