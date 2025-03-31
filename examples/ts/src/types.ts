import { Address, IInstruction } from "@solana/kit";

export type TokenMint = Address & {
  [isTokenMint: symbol]: true;
};

export type WalletAddress = Address & {
  [isWalletAddress: symbol]: true;
};

export type CreateAndDepositLendingPositionInstructions = {
  depositLendingIx: IInstruction;
  createLendingPositionIx: IInstruction | null;
  createAtaIx: IInstruction | null;
  wSolAtaIxs: IInstruction[];
  closeWSolAtaIx: IInstruction | null;
};

export type AtaInstructions = { createAtaIxs: IInstruction[]; closeWSolAtaIxs: IInstruction[] };

export type SolanaTransactionSimulation = {
  computeUnitLimit: number;
};

export type SolanaAddressLookupTable = {
  addresses: Address[];
};
