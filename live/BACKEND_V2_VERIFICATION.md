# Backend v2 verification · 2026-10-07

Final npm test: exit 0, 43 tests passed, zero failures/skips, 41319 ms. Existing journey tests were included without changing their code.

Final forge test -q: exit 0; preceding verbose full result 20/20. forge build: successful; compiler/lint warnings remain, including the existing unused _release argument.

All backend .mjs syntax checks succeeded. Actual HTTP tests exercise real signed sessions, encrypted AES ciphertext readback, Echo consent/blocking, Agent scope/revocation, SSE and isolation. AA E2E deploys actual local EntryPoint, Factory, Bell and Paymaster and executes eight signed UserOperations: invitation/account deployment, acceptance/two RingSBT, Vow proposal, Vow confirmation, deposit, end request, end confirmation, withdrawal. Receipt/event/block verification and archived balances/SBT persistence passed. Bundler Gas estimates are a conservative test adapter; this is not BOT mainnet evidence.

PostgreSQL migration was independently executed in PGlite: 26 tables, 25 RLS-protected business tables. Schema-worker verified 15 actual constraints/access checks. Runtime remains SQLite.

Late regression: idle legacy-chain app unnecessarily called the BOT Bundler from runPoll.ready and app.close propagated that rejection. Original full run failed chain.test after 39974ms and timed out at 60000ms. Fixed by checking pending work before readiness and completing close cleanup after a logged poll error. Both dedicated regressions pass, as does the original real-chain HTTP case in the final full run. No debugger/instrumentation or env overrides retained. Known failed-test node10028/anvil79700 were individually verified and stopped; no user service was stopped.

Independent lane lazycodex-gate-reviewer: APPROVE after final regression reread and 17/17 AA reproduction. Report: ../.omo/evidence/backend-v2-gate-review.md. Reviewed AA source fingerprints matched at recording time; no commit context was created or claimed.

Deployment boundaries: actual OIDC/embedded-wallet SDK configuration, new contract deployment, funded/staked Paymaster and actual BOT Bundler compatibility remain external integration; no public transaction broadcast. PostgreSQL runtime migration, deep confirmed reorg rollback, Witness/fulfillment and frontend AA switching remain documented follow-up work.

Source SHA-256:

```text
live/server.mjs: d52fdfa86c4a1403767efd27816009ea58fbe1374e9ba10afe33c6517fe52860
live/auth-provider.mjs: 001537394318aea2f12a382bc1220118fa6a27ac044647bfc608c9b4ddefd833
live/v2-router.mjs: de9852b13a42429eabeef5d5e2ba837be26345d4a4937b0f81b825b6df175ff4
live/sponsor.mjs: 9a35d0ced06ff4c83d4f771304b7d8062c2b2ba4c5ed759a5d8bc25b556238bc
live/aa.mjs: 54989a6a1019cdb62fd1b4aa5576a8c9577a6dfb291b7e2b25fe9056bbfaba46
live/aa-protocol.mjs: 8ec41588ec8784bbfe5becbd717cfc33d2d118d38827a03865bf8224ff4dc473
live/aa-receipts.mjs: 5a4b307846239f1f4fb02e58f9fddcd4f28708f3f5f2f8a2ed5ac119f5e93f33
live/aa.test.mjs: 25138add8e84bc3b81f56ea6fbe4e9fc2c007da5b87b0a0fb7a54ef9f09ac949
live/domain-v2.mjs: 3f26e31a40aaf759c86a2728a5bd5ff3f69baf47dbe7e7c0c456137cf3c77c0b
live/vault-v2.mjs: 9d9bcec4b3dee1b985888b23a0f5d39e84f5a22269f54f0acaaf90d8b2506d43
contracts/src/ConsensusBell.sol: c7c9f9139425a3b28cae79ebaebf2318532606ce926c9d47fda536dec635219f
contracts/src/RingSBT.sol: 13000435008cfb720d96c5cb5829926dd3ee2be378d7a83e8ccc36d920c05318
contracts/src/BellPaymaster.sol: 35a0a62e5f04b917c0037df0ace9454b4b89edd094649ab11e20f559a0dfef96
```
