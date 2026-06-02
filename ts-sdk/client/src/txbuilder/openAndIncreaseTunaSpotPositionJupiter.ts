import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { JUPITER_PROGRAM_ADDRESS } from "@crypticdot/jupiter-solana-client";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import {
  type Account,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  fetchAllVault,
  fetchMarket,
  fetchTunaConfig,
  getMarketAddress,
  getOpenAndIncreaseTunaSpotPositionJupiterInstruction,
  getTunaConfigAddress,
  getTunaSpotPositionAddress,
  MarketMaker,
  OpenAndIncreaseTunaSpotPositionJupiterInstructionDataArgs,
  TunaConfig,
  Vault,
} from "../index.ts";
import { getTunaSpotPositionCreateAtaInstructions } from "../utils/tuna.ts";

export type OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs = Omit<
  OpenAndIncreaseTunaSpotPositionJupiterInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function openAndIncreaseTunaSpotPositionJupiterInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  pool: Address,
  jupiterRouteAccounts: IAccountMeta[],
  args: OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const collateralToken = args.collateralToken;
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, pool))[0];
  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const marketAddress = (await getMarketAddress(pool))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const poolAccount =
    market.data.marketMaker == MarketMaker.Fusion ? await fetchFusionPool(rpc, pool) : await fetchWhirlpool(rpc, pool);

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [poolAccount.data.tokenMintA, poolAccount.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [market.data.vaultA, market.data.vaultB]);

  const { init, cleanup, requireTunaPositionOwnerAtaA, requireTunaPositionOwnerAtaB } =
    await getTunaSpotPositionCreateAtaInstructions(
      rpc,
      authority,
      tunaConfig,
      { exists: false, address: tunaPositionAddress },
      mintA,
      mintB,
      collateralToken,
      false,
    );

  //
  // Create the list of instructions
  //
  const instructions: IInstruction[] = [];

  if (createInstructions) {
    createInstructions.push(...init);
  } else {
    instructions.push(...init);
  }

  //
  // Finally, add liquidity decrease instruction.
  //

  const ix = await openAndIncreaseTunaSpotPositionJupiterInstruction(
    authority,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    pool,
    requireTunaPositionOwnerAtaA,
    requireTunaPositionOwnerAtaB,
    jupiterRouteAccounts,
    { ...args },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  if (cleanupInstructions) {
    cleanupInstructions.push(...cleanup);
  } else {
    instructions.push(...cleanup);
  }

  return instructions;
}

export async function openAndIncreaseTunaSpotPositionJupiterInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  pool: Address,
  requireTunaPositionOwnerAtaA: boolean,
  requireTunaPositionOwnerAtaB: boolean,
  jupiterRouteAccounts: IAccountMeta[],
  args: OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs,
): Promise<IInstruction> {
  const marketAddress = (await getMarketAddress(pool))[0];
  const tunaPositionAddress = (await getTunaSpotPositionAddress(authority.address, pool))[0];

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const feeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const feeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
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

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const remainingAccountsInfo = {
    slices: [{ accountsType: AccountsType.JupiterRoute, length: jupiterRouteAccounts.length }],
  };

  const remainingAccounts: IAccountMeta[] = [...jupiterRouteAccounts];

  const ix = getOpenAndIncreaseTunaSpotPositionJupiterInstruction({
    authority,
    tunaConfig: tunaConfig.address,
    mintA: mintA.address,
    mintB: mintB.address,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    market: marketAddress,
    oraclePriceUpdateA: vaultA.data.oraclePriceUpdate,
    oraclePriceUpdateB: vaultB.data.oraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    tunaPosition: tunaPositionAddress,
    tunaPositionAtaA,
    tunaPositionAtaB,
    ...(requireTunaPositionOwnerAtaA && { tunaPositionOwnerAtaA }),
    ...(requireTunaPositionOwnerAtaB && { tunaPositionOwnerAtaB }),
    feeRecipientAtaA,
    feeRecipientAtaB,
    pool: pool,
    jupiterProgram: JUPITER_PROGRAM_ADDRESS,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
