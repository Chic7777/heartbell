# BOT Chain Mainnet deployment · verified 2026-10-08

Track-2 mainnet integration for the Consensus Bell (Heartbell) contract.
All values below are the deployment-verification materials; the deployer
key is intentionally NOT recorded here (it lives only in the operator's
local `.env` / wallet, which is gitignored).

## Network

- Chain ID: **677** (`eth_chainId` → 0x2a5, verified live)
- RPC: https://rpc.botchain.ai (gas price observed 20 gwei)
- Explorer: https://scan.botchain.ai
- Symbol: BOT

## Contract

- Source: `contracts/src/ConsensusBell.sol` (auto-deploys its own `RingSBT`)
- Compiler: solc **0.8.24**, optimizer 200 runs (Foundry `foundry.toml` —
  the new version's requirement; supersedes the legacy 0.8.37 note)
- Constructor: **no arguments** — the new version has no admin/writer key
  ("No oracles, no admin key, no upgradeability"); it differs from the
  legacy `initialAdmin/initialWriter` registry pattern.

## Deployment

- Contract address: **0x18d7B2Dd3202Dc9507f414508516E2A669Df8008**
- Deployment tx: 0x4c19fad65ae09bee75f94a2f7d2cc6d88346b3e5d76fb54f33d38a68708f77ad
- Status: success (status=1) at block 25915551, deployer
  0x4844F22482B0e08dc9b44d153a723863F576b178
- Runtime code: 8808 bytes on-chain
- `relationCount()` = 0 (fresh)
- `ringSBT()` = 0x9461634342a2D9e2af409bb3776FeDCB96FDD7b9 (immutable pair)

## Core-write smoke test (application ABI path)

Called through the app's own `chain.mjs` ABI — proving call code and
receipt verification match the deployed bytecode:

- `createInvitation(0xAE9c8b1e…)` → tx
  0x6bfc3e3714d124cfa7…, status 1, block 25915665, gasUsed 98455
- `pendingInviter(invitee)` == deployer ✓
- `invitationExpiresAt(invitee)` registered ✓ (expires in 24h by design)

## App wiring (local `.env`, gitignored)

- `BOT_CHAIN_ID=677`
- `BOT_RPC_URL=https://rpc.botchain.ai`
- `BOT_EXPLORER_URL=https://scan.botchain.ai`
- `CONSENSUS_BELL_ADDRESS=0x18d7B2Dd3202Dc9507f414508516E2A669Df8008`
- `BOT_BUNDLER_URL=https://bundler.botchain.ai/rpc/`
- The legacy Next.js variable names (`APP_MODE`, `CHAIN_MODE`,
  `NEXT_PUBLIC_COMMITMENT_REGISTRY_ADDRESS`) belong to the old
  prototype; this app's equivalents are the four lines above.
- `APP_MODE=demo` is not used here; on-chain actions always cost real
  mainnet BOT — nothing is simulated.

## Verified behaviour

- `/api/config` reports chainId 677, the deployed address and
  `chainConfigured: true`
- `/api/ring` performs a real mainnet `relationOf` read (returns NONE for
  fresh accounts)
- Full test suite 75/75 green (chain close-loop tests run on local Anvil
  with the same ABI)
