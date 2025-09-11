import { Account, Address, generateKeyPairSigner } from "@solana/kit";
import { fetchMint, Mint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import { createVaultInstructions, fetchVault, getLendingVaultAddress, updateVaultInstruction } from "../src";

import { TUNA_ADMIN_KEYPAIR } from "./helpers/addresses.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { setupMint } from "./helpers/token.ts";

describe("Tuna Vault", () => {
  let mint: Account<Mint>;
  let vaultAddress: Address;

  beforeAll(async () => {
    const mintAddress = await setupMint();
    mint = await fetchMint(rpc, mintAddress);
    vaultAddress = (await getLendingVaultAddress(mintAddress))[0];
  });

  it("Create vault", async () => {
    const pythOracleFeedId = (await generateKeyPairSigner()).address;
    const pythOraclePriceUpdate = (await generateKeyPairSigner()).address;
    const interestRate = 3655890108n;
    const supplyLimit = 1000000n;

    const instructions = await createVaultInstructions(TUNA_ADMIN_KEYPAIR, mint, {
      pythOracleFeedId,
      pythOraclePriceUpdate,
      interestRate,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
    });
    await sendTransaction(instructions);

    const vault = await fetchVault(rpc, vaultAddress);
    expect(vault.data.mint).toEqual(mint.address);
    expect(vault.data.pythOracleFeedId).toEqual(pythOracleFeedId);
    expect(vault.data.pythOraclePriceUpdate).toEqual(pythOraclePriceUpdate);
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
    const pythOraclePriceUpdate = (await generateKeyPairSigner()).address;
    const interestRate = 32478798n;
    const supplyLimit = 12341342344n;

    const ix = await updateVaultInstruction(TUNA_ADMIN_KEYPAIR, mint.address, {
      pythOracleFeedId,
      pythOraclePriceUpdate,
      interestRate,
      supplyLimit,
    });
    await sendTransaction([ix]);

    const vault = await fetchVault(rpc, vaultAddress);
    expect(vault.data.version).toEqual(1);
    expect(vault.data.pythOracleFeedId).toEqual(pythOracleFeedId);
    expect(vault.data.pythOraclePriceUpdate).toEqual(pythOraclePriceUpdate);
    expect(vault.data.interestRate).toEqual(interestRate);
    expect(vault.data.supplyLimit).toEqual(supplyLimit);
  });

  it("Cannot update vaults if not admin authority", async () => {
    const ix = await updateVaultInstruction(signer, mint.address, {
      pythOracleFeedId: (await generateKeyPairSigner()).address,
      pythOraclePriceUpdate: (await generateKeyPairSigner()).address,
      interestRate: 32478798n,
      supplyLimit: 12341342344n,
    });
    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });
});
