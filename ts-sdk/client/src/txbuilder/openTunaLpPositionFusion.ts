import { fetchMaybeFusionPool, FUSIONAMM_PROGRAM_ADDRESS, getPositionAddress } from "@crypticdot/fusionamm-client";
import { FP_NFT_UPDATE_AUTH } from "@crypticdot/fusionamm-client";
import {
  AccountRole,
  Address,
  address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  getMarketAddress,
  getOpenTunaLpPositionFusionInstruction,
  getOpenTunaLpPositionFusionInstructionDataEncoder,
  getTunaLpPositionAddress,
  OpenTunaLpPositionFusionInput,
  OpenTunaLpPositionFusionInstructionDataArgs,
  TUNA_PROGRAM_ADDRESS,
} from "../index.ts";

export async function openTunaLpPositionFusionInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: TransactionSigner | Address,
  fusionPoolAddress: Address,
  args: OpenTunaLpPositionFusionInstructionDataArgs,
): Promise<IInstruction> {
  const fusionPool = await fetchMaybeFusionPool(rpc, fusionPoolAddress);
  if (!fusionPool.exists) throw new Error("Whirlpool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [fusionPool.data.tokenMintA, fusionPool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const positionMintAddress = typeof positionMint === "string" ? positionMint : positionMint.address;

  const marketAddress = (await getMarketAddress(fusionPool.address))[0];
  const fusionPositionAddress = (await getPositionAddress(positionMintAddress))[0];
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMintAddress))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMintAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  return typeof positionMint === "string"
    ? getOpenTunaLpPositionFusionInstructionWithEphemeralSigner({
        authority,
        market: marketAddress,
        mintA: mintA.address,
        mintB: mintB.address,
        fusionPosition: fusionPositionAddress,
        tunaPosition: tunaPositionAddress,
        tunaPositionMint: positionMint,
        tunaPositionAta,
        tunaPositionAtaA,
        tunaPositionAtaB,
        fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
        fusionPool: fusionPool.address,
        metadataUpdateAuth: FP_NFT_UPDATE_AUTH,
        tokenProgramA: mintA.programAddress,
        tokenProgramB: mintB.programAddress,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
        token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
        ...args,
      })
    : getOpenTunaLpPositionFusionInstruction({
        authority,
        market: marketAddress,
        mintA: mintA.address,
        mintB: mintB.address,
        fusionPosition: fusionPositionAddress,
        tunaPosition: tunaPositionAddress,
        tunaPositionMint: positionMint,
        tunaPositionAta,
        tunaPositionAtaA,
        tunaPositionAtaB,
        fusionammProgram: FUSIONAMM_PROGRAM_ADDRESS,
        fusionPool: fusionPool.address,
        metadataUpdateAuth: FP_NFT_UPDATE_AUTH,
        tokenProgramA: mintA.programAddress,
        tokenProgramB: mintB.programAddress,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
        token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
        ...args,
      });
}

type OpenTunaLpPositionFusionInputWithEphemeralSigner<TAccountTunaPositionMint extends string = string> = Omit<
  OpenTunaLpPositionFusionInput,
  "tunaPositionMint"
> & {
  tunaPositionMint: Address<TAccountTunaPositionMint>;
};

export function getOpenTunaLpPositionFusionInstructionWithEphemeralSigner(
  input: OpenTunaLpPositionFusionInputWithEphemeralSigner,
): IInstruction {
  return {
    accounts: [
      {
        address: input.authority.address,
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: input.mintA,
        role: AccountRole.READONLY,
      },
      {
        address: input.mintB,
        role: AccountRole.READONLY,
      },
      {
        address: input.tokenProgramA,
        role: AccountRole.READONLY,
      },
      {
        address: input.tokenProgramB,
        role: AccountRole.READONLY,
      },
      {
        address: input.market,
        role: AccountRole.READONLY,
      },
      {
        address: input.tunaPosition,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPositionMint,
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: input.tunaPositionAta,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPositionAtaA,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPositionAtaB,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.fusionammProgram,
        role: AccountRole.READONLY,
      },
      {
        address: input.fusionPool,
        role: AccountRole.READONLY,
      },
      {
        address: input.fusionPosition,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.metadataUpdateAuth,
        role: AccountRole.READONLY,
      },
      {
        address: input.token2022Program,
        role: AccountRole.READONLY,
      },
      {
        address: input.systemProgram ?? address("11111111111111111111111111111111"),
        role: AccountRole.READONLY,
      },
      {
        address: input.associatedTokenProgram,
        role: AccountRole.READONLY,
      },
    ],
    programAddress: TUNA_PROGRAM_ADDRESS,
    data: getOpenTunaLpPositionFusionInstructionDataEncoder().encode(
      input as OpenTunaLpPositionFusionInstructionDataArgs,
    ),
  };
}
