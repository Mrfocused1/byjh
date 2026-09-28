# BYJH private office

The website now includes a local, persistent CRM and CMS. The original public pages and motion design are retained.

## Start locally

Run `python3 server.py` from this folder, or double-click **Start BYJH.command**. Requires Python 3.9 or later with OpenSSL/scrypt support; no packages or build step are needed. The launcher detects a compatible Python build (including Homebrew Python). Set `BYJH_PYTHON` if you need a particular interpreter. The server listens only on `127.0.0.1:8080`. Use `python3 server.py --port 8081` if another application is using that port.

- Website: http://127.0.0.1:8080/
- Admin: http://127.0.0.1:8080/admin/
- Member login: http://127.0.0.1:8080/members/login/
- Partner login: http://127.0.0.1:8080/partners/login/

The first admin visit asks you to create the owner account. There are no default credentials. The first account locks the setup endpoint. Choose a password of at least 12 characters and retain it securely. An email-based password recovery service is not connected.

## What works

- **CRM:** an Applications inbox across both account types, separate member and partner directories, text search, status filters, CSV export, editable profiles, application messages and private team notes. Approve, decline or suspend accounts.
- **Applications:** pinned buttons on the Members and Partners pages open accessible modal forms. Applicants create a password and receive a pending account. No application or private profile is automatically published on the public website.
- **Accounts:** separate member and partner login pages, profile and business detail editing, password changes, application status and private concierge requests. Approved accounts can send requests; other statuses can update profiles and view existing conversations. Admin replies appear inside the account.
- **CMS:** editable public-page copy, page titles, descriptions, image alternative text, accessibility labels, gallery captions, chapter labels, fleet specifications and category headings. Six shared-copy sections edit application/login copy, pinned buttons, intro/media controls, workspace navigation, CRM labels, member/partner account states, public interactions, validation, API errors, notifications and activity wording. Per-page drafts, authenticated previews, publishing, discarding drafts and stale-write protection. The public member showcase and partner logo list remain editorial content, separate from private CRM accounts.
- **Media:** original assets and uploads in one library. Replace images, logos, fleet imagery, gallery videos and intro films across the site; restore the original when needed. Accepts JPG, PNG, GIF, WebP, MP4 and WebM, up to 50 MB. Uploaded SVG is intentionally unsupported. Replace videos with the same format. Original SVG logos can be replaced by raster images. An original already serving as another asset’s replacement must be restored first or replaced using a separately uploaded file; chained replacements are rejected. Video requests support byte ranges for seeking.
- **Analytics:** recorded page views, daily charts, top pages, devices, referring domains and application counts over 7, 30 or 90 days. Admin and draft-preview visits are excluded. No invented numbers or unique visitor claims. Dates use UTC. Referrers store only the hostname, not URLs or query strings.
- **Security:** server-side role checks, scrypt password hashes, HTTP-only SameSite session cookies, 12-hour sessions, origin and custom-header checks on writes, limited login/application attempts, escaped CMS text and validated media types. Sessions and CRM data are stored outside the public web root. No credentials are committed.

## Data and backups

`data/byjh.sqlite3` stores accounts, sessions, application details, drafts, published changes, asset mappings, analytics, activity and requests. `data/uploads/` stores uploaded files. Both are excluded from Git. Stop the server before copying the complete `data/` directory for a simple consistent backup. Do not commit or publish this directory.

Original files remain in `dist/`; CMS changes are applied by `server.py` when pages are served. Publishing a page updates this local website only. A static-only server or static deployment cannot run the CRM or apply database content.

## Scope of this local version

This implementation runs on your computer. It does not deploy a public service, send email, verify email ownership, enable password-reset email, or connect an external analytics provider. The existing Contact page still uses its email-app enquiry flow. The existing Vercel/Sites static hosting configuration does not deploy the Python backend. A public launch needs an approved backend hosting target with persistent storage, HTTPS, managed backups, email delivery/recovery and an agreed owner-access process. Keep the loopback binding until that deployment work is completed.

## Verification

```sh
python3 -m unittest discover -s tests -p '*_test.py' -v
node --test tests/*.test.cjs
```

The Python suite uses a temporary database and a local ephemeral port. It checks permission boundaries, application validation, draft/publish isolation, escaping, stale edits, media validation and restoration, approval/request workflows, private notes, session behavior, analytics and video ranges.

`tests/workspace-browser.cjs` uses Playwright and Google Chrome with a temporary database. Set `NODE_PATH` to your Playwright installation if needed, then run `node tests/workspace-browser.cjs`. Override the Chrome path with `CHROME`. It tests owner setup, mobile application dialogs, member approval and login, concierge replies, partner profile persistence, publishing, uploads and responsive layouts. All QA accounts use `example.invalid`; no email is sent.

