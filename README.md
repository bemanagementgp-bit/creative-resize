# Creative Resize – Free Social Media Image Resizer

Adapt one design to every social format at once: Instagram Post / Portrait / Story-Reels, TikTok, YouTube Thumbnail / Shorts, Facebook Post / Cover, LinkedIn Post / Cover, X Post / Header, Pinterest Pin, WhatsApp Status and any custom size. Smart crop with a shared focal point, fit with blurred or solid background, stretch, padding, corner radius and caption overlay. Everything renders on `<canvas>` in the user's browser; nothing is uploaded.

**Live:** https://__SITE_URL__/ (placeholder – replaced after deploy)

## Features

**Free**
- Drop / pick / paste one image (PNG, JPG, WebP). A built-in sample poster is shown until an image is loaded.
- 14 formats grouped by platform (2026 sizes) with switch rows, "Select all / None", preset bundle chips (Instagram set, Video platforms, Covers, Everything), 1 custom size
- Fill modes: Smart crop (cover centered on a draggable focal point), Fit + blurred background (blur radius slider), Fit + solid color (picker or auto dominant color), Stretch
- Padding 0–120 px, corner radius, optional "Show safe zones" overlay on 9:16 previews (top 250 / bottom 340 px)
- Caption overlay on every format: text, top/bottom, size, color; placed inside Story safe zones automatically
- Stage shows a grid of live previews (max 360 px each, rendered with `Studio.raf`); click one for the focus view: drag to pan, wheel/slider to zoom (1–3x), per-format fill mode override, per-format download, reset
- "Download all": sequential PNG/JPG/WebP downloads for up to 4 formats (5+ opens the Pro modal); JPG/WebP quality slider; Ctrl/Cmd+S shortcut
- 1 saved format bundle; all settings persisted in `localStorage`
- Free exports carry a small "Creative Resize · free" badge (`Studio.watermark`)

**Pro (one-time, price from `config.js`)**
- No watermark
- ZIP of all formats (JSZip loaded lazily from jsDelivr)
- 2x export
- Unlimited custom sizes and saved bundles
- Batch sources: drop several images, each resized to every selected format, one ZIP

Gates are enforced in `app.js` via `isPro()` / `Studio.gate()` (`batch`, `hires`, `custom`, `bundles`, `multi`); the UI listens to `pro:changed`.

## Files

```
index.html     tool page + SEO content + FAQ (JSON-LD WebApplication + FAQPage)
styles.css     _shared/base.css + app styles
app.js         rendering engine + UI (vanilla JS, no build step)
studio.js      shared canvas / drop zone / export / ZIP helpers (copy of _shared/studio.js)
monetize.js    shared theme / toast / analytics / AdSense / Pro license helpers
config.js      window.APP_CONFIG (site URL, AdSense, GA, checkout URL, price, LICENSE, NEWSLETTER)
privacy.html   privacy policy (required for AdSense)
terms.html     terms of use
robots.txt, sitemap.xml, vercel.json, favicon.svg, .gitignore
```

## Run locally

```bash
npx serve .
```

No build step. Open the printed URL.

## Deploy

Deploy the folder as a static site on Vercel (`vercel --prod`). After the first deploy, replace the placeholder everywhere:

```bash
sed -i 's/__SITE_URL__/your-app.vercel.app/g' index.html privacy.html terms.html robots.txt sitemap.xml config.js README.md
```

Then run `node _shared/apply-brand.js creative-resize` from the repo root to inject the shared header, hero, footer and lead card.

## Monetization setup

1. **AdSense** – set `ADSENSE_CLIENT: "ca-pub-XXXXXXXXXXXXXXXX"` in `config.js`. Slots: `sidebar-1`, `below-tool`. `privacy.html` already discloses advertising cookies.
2. **Analytics** – set `GA_ID: "G-XXXXXXX"`. Events: `add_files`, `sample`, `format_toggle`, `preset_bundle`, `select_all`, `custom_add`, `fill_mode`, `focal_set`, `focus_open`, `format_pan`, `format_fill`, `export_scale`, `download` (format, scale), `download_all`, `download_zip`, `bundle_save`, `bundle_apply`, `pro_click`, `begin_checkout`, `license_activated`.
3. **Pro checkout + licenses** – create a one-time product on Lemon Squeezy with license keys enabled, set `PRO_CHECKOUT_URL`, `PRO_PRICE` and `LICENSE.store_id` / `product_id`. Until those are set, real keys are refused and only `LICENSE.test_keys` work locally.
4. **Newsletter** – set `NEWSLETTER.url` (Formspree / ConvertKit / Beehiiv) to show the lead card that `apply-brand.js` injects.

## Notes

- Previews render at a reduced scale (max 360 px, focus view 720 px); full-size canvases are only created on export.
- The blurred background uses a cached 512 px copy of the source (`ctx.filter` with a downscale fallback for browsers without canvas filters).
- Sequential free downloads: Chrome asks once to "allow multiple downloads" for the site.
- The only external requests are Google Fonts, optional GA/AdSense, the Lemon Squeezy license API when a key is entered, and JSZip on ZIP export.
