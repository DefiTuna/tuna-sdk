import { Account, Address } from "@solana/kit";
import { fetchMint, fetchToken, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  depositInstruction,
  depositInstructions,
  fetchLendingPosition,
  fetchVault,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getLendingVaultV2Address,
  openLendingPositionAndDepositInstructions,
  openLendingPositionInstruction,
  openLendingPositionV2Instruction,
  repayBadDebtInstruction,
  withdrawInstruction,
  withdrawInstructions,
} from "../src";

import { rpc, sendTransaction, signer } from "./helpers/mockRpc";
import { setupVault, setupVaultV2 } from "./helpers/setup";
import { setupAta, setupMint } from "./helpers/token";

describe("Lending", () => {
  let mint: Account<Mint>;
  let ataAddress: Address;
  let vaultAddress: Address;
  let vaultV2Address: Address;
  let vaultAtaAddress: Address;
  let vaultV2AtaAddress: Address;
  let lendingPositionAddress: Address;
  let lendingPositionV2Address: Address;
  const depositAmount = 10_000n;
  const supplyLimit = 10000_000_000n;

  beforeAll(async () => {
    const mintAddress = await setupMint();
    mint = await fetchMint(rpc, mintAddress);
    vaultAddress = (await getLendingVaultAddress(mint.address))[0];
    vaultV2Address = (await getLendingVaultV2Address(mint.address, 1))[0];
    lendingPositionAddress = (await getLendingPositionAddress(signer.address, mint.address))[0];
    lendingPositionV2Address = (await getLendingPositionAddress(signer.address, vaultV2Address))[0];

    vaultAtaAddress = (
      await findAssociatedTokenPda({
        owner: vaultAddress,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    vaultV2AtaAddress = (
      await findAssociatedTokenPda({
        owner: vaultV2Address,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    ataAddress = await setupAta(mint, { amount: supplyLimit * 100n });

    await setupVault(mint, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      pythOraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
    });

    await setupVaultV2(mint, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      pythOraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
      id: 1,
    });
  });

  it("Open a lending position", async () => {
    const ix = await openLendingPositionInstruction(signer, mint.address);
    await sendTransaction([ix]);

    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionAddress);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.mint).toEqual(mint.address);
  });

  it("Cannot deposit zero amount", async () => {
    const ix = await depositInstruction(signer, mint, undefined, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Deposit into the lending position", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(await depositInstructions(rpc, signer, mint.address, undefined, depositAmount));

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenBefore.data.amount - tokenAfter.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionAddress);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(depositAmount);
    expect(lendingPosition.data.depositedFunds).toEqual(depositAmount);
    const vault = await fetchVault(rpc, vaultAddress);
    expect(vault.data.depositedFunds).toEqual(depositAmount);
    expect(vault.data.depositedShares).toEqual(depositAmount);
    const vaultAta = await fetchToken(rpc, vaultAtaAddress);
    expect(vaultAta.data.amount).toEqual(depositAmount);
  });

  it("Cannot withdraw zero amount of funds and shares from the position", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, 0n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot withdraw if funds amount exceeds the position balance", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, depositAmount + 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Withdraw from the lending position", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(await withdrawInstructions(rpc, signer, mint.address, undefined, depositAmount, 0n));

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenAfter.data.amount - tokenBefore.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionAddress);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.depositedFunds).toEqual(0n);
    const vault = await fetchVault(rpc, vaultAddress);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    const vaultAta = await fetchToken(rpc, vaultAtaAddress);
    expect(vaultAta.data.amount).toEqual(0n);
  });

  it("Cannot withdraw anything from the empty position", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot deposit more than the supply limit", async () => {
    const vault = await fetchVault(rpc, vaultAddress);

    // Can deposit less or equal to the supply limit
    await sendTransaction([await depositInstruction(signer, mint, undefined, supplyLimit - vault.data.depositedFunds)]);

    // Fails to deposit
    const ix = await depositInstruction(signer, mint, undefined, 1n);
    await assert.rejects(sendTransaction([ix]));

    await sendTransaction([await withdrawInstruction(signer, mint, undefined, supplyLimit, 0n)]);
  });

  it("Cannot repay bad debt with zero funds", async () => {
    const ix = await repayBadDebtInstruction(rpc, signer, mint.address, 0n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot repay bad debt if it is none or less than the repayment amount", async () => {
    const ix = await repayBadDebtInstruction(rpc, signer, mint.address, 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Open and deposit using the instruction helper", async () => {
    const newMint = await fetchMint(rpc, await setupMint());

    await setupAta(newMint, { amount: 10000000n });
    await setupVault(newMint, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      pythOraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
    });

    // Open a position and deposit
    await sendTransaction(
      await openLendingPositionAndDepositInstructions(rpc, signer, newMint.address, undefined, 100000n),
    );
    // Deposit again
    await sendTransaction(
      await openLendingPositionAndDepositInstructions(rpc, signer, newMint.address, undefined, 100000n),
    );
  });

  it("Open a lending position V2", async () => {
    const ix = await openLendingPositionV2Instruction(signer, mint.address, vaultV2Address);
    await sendTransaction([ix]);

    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionV2Address);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.mint).toEqual(mint.address);
  });

  it("Deposit into the lending position V2", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(await depositInstructions(rpc, signer, undefined, vaultV2Address, depositAmount));

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenBefore.data.amount - tokenAfter.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionV2Address);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(depositAmount);
    expect(lendingPosition.data.depositedFunds).toEqual(depositAmount);
    const vault = await fetchVault(rpc, vaultV2Address);
    expect(vault.data.depositedFunds).toEqual(depositAmount);
    expect(vault.data.depositedShares).toEqual(depositAmount);
    const vaultAta = await fetchToken(rpc, vaultV2AtaAddress);
    expect(vaultAta.data.amount).toEqual(depositAmount);
  });

  it("Withdraw from the lending position V2", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(await withdrawInstructions(rpc, signer, undefined, vaultV2Address, depositAmount, 0n));

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenAfter.data.amount - tokenBefore.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionV2Address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.depositedFunds).toEqual(0n);
    const vault = await fetchVault(rpc, vaultV2Address);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    const vaultAta = await fetchToken(rpc, vaultV2AtaAddress);
    expect(vaultAta.data.amount).toEqual(0n);
  });
}, 20000);
