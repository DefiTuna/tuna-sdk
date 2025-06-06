# DefiTuna SDK

## Overview

This package provides developers with high-level functionalities for interacting with the DefiTuna Program on Solana.

## Key Features

- **TunaApiClient**: The package includes a client for DefiTuna's public API. This allows to fetch the latest data from DefiTuna's on-chain program in a fast and efficient way without using Solana's RPC.

## Installation

```bash
# NPM
npm install @crypticdot/defituna-api
# Yarn
yarn add @crypticdot/defituna-api
# PNPM
pnpm add @crypticdot/defituna-api
```

## Usage

Here are some basic examples of how to use the package.

## Initializing the API client

```tsx
import { TunaApiClient } from "@crypticdot/defituna-api";

export const ApiClient = new TunaApiClient("https://api.defituna.com/api");
```

## Fetching user's positions

```tsx
const userTunaPositions = await ApiClient.getUserTunaPositions("CYCf8sBj4zLZheRovh37rWLe7pK8Yn5G7nb4SeBmgfMG");
```
