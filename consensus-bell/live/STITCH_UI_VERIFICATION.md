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

Echo requests and acceptance are real backend records. Chat currently provides an explicitly unsent in-memory draft; message delivery is not connected. Witness material/style/engraving are local appearance preferences; there is no physical order fulfillment or new Witness mint transaction. Bell suggestions use the backend's structured template provider, not an unconfigured LLM. Existing Ring SBT and real wallet/AA backend remain separate from those previews. BOT Mainnet deployment and real mobile-wallet-device testing are not certified by this UI delivery.

## Build and run

From `live/`: `npm install`, `npm run setup:privy`, `npm run build`, then `npm start`. Keep real configuration in untracked `.env`; never publish secrets, private keys, user databases or browser sessions. `/?preview=1#journey-index` exposes the complete visitor journey. Remote use requires the correct HTTPS origin and Privy configuration.

## ZIP export refinement

The later supplied Stitch ZIP contains 19 valid HTML screens, eight valid PNG screenshots, ten screenshot files containing only `<FIFE Image failed to fetch>`, and one complete design specification. HTML was read as design reference; browser-extension CSS, CDN dependencies, fake profiles, ZK claims, sample balances, immutable Echo proofs and mock-success scripts were not copied into the application.

The export now drives the jewelry gateway medallion, path category labels and image scale, Echo profile quote and reasons, Story month/date cards and local search, numbered Vow cards with actual confirmed/pending filters, real Ring contribution summary, and supported radar filter panel. Desktop Witness artwork uses containment to preserve the entire ring. New search/filter controls only operate on already-authorized data and never issue transaction or profile writes. The unavailable Google jewelry URL returned sign-in HTML; the existing licensed local ring artwork is retained.
