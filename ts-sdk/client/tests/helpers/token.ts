import { Account, Address, IInstruction } from "@solana/kit";
import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getMintToInstruction, Mint } from "@solana-program/token-2022";

import { NATIVE_MINT } from "../../src";

import { getNextKeypair } from "./keypair.ts";
import { sendTransaction, signer } from "./mockRpc.ts";

export async function setupAta(mint: Account<Mint>, config: { amount?: number | bigint } = {}): Promise<Address> {
  const ata = await findAssociatedTokenPda({
    mint: mint.address,
    owner: signer.address,
    tokenProgram: mint.programAddress,
  });

  const instructions: IInstruction[] = [];

  instructions.push(
    getCreateAssociatedTokenIdempotentInstruction({
      mint: mint.address,
      owner: signer.address,
      ata: ata[0],
      payer: signer,
      tokenProgram: mint.programAddress,
    }),
  );

  if (config.amount) {
    if (mint.address === NATIVE_MINT) {
      instructions.push(
        getTransferSolInstruction({
          source: signer,
          destination: ata[0],
          amount: config.amount,
        }),
      );
      instructions.push(
        getSyncNativeInstruction({
          account: ata[0],
        }),
      );
    } else {
      instructions.push(
        getMintToInstruction(
          {
            mint: mint.address,
            token: ata[0],
            mintAuthority: signer,
            amount: config.amount,
          },
          { programAddress: mint.programAddress },
        ),
      );
    }
  }

  await sendTransaction(instructions);

  return ata[0];
}

export async function setupMint(config: { decimals?: number } = {}): Promise<Address> {
  const keypair = getNextKeypair();
  const instructions: IInstruction[] = [];

  instructions.push(
    getCreateAccountInstruction({
      programAddress: TOKEN_PROGRAM_ADDRESS,
      payer: signer,
      newAccount: keypair,
      lamports: 1e8,
      space: getMintSize(),
    }),
  );

  instructions.push(
    getInitializeMint2Instruction({
      mint: keypair.address,
      mintAuthority: signer.address,
      freezeAuthority: null,
      decimals: config.decimals ?? 6,
    }),
  );

  await sendTransaction(instructions);

  return keypair.address;
}
