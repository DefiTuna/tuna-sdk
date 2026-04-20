import { Account, Address, generateKeyPairSigner } from "@solana/kit";
import { fetchMint, Mint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createVaultInstructions,
  createVaultPermissionlessInstructions,
  DEFAULT_ADDRESS,
  fetchVault,
  getLendingVaultAddress,
  TUNA_ERROR__INVALID_INSTRUCTION_ARGUMENTS,
  UNLIMITED_SUPPLY_LIMIT,
  updateVaultInstruction,
} from "../src";

import { TUNA_ADMIN_KEYPAIR } from "./helpers/addresses.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { setupMint } from "./helpers/token.ts";

describe("Tuna Vault", () => {
  let mint: Account<Mint>;
  let marketAddress: Address;
  let defaultVaultAddress: Address;
  let isolatedVaultAddress: Address;

  beforeAll(async () => {
    const mintAddress = await setupMint();
    mint = await fetchMint(rpc, mintAddress);
    marketAddress = (await generateKeyPairSigner()).address;
    defaultVaultAddress = (await getLendingVaultAddress(mint.address))[0];
    isolatedVaultAddress = (await getLendingVaultAddress(mint.address, marketAddress))[0];
  });

  it("Create vault", async () => {
    const pythOracleFeedId = (await generateKeyPairSigner()).address;
    const oraclePriceUpdate = (await generateKeyPairSigner()).address;
    const interestRate = 3655890108n;
    const supplyLimit = 1000000n;

    const instructions = await createVaultInstructions(TUNA_ADMIN_KEYPAIR, mint, {
      pythOracleFeedId,
      oraclePriceUpdate,
      interestRate,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
    });
    await sendTransaction(instructions);

    const vault = await fetchVault(rpc, defaultVaultAddress);
    expect(vault.data.mint).toEqual(mint.address);
    expect(vault.data.authority).toEqual(DEFAULT_ADDRESS);
    expect(vault.data.market).toEqual(DEFAULT_ADDRESS);
    expect(vault.data.pythOracleFeedId).toEqual(pythOracleFeedId);
    expect(vault.data.oraclePriceUpdate).toEqual(oraclePriceUpdate);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    expect(vault.data.borrowedFunds).toEqual(0n);
    expect(vault.data.borrowedShares).toEqual(0n);
    expect(vault.data.interestRate).toEqual(interestRate);
    expect(vault.data.supplyLimit).toEqual(supplyLimit);
    expect(vault.data.lastUpdateTimestamp).to.be.greaterThan(0);
  });

  it("Update vault", async () => {
    const pythOracleFeedId = (await generateKeyPairSigner()).address;
    const oraclePriceUpdate = (await generateKeyPairSigner()).address;
    const interestRate = 3155890108n;
    const supplyLimit = 12341342344n;

    const ix = await updateVaultInstruction(TUNA_ADMIN_KEYPAIR, defaultVaultAddress, {
      pythOracleFeedId,
      oraclePriceUpdate,
      interestRate,
      supplyLimit,
    });
    await sendTransaction([ix]);

    const vault = await fetchVault(rpc, defaultVaultAddress);
    expect(vault.data.version).toEqual(1);
    expect(vault.data.pythOracleFeedId).toEqual(pythOracleFeedId);
    expect(vault.data.oraclePriceUpdate).toEqual(oraclePriceUpdate);
    expect(vault.data.interestRate).toEqual(interestRate);
    expect(vault.data.supplyLimit).toEqual(supplyLimit);
  });

  it("Cannot update vaults if not admin authority", async () => {
    const ix = await updateVaultInstruction(signer, defaultVaultAddress, {
      pythOracleFeedId: (await generateKeyPairSigner()).address,
      oraclePriceUpdate: (await generateKeyPairSigner()).address,
      interestRate: 32478798n,
      supplyLimit: 12341342344n,
    });
    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7dc");
      return true;
    });
  });

  it("Can't create a permissionless vault with zero market address", async () => {
    const vaultAddress = (await getLendingVaultAddress(mint.address, DEFAULT_ADDRESS))[0];

    const instructions = await createVaultPermissionlessInstructions(signer, vaultAddress, mint, {
      market: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
    });
    await assert.rejects(sendTransaction(instructions), err => {
      expect((err as Error).toString()).contain(
        `custom program error: ${"0x" + TUNA_ERROR__INVALID_INSTRUCTION_ARGUMENTS.toString(16)}`,
      );
      return true;
    });
  });

  it("Create permissionless vault", async () => {
    const interestRate = 3655890108n;

    const instructions = await createVaultPermissionlessInstructions(signer, isolatedVaultAddress, mint, {
      market: marketAddress,
      interestRate,
    });
    await sendTransaction(instructions);

    const vault = await fetchVault(rpc, isolatedVaultAddress);
    expect(vault.data.mint).toEqual(mint.address);
    expect(vault.data.authority).toEqual(signer.address);
    expect(vault.data.market).toEqual(marketAddress);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    expect(vault.data.borrowedFunds).toEqual(0n);
    expect(vault.data.borrowedShares).toEqual(0n);
    expect(vault.data.interestRate).toEqual(interestRate);
    expect(vault.data.supplyLimit).toEqual(UNLIMITED_SUPPLY_LIMIT);
    expect(vault.data.lastUpdateTimestamp).to.be.greaterThan(0);
  });
}, 20000);