## Design references

- Attio: https://attio.com/help/reference/attio-101/introduction-to-navigating-attio — sidebar navigation and record-oriented workspace.
- Sanity: https://www.sanity.io/docs/visual-editing — content preview and editing workflow.
- Plausible: https://plausible.io/ — focused analytics presentation.

These informed the layout and workflow; the implementation is bespoke and does not connect to those services.

## Audit regressions (26 September 2026)

`tests/gap_test.py` covers passwords containing leading/trailing spaces, partial profile writes, CMS legacy-field compatibility and complete entity phrases, safe attribute edits, gallery/chapter copy, media chains, HEAD host restrictions and shared-copy draft/publish isolation. `tests/cms-legacy-fields.json` records the original field IDs for compatibility checks; it contains public template text only.

`tests/deep-browser.cjs` exercises delayed saves and reads, discard locking, profile/password preservation, role-aware expired-session redirects, keyboard media upload, mobile sidebar focus, application aliases, form preservation, anonymous analytics, pause controls, responsive layouts, and shared-copy preview/publishing.

`tests/public-browser.cjs` visits all five public pages at 320, 768 and 1440px, checks local image loads and browser errors, exercises fleet/gallery/navigation dialogs, reviews an enquiry without sending it, and checks keyboard fleet controls, reduced motion and the mobile intro. `tests/workspace-browser.cjs` verifies the complete admin/member/partner workflow.

The three Playwright scripts create and remove isolated temporary databases. They use local ports 8189, 8190 and 8191 respectively. Test addresses end in `example.invalid` and no email is sent. Use an installed `playwright` module via `NODE_PATH`; Chrome and Python executable paths can be overridden with `CHROME` and `PYTHON`.

These checks run in desktop Chrome with emulated viewport sizes. They do not replace real iOS/Android device testing, Safari/Firefox verification, load testing or a production security assessment. Existing `homepage-browser.cjs` and `intro-browser.cjs` additionally require `puppeteer-core`; the Playwright public audit covers functional equivalents, without the original compositor instrumentation.


## Edit interface and system wording

Open **Admin → Website content**. Existing public pages remain in the page picker; six additional groups contain the site-controlled interface wording:

| Group | What it edits |
| --- | --- |
| Forms & access | Application and login pages, pinned application buttons and shared access/intro controls |
| Navigation & controls | Shared navigation, buttons, status/role/option labels, validation, connection errors and preview/editor controls |
| Admin workspace | CRM screens, analytics, media library, CMS, search, tables, empty states, confirmations and save/upload feedback |
| Member & partner accounts | Welcome text, each application status, profile/password forms and concierge request screens |
| Public interactions | Dynamic gallery/media controls, enquiry review/copy feedback and other public interaction wording |
| System messages | Server validation and permission messages, activity templates, content-section titles, loading and access-page titles |

Select a group, use **Find text or a section**, edit, then **Save draft → Preview saved draft → Publish page**. Refresh an open page to load published wording. Preview uses all saved copy drafts for the current administrator only; everyone else receives published copy. **Reset to default** restores a field in the current editor; save and publish that reset to make it live. **Discard draft** restores the last published values.

Keep the named placeholders shown below a field, such as `{name}`, `{status}` or `{value1}`. They insert the live details and can be moved within a sentence. The CMS rejects missing, renamed or malformed placeholders. Text is treated as plain text, never HTML. Editing a status, role or option label changes its display; stored values and permissions remain unchanged.

The account-group preview uses a synthetic member or partner and lets you inspect pending, active, declined and suspended states. It contains no real profile data and cannot submit changes. Other draft previews also reject mutations. Activity templates apply to structured new events; recognized historical system events are formatted with the current copy while unrecognized historical text is retained.

The editor controls authored site wording. Personal profile details, filenames and messages are CRM data. Native browser/operating-system controls (file-picker buttons, built-in video menus and dialog chrome), calendar date formatting and technical identifiers are not CMS content. This is copy editing, not a translation engine or page-layout builder.

`tests/copy_test.py` adds coverage for copy publication isolation, placeholder validation, access-page titles, error escaping, preview authorization/mutation blocking, stable role/status values and structured activity. `tests/copy-browser.cjs` uses an isolated temporary database on port 8192 to exercise real draft editing, account preview, publish/reset, and HTML-like text across all six groups and the relevant screens. It also checks editable connection/response errors. Run it like the other Playwright scripts; it sends no email.
