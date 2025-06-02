# DefiTuna SDK

This repo contains DefiTuna Client and Backend SDK

> ⚠️ **WARNING:** DefiTuna Client version 2.0 is not yet compatible with the mainnet onchain program.
> Please use the previous 1.0.x version.

## Quickstart

- `pnpm i`
- Create .env file using .env.example in `packages/sdk`
- `pnpm test`

## Workflow

- Make changes first
- Before commiting run `pnpm changeset` and complete steps
- Commit to a new branch and create a PR
- When pipeline succeeds - merge a PR and wait until the packages are published

## Examples

This repository offers **pre-configured examples** in TypeScript and Rust, showcasing the DefiTuna Client’s practical
use. Fully tested and ready to use, they include **detailed commentary** for easy integration into Solana projects. See
the [TypeScript](./examples/ts/README.md) and [Rust](./examples/rust/README.md) READMEs for more details.

