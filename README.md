# BYJH — Bespoke Lifestyle Management

Complete source and assets for the approved BYJH website, exported on 6 September 2026.

## Run locally

This is a static HTML, CSS, and JavaScript site. No dependency installation or build step is required.

```sh
python3 -m http.server 8080 --directory dist
```

Open http://localhost:8080. Serve the site over HTTP rather than opening the HTML files directly.

## Pages and features

- Home: uploaded hero video, a Sprinter following the road on scroll, direction changes, rotating wheels, horizontal fleet storytelling, and vehicle specification dialogs.
- Members: the homepage road winds down the page, switching sides between members; the Sprinter follows it on scroll and uncovers each member as it drives past.
- Partners: two rows of partner logos form the lane lines of a road the Sprinter drives along; they run faster while scrolling and reverse when scrolling back up. A full logo grid follows.
- Gallery: photographs and eight videos, with an image and video viewer.
- Contact: enquiry form with validation, vehicle preselection, enquiry review, and copying.
- Logo intro: the animated BYJH logo plays on the first page of a visit, and a short logo stamp plays between pages (see below).
- Responsive layouts, keyboard-accessible dialogs, and support for the operating system's reduced-motion preference.

**Contact form status:** the review step's Send button opens the visitor's email app with an enquiry addressed to info@byjh.co.uk and remmie@byjh.co.uk. Nothing is sent from the server; for automatic delivery, add an email service or backend.

## Project structure

| Path | Contents |
| --- | --- |
| `dist/index.html` | Homepage and embedded vehicle specifications |
| `dist/members/index.html` | Members page; each `article.member` is one member; sides alternate automatically |
| `dist/members.js`, `dist/members.css` | Members road, reveal and chapter indicator |
| `dist/partners/index.html` | Partners page; the partner list (`ul.partner-grid`) also feeds the road |
| `dist/partners.js`, `dist/partners.css` | Partner logo road and grid |
| `dist/gallery/index.html` | Gallery page |
| `dist/contact/index.html` | Contact page |
| `dist/app.js` | Homepage road and horizontal scroll behaviour |
| `dist/common.js` | Shared navigation, dialogs, media, image loading, and motion preferences |
| `dist/vehicle-motion.js` | Scroll direction, turning, and wheel movement helpers |
| `dist/contact.js` | Contact form validation and enquiry preparation |
| `dist/intro.js`, `dist/intro.css` | Logo intro and page transitions; loaded synchronously in every page's `<head>` |
| `dist/assets/intro/` | Rendered videos: `intro-*` (4 s intro) and `stamp-*` (0.9 s page transition), each as 1920×1080 desktop and 1080×1920 mobile cuts in MP4 (H.264) and WebM (VP9) |
| `dist/*.css` | Layout, branding, and responsive styles |
| `dist/assets/` | All 55 image, logo, favicon, sprite, and video assets used by the site |
| `fleet-data.json` | Editable source copy of the fleet specification data |
| `gallery-content.json` | Gallery content and asset metadata |
| `content-sources.json` | Original content and asset provenance |
| `tests/vehicle-motion.test.cjs` | Vehicle motion helper tests |
| `.openai/hosting.json` | Existing ChatGPT Sites deployment configuration |

The homepage currently embeds its fleet data in `script#fleet-data`. When changing `fleet-data.json`, update that embedded data too. The gallery markup is static; changes to its metadata file also need to be reflected in `dist/gallery/index.html`.

## Logo intro and page transitions

Every page includes `<link rel="stylesheet" href="/intro.css?v=2"><script src="/intro.js?v=2"></script>` directly after its `<title>`. Keep the script synchronous: it covers the page before the first paint.

- The first page of a visit (per browser tab session) plays the 4-second logo intro, then fades into the page. Visitors can skip it with the SKIP button, a click or tap anywhere, or Escape, Enter or Space.
- Clicking an internal link fades to the intro colour, navigates, and the next page opens with the 0.9-second logo stamp: the finished logo pops in, snaps back and slides its depth out. Same-page anchors, links opened in new tabs, downloads, media files and links whose click is already handled (gallery viewer) are left alone.
- Reloads, back/forward navigation and typing a URL later in the same visit show the page directly.
- Portrait screens get the mobile cuts; wider screens get the desktop cuts. The stamp video is prefetched once the page has loaded.
- Everything is skipped for the reduced-motion preference, Save-Data, automated browsers (`navigator.webdriver`, so the existing browser checks are unaffected) and any URL containing `?nointro`.
- If a video cannot start quickly (3.5 s for the intro, 1.5 s for the stamp), or autoplay is blocked (for example iPhone Low Power Mode), the page is shown straight away.

The background colour `#070408` in `intro.css` must match the videos. The videos are rendered in Blender from a separate motion-graphics project; replace the files in `dist/assets/intro/` and bump `?v=` in each page to update them.

## Check scroll and vehicle motion

With Node.js installed:

```sh
node --test tests/*.test.cjs
```

For browser checks, make `puppeteer-core` available to Node, set `PUPPETEER_EXECUTABLE_PATH` to a Chrome executable, and run `node tests/homepage-browser.cjs` while the local server is running. Set `BYJH_QA_URL` to test another URL. This covers mobile touch swipes, desktop scrolling, the older-browser fallback, navigation controls, and reduced motion. `node tests/intro-browser.cjs` checks the logo intro the same way. Mobile emulation uses Chromium; physical iPhone Safari remains a separate visual check.

## Deploy elsewhere

For Vercel, import this repository with the root directory left at the repository root. The included `vercel.json` sets the output directory to `dist`; no build command is required.

Publish `dist/` as the web root on a static host. URLs such as `/assets/`, `/gallery/`, and `/contact/` are root-relative. A host mounted at a subdirectory, such as a default GitHub Pages project URL, needs corresponding URL changes or a custom domain served at the root.

Uploading this repository does not enable GitHub Pages or change the existing live site. The `.openai/hosting.json` file is only needed for the existing ChatGPT Sites deployment and is not required by other static hosts.

## Export identity

The website files and assets match the approved source snapshot `a7292ae159588df88e8b3032480fc8b4be8083eb`. This repository starts from that current snapshot. The original development history is not included.

BYJH branding and supplied photographs and videos are included as website assets. No third-party media licence is granted by this export.
