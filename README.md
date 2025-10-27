# DefiTuna SDK

DefiTuna is an advanced liquidity providing program on the Solana blockchain. This DefiTuna Client SDK allows
developers to interact with the DefiTuna program on Solana, enabling the creation and management of
markets and positions.

## Building

Install
- Solana 2.3.11
- Anchor 0.32.1

```
curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash
agave-install init 2.3.11
```

Run
```
pnpm i
pnpm build
````

## Running tests
```
pnpm test
```