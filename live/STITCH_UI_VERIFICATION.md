# Stitch UI delivery · 2026-10-07

The UI now implements the 24-screen Consensus Bell prototype as responsive, live DOM components. The source is the user-provided overview and the actual design-system document read from Stitch MCP project `9125579042035566424`. Stitch itself was not modified. Some exported HTML/screenshot URLs redirect to Google Accounts; those responses were not used as frontend code or images. This is a functional adaptation of the prototype, not a claim of pixel-identical reproduction of every static mockup.

## Delivered interface

Four-step identity, path selection, direct wallet binding, real radar results/detail, Echo connection inbox, chat draft layout, invitation review/waiting/acceptance, receipt-gated ceremony, Our Ring, Story, Vows, Bond, Witness, Witness configurator, Vault, Me, privacy, relationship settings, archived history, proof sheet, transaction stepper, and consent-controlled editable Bell suggestions. Shared icons, avatars, settings rows and state components use the cream/blush/rose/ink/sage design system.

Real data comes from the authenticated backend. Guest browsing does not load account data or send writes. Profiles without photos use initials. Transaction success and proofs require actual verified receipts. The latest bundle loads the wallet SDK only when needed, uses local licensed fonts and optimized WebP images, and preserves the existing wallet and encryption flow.

## Verification

- Production build passes. Full regression suite: **71 passed, 0 failed**.
- Final real-browser capture: **149 screenshots**, widths **375, 768, 1280**; no script/page errors, image failures or horizontal overflow detected.
- Two isolated real EIP-191 signed HTTP sessions exercised candidate detail → connection request → recipient acceptance. The same browser run granted an exact draft scope, edited the resulting own-profile draft and revoked the consent. Database checks confirmed accepted connection and revoked grant. No real-user messages or chain transactions were submitted by this UI QA run.
- Gateway Lighthouse, three mobile and three desktop runs: median **100 performance / 100 accessibility / 100 best practices / 100 SEO** for both modes. Mobile performance range 99–100, best-practices range 96–100. These scores describe the gateway only, not all authenticated pages or third-party wallet dialogs.
- Independent final screenshot/layout and design-system review reports are held in the local task evidence folder. QA fixture captures are visibly labeled and are not production seed data.

## Service boundaries

Echo requests and acceptance are real backend records. Chat is now real delivery: after both people accept, messages are end-to-end encrypted in the browser (P-256 ECDH + AES-256-GCM), stored server-side as ciphertext envelopes only, authorized per connection participant, pushed over the authenticated SSE stream with a polling fallback, and rendered live for both sides. The Ephemeral Echo room (original screen 09b) is a server-enforced 24-hour retention policy: expired envelopes are deleted by the server and both sides see the burn deadline. Sending requires the peer to have registered an encryption key; the interface states this instead of downgrading to plaintext. Witness material/style/engraving are local appearance preferences; there is no physical order fulfillment or new Witness mint transaction. Bell suggestions use the backend's structured template provider, not an unconfigured LLM. Existing Ring SBT and real wallet/AA backend remain separate from those previews. BOT Mainnet deployment and real mobile-wallet-device testing are not certified by this UI delivery.

## Build and run

From `live/`: `npm install`, `npm run setup:privy`, `npm run build`, then `npm start`. Keep real configuration in untracked `.env`; never publish secrets, private keys, user databases or browser sessions. `/?preview=1#journey-index` exposes the complete visitor journey. Remote use requires the correct HTTPS origin and Privy configuration.

## ZIP export refinement

The later supplied Stitch ZIP contains 19 valid HTML screens, eight valid PNG screenshots, ten screenshot files containing only `<FIFE Image failed to fetch>`, and one complete design specification. HTML was read as design reference; browser-extension CSS, CDN dependencies, fake profiles, ZK claims, sample balances, immutable Echo proofs and mock-success scripts were not copied into the application.

The export now drives the jewelry gateway medallion, path category labels and image scale, Echo profile quote and reasons, Story month/date cards and local search, numbered Vow cards with actual confirmed/pending filters, real Ring contribution summary, and supported radar filter panel. Desktop Witness artwork uses containment to preserve the entire ring. New search/filter controls only operate on already-authorized data and never issue transaction or profile writes. The unavailable Google jewelry URL returned sign-in HTML; the existing licensed local ring artwork is retained.

## Design-system brand mark · 2026-10-07

The user-supplied `stitch_consensus_bell_design_system.zip` vector logo is now the product mark. The original SVG is preserved at `ui/assets/consensus-bell-logo.svg`; a small-size mark extract (bell, Mobius twin bands, diamond clapper, without the astronomical rings and wordmark) lives at `ui/assets/consensus-bell-mark.svg` and drives the app favicon and header brand.

## Original-design browser removed · 2026-10-07 (late)

With every exported screen covered by a live route on the real backend, the user ordered the 19-page original-design content removed. `live/stitch-source/`, `live/web/stitch/`, the stitch build pipelines and fetch tool, and the `/stitch/` route (including its CSP exceptions) are deleted; `/stitch/` returns 404 and the shell no longer links to it. The screen-by-screen coverage analysis proving no functional loss lives in [ORIGINAL_STITCH_STATUS.md](./ORIGINAL_STITCH_STATUS.md).

## Two-session manual QA · 2026-10-07

Real Chromium, 390×844. User A signed the real server challenge in-page with a software EIP-191 signer and completed the four-step identity form; the profile landed in SQLite verbatim. User B was a second real signed HTTP session (`qa-peer.mjs`) with its own registered P-256 key. Verified live: radar audience filter (gender 男 → honest zero results; 女 + age 25–30 → the real candidate), candidate detail, B→A connection request, in-browser acceptance with the Match Struck overlay, A→B message encrypted in the browser and decrypted by B outside the browser, B→A reply rendered in A's tab without reload (SSE), ephemeral-room message carrying an exact 86,400,000 ms server TTL that B reads with a burn deadline. Journey index exposes 06b 人群筛选 and 09b 阅后即焚空间; the original-design browser (19 pages), visitor preview stayed navigable with no console errors. Wallet transactions, mainnet and mobile wallets remain unverified by this run.

## Two-phase lifecycle QA · 2026-10-07 (late)

The UI now enforces the master-spec lifecycle: the logged-out entry is the Forever Gateway with wallet chrome hidden (Begin Journey primary, visitor browsing secondary, one faint "Secured by BOT Chain" whisper); before an ACTIVE Ring the five-tab couple navigation is not rendered and deep links to Story/Vow/Bond/Vault/Witness/Me/Privacy/Proofs/History redirect to the path screen with an explicit message; the couple navigation appears only for ACTIVE, ENDING or ARCHIVED on-chain relations. Verified in real Chromium: gateway render, Begin Journey → real signed login → four-step identity for a fresh wallet, Phase-A navigation absence for a profiled user without a Ring, and the Phase-B redirect guard. Phase-B tab rendering remains logic-verified only: producing a real ACTIVE Ring requires two funded wallets signing on BOT Chain (chainId 968, rpc.bohr.life reachable, ~3 s per read); no gas was spent and no transaction was fabricated for this QA.
