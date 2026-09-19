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
- Gallery: photographs and eight videos, with an image and video viewer.
- Contact: enquiry form with validation, vehicle preselection, enquiry review, and copying.
- Responsive layouts, keyboard-accessible dialogs, and support for the operating system's reduced-motion preference.

**Contact form status:** the review step's Send button opens the visitor's email app with an enquiry addressed to info@byjh.co.uk and remmie@byjh.co.uk. Nothing is sent from the server; for automatic delivery, add an email service or backend.

## Project structure

| Path | Contents |
| --- | --- |
| `dist/index.html` | Homepage and embedded vehicle specifications |
| `dist/gallery/index.html` | Gallery page |
| `dist/contact/index.html` | Contact page |
| `dist/app.js` | Homepage road and horizontal scroll behaviour |
| `dist/common.js` | Shared navigation, dialogs, media, image loading, and motion preferences |
| `dist/vehicle-motion.js` | Scroll direction, turning, and wheel movement helpers |
| `dist/contact.js` | Contact form validation and enquiry preparation |
| `dist/*.css` | Layout, branding, and responsive styles |
| `dist/assets/` | All 55 image, logo, favicon, sprite, and video assets used by the site |
| `fleet-data.json` | Editable source copy of the fleet specification data |
| `gallery-content.json` | Gallery content and asset metadata |
| `content-sources.json` | Original content and asset provenance |
| `tests/vehicle-motion.test.cjs` | Vehicle motion helper tests |
| `.openai/hosting.json` | Existing ChatGPT Sites deployment configuration |

The homepage currently embeds its fleet data in `script#fleet-data`. When changing `fleet-data.json`, update that embedded data too. The gallery markup is static; changes to its metadata file also need to be reflected in `dist/gallery/index.html`.

## Check scroll and vehicle motion

With Node.js installed:

```sh
node --test tests/*.test.cjs
```

For browser checks, make `puppeteer-core` available to Node, set `PUPPETEER_EXECUTABLE_PATH` to a Chrome executable, and run `node tests/homepage-browser.cjs` while the local server is running. Set `BYJH_QA_URL` to test another URL. This covers mobile touch swipes, desktop scrolling, the older-browser fallback, navigation controls, and reduced motion. Mobile emulation uses Chromium; physical iPhone Safari remains a separate visual check.

## Deploy elsewhere

For Vercel, import this repository with the root directory left at the repository root. The included `vercel.json` sets the output directory to `dist`; no build command is required.

Publish `dist/` as the web root on a static host. URLs such as `/assets/`, `/gallery/`, and `/contact/` are root-relative. A host mounted at a subdirectory, such as a default GitHub Pages project URL, needs corresponding URL changes or a custom domain served at the root.

Uploading this repository does not enable GitHub Pages or change the existing live site. The `.openai/hosting.json` file is only needed for the existing ChatGPT Sites deployment and is not required by other static hosts.

## Export identity

The website files and assets match the approved source snapshot `a7292ae159588df88e8b3032480fc8b4be8083eb`. This repository starts from that current snapshot. The original development history is not included.

BYJH branding and supplied photographs and videos are included as website assets. No third-party media licence is granted by this export.
