# Original Stitch pages: removed; the live app is the only surface

On 2026-10-07 (late) the user ordered removal of the 19-page original-design browser once the live app fully covered it. That condition is met: every screen the original export represented exists as a live route running on the real backend (wallet-signature/Privy sessions, SQLite profiles, client-encrypted memories, verified contract receipts, real Echo connections and encrypted chat). The source pages (`live/stitch-source/`), the compiled browser (`live/web/stitch/`), their build pipelines (`build-stitch.mjs`, `build-stitch-app.mjs`), the MCP fetch tool (`stitch-fetch.mjs`) and the `/stitch/` route with its CSP exceptions were deleted; Tailwind/json5 devDependencies left with them. `/stitch/` now returns 404. This document is the requirement-by-requirement coverage analysis proving nothing functional was lost, and the honest record of what remains open.

## Screen-to-live coverage matrix

| Original screen | Live route | Real content source | State |
|---|---|---|---|
| 01 Forever Gateway | logged-out gateway (chrome hidden) | brand mark asset; Begin Journey opens the real login modal (Privy email or EIP-191 wallet signature) | done |
| 02 About You | `#identity` step 1 | PUT `/api/profile` per wallet, zod-validated | done |
| 03 Your Interests | `#identity` step 2 (image tiles) | profile interests, max 8 | done |
| 04 Your Intention | `#identity` step 3 | profile intention | done |
| 04b Love Statement + visibility | `#identity` step 4 | profile statement + discoverable consent | done |
| 05 Choose Path | `#path` | two real paths: Radar / Direct Bind | done |
| 06 Resonance Radar scan | `#discover` | `searchRadar` over opted-in real profiles; satellites are real initials | done |
| 06b Audience filter | radar filter panel | city / intention / radius / self-reported gender / age range, server-filtered | done |
| 07 Echo results | `#echo-results` | real candidates, saved state via `/api/radar/saved` | done |
| 08 Resonance detail | `#echo-detail` | real profile + rule-based reasons; Connect is a real connection record | done |
| 08b Match struck | Match Struck modal | raised only by a real acceptance event | done |
| 09 Echo chat | `#echo-chat` | end-to-end encrypted messages (P-256 ECDH + AES-256-GCM), server stores ciphertext, SSE push + poll | done |
| 09b Ephemeral room | ephemeral toggle in chat | server-enforced 24h deletion, burn notice both sides | done |
| 10 Direct bind | `#direct-bind` | real smart-account/wallet address核对, then the on-chain invitation flow | done |
| 13 Accept & sign | `#invitation-preview` / `#waiting` / accept modal | real chain invitation (pendingInviter/expiry), wallet or AA signature | done |
| 14 Ring ceremony | `#ceremony` | rendered from the verified on-chain snapshot; without a Ring it says so honestly | done |
| 16 Our Story | `#story` | client-encrypted memories (note/photo/video ≤1MB), date-grouped editorial view, filters, search | done |
| 17 Our Vows | `#vows` | encrypted body + `proposePrivateVow(contentHash)`, counterpart `confirmVow`; numbered cards, real pending/confirmed filters | done |
| 18 Our Bond | `#bond` | real contract balances, deposit/withdraw, encrypted off-chain goal plans (no fake per-goal funding) | done |
| 22 Me settings | `#me`, `#privacy`, `#relationship-settings`, `#archived`, `#proofs`, `#history`, `#vault`, `#witness*` | wallet/smart-account details, privacy consent, real proofs from verified receipts, vault counts of real records, witness as labeled local preference | done |

Lifecycle enforcement wraps all of the above: before an ACTIVE Ring the couple navigation does not exist and Phase-B deep links redirect to the path screen; the Ring/Story/Vow/Bond/Me navigation appears only for ACTIVE/ENDING/ARCHIVED relations (DESIGN.md §15).

## Still open (unchanged by the removal)

- A real ACTIVE Ring requires two funded wallets signing on BOT Chain (968); ceremony/Story/Vow/Bond under an on-chain ring remain exercised by tests and preview but not by a gas-spent end-to-end run.
- Witness minting / physical fulfillment, per-goal bond accounting, cross-device key recovery, mobile wallet wallets, and Lighthouse/mobile-device certification remain unplugged, exactly as before.
- The ring visual uses the licensed photo asset with CSS state classes; the spec's per-state Möbius geometry (open arc → half rings → full ring → matte) needs a dedicated vector asset set.
