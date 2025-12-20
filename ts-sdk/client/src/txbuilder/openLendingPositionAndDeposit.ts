import { Address, GetAccountInfoApi, GetMultipleAccountsApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";

import { fetchMaybeLendingPosition } from "../generated";
import { getLendingPositionAddress } from "../pda.ts";

import { depositInstructions } from "./deposit.ts";
import { openLendingPositionInstruction } from "./openLendingPosition.ts";
import { openLendingPositionV2Instruction } from "./openLendingPositionV2.ts";

export async function openLendingPositionAndDepositInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  mintAddress: Address,
  vaultAddress: Address | undefined,
  amount: bigint,
): Promise<IInstruction[]> {
  const instructions: IInstruction[] = [];

  const lendingPositionAddress = (await getLendingPositionAddress(authority.address, vaultAddress ?? mintAddress))[0];

  const lendingPosition = await fetchMaybeLendingPosition(rpc, lendingPositionAddress);
  if (!lendingPosition.exists) {
    if (vaultAddress) {
      instructions.push(await openLendingPositionV2Instruction(authority, mintAddress, vaultAddress));
    } else {
      instructions.push(await openLendingPositionInstruction(authority, mintAddress));
    }
  }

  instructions.push(...(await depositInstructions(rpc, authority, mintAddress, vaultAddress, amount)));
  return instructions;
}
