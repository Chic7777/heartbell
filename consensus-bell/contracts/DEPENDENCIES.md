# Pinned contract dependencies

- eth-infinitism/account-abstraction v0.7.0, commit `7af70c8993a6f42973f520ae0752386a5032abe7`, GPL-3.0 source headers. https://github.com/eth-infinitism/account-abstraction/tree/v0.7.0
- OpenZeppelin/openzeppelin-contracts v5.0.2, commit `dbb6104ce834628e473d2173bbc9d47f81a9eec3`, MIT (LICENSE retained in the vendored directory). https://github.com/OpenZeppelin/openzeppelin-contracts/tree/v5.0.2

Foundry auto-remappings resolve both libraries from `lib/`. BellPaymaster extends the v0.7 BasePaymaster; its EntryPoint constructor checks the official ERC165 interface. Deploy against an independently verified v0.7 EntryPoint. These source dependencies and passing local tests do not claim a public chain deployment or a security audit of the application contracts.

Sponsor vouchers use EIP-191 signatures over `getSponsorHash`. The complete operation fields and the first 52 paymaster bytes are signed; the account signature and sponsor signature are omitted to avoid circular hashes. EntryPoint checks the account nonce and the encoded validity interval. Off-chain policy must authorize the exact calldata before signing, reserve sponsor budgets, and submit only through that EntryPoint. This contract never grants the backend access to user signing keys.
