import { getCreateAccountInstruction } from "@solana-program/system";
import { Address, IInstruction } from "@solana/kit";
import { signer, sendTransaction } from "./mockRpc.ts";
import { getNextKeypair } from "./keypair.ts";
import {
  ExtensionArgs,
  getInitializeTransferFeeConfigInstruction,
  getSetTransferFeeInstruction,
  getMintSize,
  getInitializeMint2Instruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { DEFAULT_ADDRESS } from "./addresses.ts";

export async function setupMintTE(config: { decimals?: number; extensions?: ExtensionArgs[] } = {}): Promise<Address> {
  const keypair = getNextKeypair();
  const instructions: IInstruction[] = [];

  instructions.push(
    getCreateAccountInstruction({
      payer: signer,
      newAccount: keypair,
      lamports: 1e8,
      space: getMintSize(config.extensions),
      programAddress: TOKEN_2022_PROGRAM_ADDRESS,
    }),
  );

  for (const extension of config.extensions ?? []) {
    switch (extension.__kind) {
      case "TransferFeeConfig":
        instructions.push(
          getInitializeTransferFeeConfigInstruction({
            mint: keypair.address,
            transferFeeConfigAuthority: signer.address,
            withdrawWithheldAuthority: signer.address,
            transferFeeBasisPoints: extension.olderTransferFee.transferFeeBasisPoints,
            maximumFee: extension.olderTransferFee.maximumFee,
          }),
        );
    }
  }

  instructions.push(
    getInitializeMint2Instruction({
      mint: keypair.address,
      mintAuthority: signer.address,
      freezeAuthority: null,
      decimals: config.decimals ?? 6,
    }),
  );

  for (const extension of config.extensions ?? []) {
    switch (extension.__kind) {
      case "TransferFeeConfig":
        instructions.push(
          getSetTransferFeeInstruction({
            mint: keypair.address,
            transferFeeConfigAuthority: signer.address,
            transferFeeBasisPoints: extension.newerTransferFee.transferFeeBasisPoints,
            maximumFee: extension.newerTransferFee.maximumFee,
          }),
        );
    }
  }

  await sendTransaction(instructions);

  return keypair.address;
}

export async function setupMintTEFee(config: { decimals?: number } = {}): Promise<Address> {
  return setupMintTE({
    ...config,
    extensions: [
      {
        __kind: "TransferFeeConfig",
        transferFeeConfigAuthority: DEFAULT_ADDRESS,
        withdrawWithheldAuthority: DEFAULT_ADDRESS,
        withheldAmount: 0n,
        olderTransferFee: {
          epoch: 0n,
          maximumFee: 1e9,
          transferFeeBasisPoints: 100,
        },
        newerTransferFee: {
          epoch: 10n,
          maximumFee: 1e9,
          transferFeeBasisPoints: 150,
        },
      },
    ],
  });
}
