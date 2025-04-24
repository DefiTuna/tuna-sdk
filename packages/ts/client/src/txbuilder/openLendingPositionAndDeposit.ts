import { Address, GetAccountInfoApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { depositInstructions } from "./deposit.ts";
import { fetchMaybeLendingPosition } from "../generated";
import { getLendingPositionAddress } from "../pda.ts";
import { openLendingPositionInstruction } from "./openLendingPosition.ts";

export async function openLendingPositionAndDepositInstructions(
  rpc: Rpc<GetAccountInfoApi>,
  authority: TransactionSigner,
  mint: Address,
  amount: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  const lendingPositionAddress = (await getLendingPositionAddress(authority.address, mint))[0];

  const lendingPosition = await fetchMaybeLendingPosition(rpc, lendingPositionAddress);
  if (!lendingPosition.exists) {
    instructions.push(await openLendingPositionInstruction(authority, mint));
  }

  instructions.push(...(await depositInstructions(authority, mint, amount)));
  return instructions;
}
