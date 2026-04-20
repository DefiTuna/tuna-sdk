import { Account, Address, generateKeyPairSigner } from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { fetchMint, fetchToken, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  depositInstruction,
  depositInstructions,
  fetchLendingPosition,
  fetchVault,
  getCreateAtaInstructions,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
  getWithdrawInstruction,
  openLendingPositionAndDepositInstructions,
  openLendingPositionInstruction,
  openLendingPositionV2Instruction,
  repayBadDebtInstruction,
  withdrawInstruction,
  withdrawInstructions,
} from "../src";

import { ALICE_KEYPAIR } from "./helpers/addresses.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc";
import { setupVault, setupVaultPermissionless } from "./helpers/setup";
import { setupAta, setupMint } from "./helpers/token";

describe("Lending", () => {
  let mint: Account<Mint>;
  let marketAddress: Address;
  let ataAddress: Address;
  let defaultVaultAddress: Address;
  let isolatedVaultAddress: Address;
  let defaultVaultAtaAddress: Address;
  let isolatedVaultAtaAddress: Address;
  let lendingPositionAddress: Address;
  let lendingPositionV2Address: Address;
  const depositAmount = 10_000n;
  const supplyLimit = 10000_000_000n;

  beforeAll(async () => {
    const mintAddress = await setupMint();
    mint = await fetchMint(rpc, mintAddress);
    marketAddress = (await generateKeyPairSigner()).address;
    defaultVaultAddress = (await getLendingVaultAddress(mint.address))[0];
    isolatedVaultAddress = (await getLendingVaultAddress(mint.address, marketAddress))[0];
    lendingPositionAddress = (await getLendingPositionAddress(signer.address, mint.address))[0];
    lendingPositionV2Address = (await getLendingPositionAddress(signer.address, isolatedVaultAddress))[0];

    defaultVaultAtaAddress = (
      await findAssociatedTokenPda({
        owner: defaultVaultAddress,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    isolatedVaultAtaAddress = (
      await findAssociatedTokenPda({
        owner: isolatedVaultAddress,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    ataAddress = await setupAta(mint, { amount: supplyLimit * 100n });

    await setupVault(mint, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      oraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit,
      allowUnsafeTokenExtensions: true,
    });

    await setupVaultPermissionless(mint, {
      interestRate: 3655890108n,
      market: marketAddress,
    });
  });

  it("Open a lending position", async () => {
    const ix = await openLendingPositionInstruction(signer, mint.address);
    await sendTransaction([ix]);

    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionAddress);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.mint).toEqual(mint.address);
    expect(lendingPosition.data.vault).toEqual(defaultVaultAddress);
  });

  it("Open a lending position V2", async () => {
    const ix = await openLendingPositionV2Instruction(signer, mint.address, isolatedVaultAddress);
    await sendTransaction([ix]);

    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionV2Address);
    expect(lendingPosition.data.authority).toEqual(signer.address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.mint).toEqual(mint.address);
    expect(lendingPosition.data.vault).toEqual(isolatedVaultAddress);
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
    const vault = await fetchVault(rpc, defaultVaultAddress);
    expect(vault.data.depositedFunds).toEqual(depositAmount);
    expect(vault.data.depositedShares).toEqual(depositAmount);
    const vaultAta = await fetchToken(rpc, defaultVaultAtaAddress);
    expect(vaultAta.data.amount).toEqual(depositAmount);
  });

  it("Deposit into the lending position V2", async () => {
    await sendTransaction(await depositInstructions(rpc, signer, mint.address, isolatedVaultAddress, depositAmount));
  });

  it("Cannot withdraw zero amount of funds and shares from the position", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, 0n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot withdraw if funds amount exceeds the position balance", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, depositAmount + 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot withdraw from another authority’s lending position", async () => {
    const tunaConfig = (await getTunaConfigAddress())[0];
    const vault = (await getLendingVaultAddress(mint.address))[0];

    const lendingPosition = (await getLendingPositionAddress(signer.address, mint.address))[0];
    const vaultAta = (
      await findAssociatedTokenPda({
        owner: vault,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    const authorityAta = (
      await findAssociatedTokenPda({
        owner: ALICE_KEYPAIR.address,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    // Add create user's token account instruction if needed.
    const createUserAtaInstructions = await getCreateAtaInstructions(
      rpc,
      ALICE_KEYPAIR,
      mint.address,
      ALICE_KEYPAIR.address,
      mint.programAddress,
    );

    // Alice will try to withdraw
    const ix = getWithdrawInstruction({
      authority: ALICE_KEYPAIR,
      authorityAta,
      lendingPosition,
      mint: mint.address,
      tunaConfig,
      vault,
      vaultAta,
      tokenProgram: mint.programAddress,
      memoProgram: MEMO_PROGRAM_ADDRESS,
      funds: depositAmount,
      shares: 0n,
    });

    await assert.rejects(sendTransaction([...createUserAtaInstructions.init, ix]), err => {
      expect((err as Error).toString()).contain(`custom program error: 0x7d6`);
      return true;
    });
  });

  it("Cannot withdraw from an inappropriate vault", async () => {
    const tunaConfig = (await getTunaConfigAddress())[0];
    const vault = (await getLendingVaultAddress(mint.address))[0];

    // 'isolatedVaultAddress' is used to derive the lending position address!
    const lendingPosition = (await getLendingPositionAddress(signer.address, isolatedVaultAddress))[0];
    const vaultAta = (
      await findAssociatedTokenPda({
        owner: vault,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    const authorityAta = (
      await findAssociatedTokenPda({
        owner: signer.address,
        mint: mint.address,
        tokenProgram: mint.programAddress,
      })
    )[0];

    // Add create user's token account instruction if needed.
    const createUserAtaInstructions = await getCreateAtaInstructions(
      rpc,
      signer,
      mint.address,
      signer.address,
      mint.programAddress,
    );

    // Alice will try to withdraw
    const ix = getWithdrawInstruction({
      authority: signer,
      authorityAta,
      lendingPosition,
      mint: mint.address,
      tunaConfig,
      vault,
      vaultAta,
      tokenProgram: mint.programAddress,
      memoProgram: MEMO_PROGRAM_ADDRESS,
      funds: depositAmount,
      shares: 0n,
    });

    await assert.rejects(sendTransaction([...createUserAtaInstructions.init, ix]), err => {
      expect((err as Error).toString()).contain(`custom program error: 0x7d6`);
      return true;
    });
  });

  it("Withdraw from the lending position", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(await withdrawInstructions(rpc, signer, mint.address, undefined, depositAmount, 0n));

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenAfter.data.amount - tokenBefore.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionAddress);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.depositedFunds).toEqual(0n);
    const vault = await fetchVault(rpc, defaultVaultAddress);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    const vaultAta = await fetchToken(rpc, defaultVaultAtaAddress);
    expect(vaultAta.data.amount).toEqual(0n);
  });

  it("Cannot withdraw anything from the empty position", async () => {
    const ix = await withdrawInstruction(signer, mint, undefined, 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot deposit more than the supply limit", async () => {
    const vault = await fetchVault(rpc, defaultVaultAddress);

    // Can deposit less or equal to the supply limit
    await sendTransaction([await depositInstruction(signer, mint, undefined, supplyLimit - vault.data.depositedFunds)]);

    // Fails to deposit
    const ix = await depositInstruction(signer, mint, undefined, 1n);
    await assert.rejects(sendTransaction([ix]));

    await sendTransaction([await withdrawInstruction(signer, mint, undefined, supplyLimit, 0n)]);
  });

  it("Cannot repay bad debt with zero funds", async () => {
    const ix = await repayBadDebtInstruction(rpc, signer, defaultVaultAddress, 0n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Cannot repay bad debt if it is none or less than the repayment amount", async () => {
    const ix = await repayBadDebtInstruction(rpc, signer, defaultVaultAddress, 1n, 0n);
    await assert.rejects(sendTransaction([ix]));
  });

  it("Open and deposit using the instruction helper", async () => {
    const newMint = await fetchMint(rpc, await setupMint());

    await setupAta(newMint, { amount: 10000000n });
    await setupVault(newMint, {
      pythOracleFeedId: DEFAULT_ADDRESS,
      oraclePriceUpdate: DEFAULT_ADDRESS,
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

  it("Withdraw from the lending position V2", async () => {
    const tokenBefore = await fetchToken(rpc, ataAddress);

    await sendTransaction(
      await withdrawInstructions(rpc, signer, mint.address, isolatedVaultAddress, depositAmount, 0n),
    );

    const tokenAfter = await fetchToken(rpc, ataAddress);
    expect(tokenAfter.data.amount - tokenBefore.data.amount).toEqual(depositAmount);
    const lendingPosition = await fetchLendingPosition(rpc, lendingPositionV2Address);
    expect(lendingPosition.data.depositedShares).toEqual(0n);
    expect(lendingPosition.data.depositedFunds).toEqual(0n);
    const vault = await fetchVault(rpc, isolatedVaultAddress);
    expect(vault.data.depositedFunds).toEqual(0n);
    expect(vault.data.depositedShares).toEqual(0n);
    const vaultAta = await fetchToken(rpc, isolatedVaultAtaAddress);
    expect(vaultAta.data.amount).toEqual(0n);
  });
}, 20000);
