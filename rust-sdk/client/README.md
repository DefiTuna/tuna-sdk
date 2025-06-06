# DefiTuna Client

> ⚠️ **WARNING:** DefiTuna Client version 2.0 is not fully compatible with the mainnet onchain program.
> FusionAMM pools are not yet supported. Use Orca pools.

## Overview
This package provides developers with low-level functionalities for interacting with the DefiTuna Program on Solana.

## Key Features
- **Codama Client**: The package includes a set of generated client code based on the DefiTuna Program IDL. This ensures all the necessary program information is easily accessible in a structured format and handles all decoding and encoding of instructions and account data, making it much easier to interact with the program.
- **PDA (Program Derived Addresses) Utilities**: This feature contains utility functions that help derive Program Derived Addresses (PDAs) for accounts within the DefiTuna Program, simplifying address generation for developers.

## Installation
```bash
# Cargo
cargo add defituna-client
```
