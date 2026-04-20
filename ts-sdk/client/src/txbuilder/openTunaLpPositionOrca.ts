import { fetchMaybeWhirlpool, getPositionAddress, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
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
  getOpenTunaLpPositionOrcaInstruction,
  getOpenTunaLpPositionOrcaInstructionDataEncoder,
  getTunaLpPositionAddress,
  OpenTunaLpPositionOrcaInput,
  OpenTunaLpPositionOrcaInstructionDataArgs,
  TUNA_PROGRAM_ADDRESS,
  WP_NFT_UPDATE_AUTH,
} from "../index.ts";

export async function openTunaLpPositionOrcaInstruction(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: TransactionSigner | Address,
  whirlpoolAddress: Address,
  args: OpenTunaLpPositionOrcaInstructionDataArgs,
): Promise<IInstruction> {
  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const positionMintAddress = typeof positionMint === "string" ? positionMint : positionMint.address;

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMintAddress))[0];
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
    ? getOpenTunaLpPositionOrcaInstructionWithEphemeralSigner({
        authority,
        market: marketAddress,
        mintA: mintA.address,
        mintB: mintB.address,
        orcaPosition: orcaPositionAddress,
        tunaPosition: tunaPositionAddress,
        tunaPositionMint: positionMint,
        tunaPositionAta,
        tunaPositionAtaA,
        tunaPositionAtaB,
        whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
        whirlpool: whirlpool.address,
        metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
        tokenProgramA: mintA.programAddress,
        tokenProgramB: mintB.programAddress,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
        token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
        ...args,
      })
    : getOpenTunaLpPositionOrcaInstruction({
        authority,
        market: marketAddress,
        mintA: mintA.address,
        mintB: mintB.address,
        orcaPosition: orcaPositionAddress,
        tunaPosition: tunaPositionAddress,
        tunaPositionMint: positionMint,
        tunaPositionAta,
        tunaPositionAtaA,
        tunaPositionAtaB,
        whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
        whirlpool: whirlpool.address,
        metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
        tokenProgramA: mintA.programAddress,
        tokenProgramB: mintB.programAddress,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
        token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
        ...args,
      });
}

type OpenTunaLpPositionOrcaInputWithEphemeralSigner<TAccountTunaPositionMint extends string = string> = Omit<
  OpenTunaLpPositionOrcaInput,
  "tunaPositionMint"
> & {
  tunaPositionMint: Address<TAccountTunaPositionMint>;
};

export function getOpenTunaLpPositionOrcaInstructionWithEphemeralSigner(
  input: OpenTunaLpPositionOrcaInputWithEphemeralSigner,
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
        address: input.whirlpoolProgram,
        role: AccountRole.READONLY,
      },
      {
        address: input.whirlpool,
        role: AccountRole.READONLY,
      },
      {
        address: input.orcaPosition,
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
    data: getOpenTunaLpPositionOrcaInstructionDataEncoder().encode(input as OpenTunaLpPositionOrcaInstructionDataArgs),
  };
}
