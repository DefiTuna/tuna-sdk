import { address, Address, GetAccountInfoApi, IInstruction, Rpc, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  fetchMaybeToken,
  getCloseAccountInstruction,
  getCreateAssociatedTokenInstruction,
  getSyncNativeInstruction,
} from "@solana-program/token-2022";
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

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

  return getCreateAssociatedTokenInstruction({
    mint,
    owner,
    ata,
    payer,
    tokenProgram,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
  });
}

export async function getCreateMaybeAtaInstruction(
  rpc: Rpc<GetAccountInfoApi>,
  payer: TransactionSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<IInstruction | undefined> {
  return (await getCreateMaybeAtaInstructionAndAddress(rpc, payer, mint, owner, tokenProgram)).instruction;
}

export async function getCreateMaybeAtaInstructionAndAddress(
  rpc: Rpc<GetAccountInfoApi>,
  payer: TransactionSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<{ instruction: IInstruction | undefined; address: Address }> {
  const associateTokenAddress = (
    await findAssociatedTokenPda({
      mint,
      owner,
      tokenProgram,
    })
  )[0];

  const token = await fetchMaybeToken(rpc, associateTokenAddress);
  if (!token.exists) {
    return {
      instruction: getCreateAssociatedTokenInstruction({
        ata: associateTokenAddress,
        mint,
        owner,
        payer,
        tokenProgram,
        systemProgram: SYSTEM_PROGRAM_ADDRESS,
      }),
      address: associateTokenAddress,
    };
  }

  return { instruction: undefined, address: associateTokenAddress };
}

export async function getCreateMaybeAtaInstructions(
  rpc: Rpc<GetAccountInfoApi>,
  payer: TransactionSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
  amount?: bigint | number,
): Promise<{ init: IInstruction[]; cleanup: IInstruction[] }> {
  const init: IInstruction[] = [];
  const cleanup: IInstruction[] = [];

  const createAta = await getCreateMaybeAtaInstructionAndAddress(rpc, payer, mint, owner, tokenProgram);
  if (createAta.instruction !== undefined) init.push(createAta.instruction);

  if (mint == NATIVE_MINT) {
    if (amount && amount > 0) {
      init.push(
        getTransferSolInstruction({
          source: payer,
          destination: createAta.address,
          amount,
        }),
        getSyncNativeInstruction({ account: createAta.address }),
      );
    }

    cleanup.push(
      getCloseAccountInstruction({
        account: createAta.address,
        destination: payer.address,
        owner,
      }),
    );
  }

  return { init, cleanup };
}
