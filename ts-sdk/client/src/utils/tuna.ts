import {
  Account,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  MaybeAccount,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { fetchAllMaybeToken, fetchAllToken, Mint } from "@solana-program/token-2022";

import { PoolToken, TunaConfig, TunaLpPosition, TunaSpotPosition } from "../generated";

import { getCreateAtaInstructions } from "./token.ts";

async function tunaSpotPositionHasDirectlyTransferredTokens(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  tunaPosition: MaybeAccount<TunaSpotPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
): Promise<{ hasDirectlyTransferredTokensA: boolean; hasDirectlyTransferredTokensB: boolean }> {
  if (tunaPosition.exists) {
    const tunaPositionAtaAAddress = (
      await findAssociatedTokenPda({
        owner: tunaPosition.address,
        mint: mintA.address,
        tokenProgram: mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaBAddress = (
      await findAssociatedTokenPda({
        owner: tunaPosition.address,
        mint: mintB.address,
        tokenProgram: mintB.programAddress,
      })
    )[0];

    const [tunaPositionAtaA, tunaPositionAtaB] = await fetchAllToken(rpc, [
      tunaPositionAtaAAddress,
      tunaPositionAtaBAddress,
    ]);

    return {
      hasDirectlyTransferredTokensA:
        tunaPositionAtaA.data.amount > (tunaPosition.data.positionToken == PoolToken.A ? tunaPosition.data.amount : 0n),
      hasDirectlyTransferredTokensB:
        tunaPositionAtaB.data.amount > (tunaPosition.data.positionToken == PoolToken.B ? tunaPosition.data.amount : 0n),
    };
  } else {
    return {
      hasDirectlyTransferredTokensA: false,
      hasDirectlyTransferredTokensB: false,
    };
  }
}

export async function getTunaLpPositionCreateAtaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig> | undefined,
  tunaPosition: MaybeAccount<TunaLpPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
): Promise<{
  init: IInstruction[];
  cleanup: IInstruction[];
}> {
  const owner = tunaPosition.exists ? tunaPosition.data.authority : authority.address;

  const tunaPositionOwnerAtaAAddress = (
    await findAssociatedTokenPda({
      owner: owner,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaBAddress = (
    await findAssociatedTokenPda({
      owner: owner,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const atas = [tunaPositionOwnerAtaAAddress, tunaPositionOwnerAtaBAddress];

  if (tunaConfig) {
    const feeRecipientAtaAAddress = (
      await findAssociatedTokenPda({
        owner: tunaConfig.data.feeRecipient,
        mint: mintA.address,
        tokenProgram: mintA.programAddress,
      })
    )[0];
    atas.push(feeRecipientAtaAAddress);

    const feeRecipientAtaBAddress = (
      await findAssociatedTokenPda({
        owner: tunaConfig.data.feeRecipient,
        mint: mintB.address,
        tokenProgram: mintB.programAddress,
      })
    )[0];
    atas.push(feeRecipientAtaBAddress);
  }

  const [tunaPositionOwnerAtaA, tunaPositionOwnerAtaB, feeRecipientAtaA, feeRecipientAtaB] = await fetchAllMaybeToken(
    rpc,
    atas,
  );

  const init: IInstruction[] = [];
  const cleanup: IInstruction[] = [];

  //
  // Add create user's token account instructions if needed.
  //
  if (!tunaPositionOwnerAtaA.exists) {
    const instructions = await getCreateAtaInstructions(rpc, authority, mintA.address, owner, mintA.programAddress);
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  if (!tunaPositionOwnerAtaB.exists) {
    const instructions = await getCreateAtaInstructions(rpc, authority, mintB.address, owner, mintB.programAddress);
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  //
  // Add create fee recipient's token account instructions if needed.
  //
  if (tunaConfig && !feeRecipientAtaA.exists) {
    const instructions = await getCreateAtaInstructions(
      rpc,
      authority,
      mintA.address,
      tunaConfig.data.feeRecipient,
      mintA.programAddress,
    );
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  if (tunaConfig && !feeRecipientAtaB.exists) {
    const instructions = await getCreateAtaInstructions(
      rpc,
      authority,
      mintB.address,
      tunaConfig.data.feeRecipient,
      mintB.programAddress,
    );
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  return { init, cleanup };
}

export async function getTunaSpotPositionCreateAtaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  tunaPosition: MaybeAccount<TunaSpotPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  collateralToken: PoolToken,
  alwaysCreatePositionOwnerATAs: boolean,
): Promise<{
  init: IInstruction[];
  cleanup: IInstruction[];
  requireTunaPositionOwnerAtaA: boolean;
  requireTunaPositionOwnerAtaB: boolean;
}> {
  const { hasDirectlyTransferredTokensA, hasDirectlyTransferredTokensB } = alwaysCreatePositionOwnerATAs
    ? { hasDirectlyTransferredTokensA: false, hasDirectlyTransferredTokensB: false }
    : await tunaSpotPositionHasDirectlyTransferredTokens(rpc, tunaPosition, mintA, mintB);

  const owner = tunaPosition.exists ? tunaPosition.data.authority : authority.address;

  if (tunaPosition.exists) {
    if (tunaPosition.data.collateralToken != collateralToken) {
      throw new Error("Incorrect collateral token passed");
    }
  }

  const tunaPositionOwnerAtaAAddress = (
    await findAssociatedTokenPda({
      owner: owner,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaBAddress = (
    await findAssociatedTokenPda({
      owner: owner,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const feeRecipientAtaAAddress = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const feeRecipientAtaBAddress = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const [tunaPositionOwnerAtaA, tunaPositionOwnerAtaB, feeRecipientAtaA, feeRecipientAtaB] = await fetchAllMaybeToken(
    rpc,
    [tunaPositionOwnerAtaAAddress, tunaPositionOwnerAtaBAddress, feeRecipientAtaAAddress, feeRecipientAtaBAddress],
  );

  const init: IInstruction[] = [];
  const cleanup: IInstruction[] = [];

  //
  // Add create user's token account instructions if needed.
  //
  const requireTunaPositionOwnerAtaA =
    collateralToken == PoolToken.A || hasDirectlyTransferredTokensA || alwaysCreatePositionOwnerATAs;
  if (!tunaPositionOwnerAtaA.exists && requireTunaPositionOwnerAtaA) {
    const instructions = await getCreateAtaInstructions(rpc, authority, mintA.address, owner, mintA.programAddress);
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  const requireTunaPositionOwnerAtaB =
    collateralToken == PoolToken.B || hasDirectlyTransferredTokensB || alwaysCreatePositionOwnerATAs;
  if (!tunaPositionOwnerAtaB.exists && requireTunaPositionOwnerAtaB) {
    const instructions = await getCreateAtaInstructions(rpc, authority, mintB.address, owner, mintB.programAddress);
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  //
  // Add create fee recipient's token account instructions if needed.
  //
  if (!feeRecipientAtaA.exists) {
    const instructions = await getCreateAtaInstructions(
      rpc,
      authority,
      mintA.address,
      tunaConfig.data.feeRecipient,
      mintA.programAddress,
    );
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  if (!feeRecipientAtaB.exists) {
    const instructions = await getCreateAtaInstructions(
      rpc,
      authority,
      mintB.address,
      tunaConfig.data.feeRecipient,
      mintB.programAddress,
    );
    init.push(...instructions.init);
    cleanup.push(...instructions.cleanup);
  }

  return { init, cleanup, requireTunaPositionOwnerAtaA, requireTunaPositionOwnerAtaB };
}
