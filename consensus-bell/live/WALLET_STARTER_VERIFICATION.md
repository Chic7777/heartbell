# Wallet Starter verification · 2026-10-07

Final npm test: exit0, 50 passed, 0 failed/skipped, 41523ms. Final forge test --root contracts -q: exit0; testnet-only deploy script compiled.

Independent lazycodex-gate-reviewer lane APPROVE, 8/8 targeted tests independently reproduced. Report: ../.omo/evidence/wallet-starter-review.md. Exact reviewed hashes matched while recording; no commit context claimed.

Official BOT Testnet read-only check: chain968 and matching Bundler, supported EntryPoint, deployed Factory, SDK/account factory prediction equal 0x8a98b15f5470e9eE12071eF5F7A3f823Df7be07f. No transactions submitted. Runtime artifact: ../.omo/evidence/bot-testnet-compatibility.json.

Real local HTTP/EntryPoint: sponsored and self-funded eight-operation lifecycles, both SDK signers, user-specific ownership, chain/hash rejection, Alice third invitation fails, Vow bilateral confirmation, Bond deposit, archive and withdrawal. Privy-compatible session uses a local isolated ES256 issuer fixture; this does not claim actual Privy cloud authentication. Public PEM escaped newlines and normal thirty-minute-old valid token supported.

Observed SDK pitfall before fix: direct WalletClient Owner conversion selected first eth_requestAccounts address for Bob in a multi-account Provider, yielding 'SDK account differs from the configured Factory prediction'. Explicit toAccount signer wrapping the chosen Owner makes both accounts derive/execute correctly; the real two-user test locks this boundary.

Source fingerprints:

```text
live/wallet-adapter.mjs: b177e794634abb1862b9cb897d1c5bf685fd0dccf39947a673f6df723f66aa0c
live/auth-provider.mjs: 88f3b5c523ef16e60c166a705e6c20fc39d2d47ea17ddd7dbdf25c2a3af0cd1a
live/bot-network.mjs: c6c50a3249965b95b339008c797f1e05bbd99c5fd6fe75391ad58d878589854e
live/network-check.mjs: 04e80bb35e62edb2fca9fe81dfa6bbf3fa9d2cb34e76889609cddfff5daf1ac8
live/server.mjs: aa9d4fbdeb01ea2f023b80d6bebccf050e2f75e47f271694863fd34476a093d3
live/aa-e2e.test.mjs: f0233fd0600cb3ce00e539b5aed0db0e63712107f80e8f24366c1c7af2ad9d12
contracts/script/DeployTestnet.s.sol: 70dd31b6bf36711f525685f63efa72f7d1eb175e296614d5c6ee108157cd49ce
```

Actual Privy cloud App ID/public verification key, frontend login wiring, test-BOT funding and public-chain transactions remain external integration. Existing default677 preserved; explicit testnet profile/check command select968.
