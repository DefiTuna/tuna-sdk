import { Address, IInstruction, Rpc, SolanaRpcApi, TransactionSigner } from "@solana/kit";
import { fetchMaybeToken, fetchMint, findAssociatedTokenPda } from "@solana-program/token-2022";
import { expect } from "vitest";

import {
  fetchTunaLpPosition,
  getLendingVaultAddress,
  getTunaLpPositionAddress,
  repayTunaLpPositionDebtInstructions,
} from "../../src";

import { FUNDER } from "./addresses.ts";
import { sendTransaction } from "./mockRpc.ts";

export type RepayDebtTestArgs = {
  rpc: Rpc<SolanaRpcApi>;
  signer?: TransactionSigner;
  positionMint: Address;
  collateralA: bigint;
  collateralB: bigint;
};

export async function repayTunaLpPositionDebt({
  rpc,
  positionMint,
  collateralA,
  collateralB,
  signer = FUNDER,
}: RepayDebtTestArgs) {
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
  const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);

  const mintA = await fetchMint(rpc, tunaPosition.data.mintA);
  const mintB = await fetchMint(rpc, tunaPosition.data.mintB);

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: signer.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: signer.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const instructions: IInstruction[] = [];
  instructions.push(
    ...(await repayTunaLpPositionDebtInstructions(rpc, signer, positionMint, collateralA, collateralB)),
  );

  const userTokenABefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceABefore = userTokenABefore.exists ? userTokenABefore.data.amount : 0n;
  const userTokenBBefore = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBBefore = userTokenBBefore.exists ? userTokenBBefore.data.amount : 0n;

  const vaultTokenABefore = await fetchMaybeToken(rpc, vaultAAta);
  const vaultBalanceABefore = vaultTokenABefore.exists ? vaultTokenABefore.data.amount : 0n;
  const vaultTokenBBefore = await fetchMaybeToken(rpc, vaultBAta);
  const vaultBalanceBBefore = vaultTokenBBefore.exists ? vaultTokenBBefore.data.amount : 0n;

  // Repay debt
  await sendTransaction(instructions);

  const userTokenAAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaA);
  const userBalanceAAfter = userTokenAAfter.exists ? userTokenAAfter.data.amount : 0n;
  const userTokenBAfter = await fetchMaybeToken(rpc, tunaPositionOwnerAtaB);
  const userBalanceBAfter = userTokenBAfter.exists ? userTokenBAfter.data.amount : 0n;

  const vaultTokenAAfter = await fetchMaybeToken(rpc, vaultAAta);
  const vaultBalanceAAfter = vaultTokenAAfter.exists ? vaultTokenAAfter.data.amount : 0n;
  const vaultTokenBAfter = await fetchMaybeToken(rpc, vaultBAta);
  const vaultBalanceBAfter = vaultTokenBAfter.exists ? vaultTokenBAfter.data.amount : 0n;

  const tunaPositionAfter = await fetchTunaLpPosition(rpc, tunaPositionAddress);

  expect(userBalanceAAfter + collateralA).toEqual(userBalanceABefore);
  expect(userBalanceBAfter + collateralB).toEqual(userBalanceBBefore);
  expect(vaultBalanceAAfter).toEqual(vaultBalanceABefore + collateralA);
  expect(vaultBalanceBAfter).toEqual(vaultBalanceBBefore + collateralB);
  expect(tunaPosition.data.leftoversA).toEqual(tunaPositionAfter.data.leftoversA);
  expect(tunaPosition.data.leftoversB).toEqual(tunaPositionAfter.data.leftoversB);
}
