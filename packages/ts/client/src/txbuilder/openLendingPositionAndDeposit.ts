import { Account, GetAccountInfoApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { Mint } from "@solana-program/token-2022";

import { fetchMaybeLendingPosition } from "../generated";
import { getLendingPositionAddress } from "../pda.ts";

import { depositInstructions } from "./deposit.ts";
import { openLendingPositionInstruction } from "./openLendingPosition.ts";

export async function openLendingPositionAndDepositInstructions(
  rpc: Rpc<GetAccountInfoApi>,
  authority: TransactionSigner,
  mint: Account<Mint>,
  amount: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  const lendingPositionAddress = (await getLendingPositionAddress(authority.address, mint.address))[0];

  const lendingPosition = await fetchMaybeLendingPosition(rpc, lendingPositionAddress);
  if (!lendingPosition.exists) {
    instructions.push(await openLendingPositionInstruction(authority, mint.address));
  }

  instructions.push(...(await depositInstructions(authority, mint, amount)));
  return instructions;
}
