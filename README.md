# DefiTuna SDK

DefiTuna is an advanced liquidity providing program on the Solana blockchain. This DefiTuna Client SDK allows
developers to interact with the DefiTuna program on Solana, enabling the creation and management of
markets and positions.

## Packages

The Rust crates are published under the new SDK-specific names (replacing `defituna-client` and `defituna-core`):

- [`defituna-sdk-client`](https://crates.io/crates/defituna-sdk-client)
- [`defituna-sdk-core`](https://crates.io/crates/defituna-sdk-core)

Install the Rust client with:

```bash
cargo add defituna-sdk-client
```

The TypeScript packages remain [`@crypticdot/defituna-client`](https://www.npmjs.com/package/@crypticdot/defituna-client) and [`@crypticdot/defituna-core`](https://www.npmjs.com/package/@crypticdot/defituna-core).

## Building

Install
- Solana 2.3.13
- Anchor 0.32.1

```bash
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
agave-install init 2.3.13
avm install 0.32.1
```

Run
```bash
pnpm i
pnpm build
```

## Running tests
```bash
pnpm test
```
