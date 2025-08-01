import { Address, address, GetAccountInfoApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  fetchMaybeToken,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
} from "@solana-program/token-2022";

export const NATIVE_MINT = address("So11111111111111111111111111111111111111112");

export async function getCreateAtaInstruction(
  mint: Address,
  owner: Address,
  payer: TransactionSigner,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<IInstruction> {
  const ata = (
    await findAssociatedTokenPda({
      mint,
      owner,
      tokenProgram,
    })
  )[0];

  return getCreateAssociatedTokenIdempotentInstruction({
    mint,
    owner,
    ata,
    payer,
    tokenProgram,
  });
}

export async function getCreateAtaInstructions(
  rpc: Rpc<GetAccountInfoApi> | undefined,
  payer: TransactionSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  amount?: bigint | number,
): Promise<{ init: IInstruction[]; cleanup: IInstruction[] }> {
  const init: IInstruction[] = [];
  const cleanup: IInstruction[] = [];

  const ata = (await findAssociatedTokenPda({ mint, owner, tokenProgram }))[0];
  init.push(getCreateAssociatedTokenIdempotentInstruction({ payer, ata, mint, owner, tokenProgram }));

  if (mint == NATIVE_MINT) {
    if (amount && amount > 0) {
      if (!rpc) throw new Error("Rpc must be if amount > 0");
      const tokenAccount = await fetchMaybeToken(rpc, ata);
      const existingBalance = tokenAccount.exists ? tokenAccount.data.amount : 0n;

      if (BigInt(amount) > existingBalance) {
        init.push(
          getTransferSolInstruction({ source: payer, destination: ata, amount: BigInt(amount) - existingBalance }),
        );
        init.push(getSyncNativeInstruction({ account: ata }, { programAddress: tokenProgram }));
      }
    }

    // Close WSOL account on the cleanup stage if the token account belongs to the payer.
    if (owner == payer.address) {
      cleanup.push(
        getCloseAccountInstruction(
          { account: ata, destination: owner, owner: payer },
          { programAddress: tokenProgram },
        ),
      );
    }
  }

  return { init, cleanup };
}
