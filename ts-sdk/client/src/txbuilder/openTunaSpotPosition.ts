import { FUSIONAMM_PROGRAM_ADDRESS, FusionPool, getFusionPoolDecoder } from "@crypticdot/fusionamm-client";
import { getWhirlpoolDecoder, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import {
  type Account,
  Address,
  decodeAccount,
  fetchEncodedAccount,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  getOpenTunaSpotPositionInstruction,
  getTunaSpotPositionAddress,
  OpenTunaSpotPositionInstructionDataArgs,
} from "../index.ts";

export async function openTunaSpotPositionInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  poolAddress: Address,
  args: OpenTunaSpotPositionInstructionDataArgs,
): Promise<IInstruction[]> {
  const poolAccount = await fetchEncodedAccount(rpc, poolAddress);
  assert(poolAccount.exists, "Pool account not found");

  let pool: Account<FusionPool> | Account<Whirlpool>;
  if (poolAccount.programAddress == FUSIONAMM_PROGRAM_ADDRESS) {
    pool = decodeAccount(poolAccount, getFusionPoolDecoder());
  } else if (poolAccount.programAddress == WHIRLPOOL_PROGRAM_ADDRESS) {
    pool = decodeAccount(poolAccount, getWhirlpoolDecoder());
  } else {
    throw new Error("Incorrect Fusion or Orca pool account");
  }

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const ix = await openTunaSpotPositionInstruction(authority, mintA, mintB, poolAddress, args);
  return [ix];
}

export async function openTunaSpotPositionInstruction(
  authority: TransactionSigner,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  poolAddress: Address,
  args: OpenTunaSpotPositionInstructionDataArgs,
): Promise<IInstruction> {
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, poolAddress))[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  return getOpenTunaSpotPositionInstruction({
    authority,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    pool: poolAddress,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ...args,
  });
}
