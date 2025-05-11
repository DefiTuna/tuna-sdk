import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";

import { fetchMaybeLendingPosition } from "../generated";
import { getLendingPositionAddress } from "../pda.ts";

import { depositInstructions } from "./deposit.ts";
import { openLendingPositionInstruction } from "./openLendingPosition.ts";

export async function openLendingPositionAndDepositInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  mintAddress: Address,
  amount: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  const lendingPositionAddress = (await getLendingPositionAddress(authority.address, mintAddress))[0];

  const lendingPosition = await fetchMaybeLendingPosition(rpc, lendingPositionAddress);
  if (!lendingPosition.exists) {
    instructions.push(await openLendingPositionInstruction(authority, mintAddress));
  }

  instructions.push(...(await depositInstructions(rpc, authority, mintAddress, amount)));
  return instructions;
}
