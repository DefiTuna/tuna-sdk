import { Address, IInstruction, Slot, TransactionSigner } from "@solana/kit";
import {
  findAddressLookupTablePda,
  getCreateLookupTableInstruction,
  getExtendLookupTableInstruction,
} from "@solana-program/address-lookup-table";

export type CreateAddressLookupTableResult = {
  instructions: IInstruction[];
  lookupTableAddress: Address;
  addresses: Address[];
};

export async function createAddressLookupTableInstructions(
  authority: TransactionSigner,
  addresses: Address[],
  recentSlot: Slot,
): Promise<CreateAddressLookupTableResult> {
  const pda = await findAddressLookupTablePda({ authority: authority.address, recentSlot });

  const createInstruction = getCreateLookupTableInstruction({
    address: pda,
    authority,
    payer: authority,
    recentSlot,
  });

  const extendInstruction = getExtendLookupTableInstruction({
    address: pda[0],
    addresses,
    authority,
    payer: authority,
  });

  return { instructions: [createInstruction, extendInstruction], lookupTableAddress: pda[0], addresses };
}
