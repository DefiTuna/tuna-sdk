import {
  fetchAllMaybeTickArray,
  fetchMaybeWhirlpool,
  getDynamicTickArrayMinSize,
  getInitializeDynamicTickArrayInstruction,
  getOracleAddress,
  getPositionAddress,
  getTickArrayAddress,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import {
  type Account,
  AccountRole,
  Address,
  address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Lamports,
  lamports,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchSysvarRent } from "@solana/sysvars";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  fetchAllVault,
  fetchMarket,
  fetchTunaConfig,
  getMarketAddress,
  getOpenAndIncreaseTunaLpPositionOrcaInstruction,
  getOpenAndIncreaseTunaLpPositionOrcaInstructionDataEncoder,
  getTunaConfigAddress,
  getTunaLpPositionAddress,
  OpenAndIncreaseTunaLpPositionOrcaInput,
  OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs,
  OrcaUtils,
  TUNA_PROGRAM_ADDRESS,
  TunaConfig,
  Vault,
  WP_NFT_UPDATE_AUTH,
} from "../index.ts";
import { calculateMinimumBalanceForRentExemption } from "../utils/sysvar";
import { getTunaLpPositionCreateAtaInstructions } from "../utils/tuna.ts";

export type OpenAndIncreaseTunaLpPositionOrca = {
  /** List of Solana transaction instructions to execute. */
  instructions: IInstruction[];

  /** The initialization cost for opening the position in lamports. */
  initializationCost: Lamports;
};

export type OpenAndIncreaseTunaLpPositionOrcaInstructionsArgs = Omit<
  OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs,
  "remainingAccountsInfo"
>;

export async function openAndIncreaseTunaLpPositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: TransactionSigner | Address,
  whirlpoolAddress: Address,
  args: OpenAndIncreaseTunaLpPositionOrcaInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<OpenAndIncreaseTunaLpPositionOrca> {
  const rent = await fetchSysvarRent(rpc);
  let nonRefundableRent: bigint = 0n;

  const positionMintAddress = typeof positionMint === "string" ? positionMint : positionMint.address;
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMintAddress))[0];

  const tunaConfig = await fetchTunaConfig(rpc, (await getTunaConfigAddress())[0]);

  const whirlpool = await fetchMaybeWhirlpool(rpc, whirlpoolAddress);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [mintA, mintB] = await fetchAllMaybeMint(rpc, [whirlpool.data.tokenMintA, whirlpool.data.tokenMintB]);
  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");

  const marketAddress = (await getMarketAddress(whirlpoolAddress))[0];
  const market = await fetchMarket(rpc, marketAddress);

  const [vaultA, vaultB] = await fetchAllVault(rpc, [market.data.vaultA, market.data.vaultB]);

  const { init, cleanup } = await getTunaLpPositionCreateAtaInstructions(
    rpc,
    authority,
    tunaConfig,
    { exists: false, address: tunaPositionAddress },
    mintA,
    mintB,
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
  // Add create tick arrays instructions if needed.
  //
  const lowerTickArrayIndex = getTickArrayStartTickIndex(args.tickLowerIndex, whirlpool.data.tickSpacing);
  const [lowerTickArrayAddress] = await getTickArrayAddress(whirlpool.address, lowerTickArrayIndex);

  const upperTickArrayIndex = getTickArrayStartTickIndex(args.tickUpperIndex, whirlpool.data.tickSpacing);
  const [upperTickArrayAddress] = await getTickArrayAddress(whirlpool.address, upperTickArrayIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllMaybeTickArray(rpc, [
    lowerTickArrayAddress,
    upperTickArrayAddress,
  ]);

  // Create a tick array it doesn't exist.
  if (!lowerTickArray.exists) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: lowerTickArrayAddress,
        startTickIndex: lowerTickArrayIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

  // Create a tick array it doesn't exist.
  if (!upperTickArray.exists && lowerTickArrayIndex !== upperTickArrayIndex) {
    instructions.push(
      getInitializeDynamicTickArrayInstruction({
        whirlpool: whirlpool.address,
        funder: authority,
        tickArray: upperTickArrayAddress,
        startTickIndex: upperTickArrayIndex,
        idempotent: false,
      }),
    );
    nonRefundableRent += calculateMinimumBalanceForRentExemption(rent, getDynamicTickArrayMinSize());
  }

  //
  // Finally, add liquidity increase instruction.
  //

  const ix = await openAndIncreaseTunaLpPositionOrcaInstruction(
    authority,
    positionMint,
    tunaConfig,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
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

  return {
    instructions,
    initializationCost: lamports(nonRefundableRent),
  };
}

export async function openAndIncreaseTunaLpPositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: TransactionSigner | Address,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  args: Omit<OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs, "remainingAccountsInfo">,
): Promise<IInstruction> {
  const positionMintAddress = typeof positionMint === "string" ? positionMint : positionMint.address;
  const tunaPositionAddress = (await getTunaLpPositionAddress(positionMintAddress))[0];

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMintAddress))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMintAddress,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(whirlpool);
  const lowerTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(whirlpool, args.tickLowerIndex);
  const upperTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(whirlpool, args.tickUpperIndex);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const remainingAccountsInfo = {
    slices: [
      { accountsType: AccountsType.SwapTickArrays, length: 5 },
      { accountsType: AccountsType.TickArrayLower, length: 1 },
      { accountsType: AccountsType.TickArrayUpper, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenA, length: 1 },
      { accountsType: AccountsType.PoolVaultTokenB, length: 1 },
      { accountsType: AccountsType.WhirlpoolOracle, length: 1 },
    ],
  };

  const ix =
    typeof positionMint === "string"
      ? getOpenAndIncreaseTunaLpPositionOrcaInstructionWithEphemeralSigner({
          authority,
          tunaConfig: tunaConfig.address,
          mintA: mintA.address,
          mintB: mintB.address,
          market: marketAddress,
          oraclePriceUpdateA: vaultA.data.oraclePriceUpdate,
          oraclePriceUpdateB: vaultB.data.oraclePriceUpdate,
          vaultA: vaultA.address,
          vaultAAta,
          vaultB: vaultB.address,
          vaultBAta,
          tunaPosition: tunaPositionAddress,
          tunaPositionMint: positionMint,
          tunaPositionAta,
          tunaPositionAtaA,
          tunaPositionAtaB,
          tunaPositionOwnerAtaA,
          tunaPositionOwnerAtaB,
          feeRecipientAtaA,
          feeRecipientAtaB,
          whirlpool: whirlpool.address,
          whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
          orcaPosition: orcaPositionAddress,
          tokenProgramA: mintA.programAddress,
          tokenProgramB: mintB.programAddress,
          memoProgram: MEMO_PROGRAM_ADDRESS,
          metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
          token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
          ...args,
          remainingAccountsInfo,
        })
      : getOpenAndIncreaseTunaLpPositionOrcaInstruction({
          authority,
          tunaConfig: tunaConfig.address,
          mintA: mintA.address,
          mintB: mintB.address,
          market: marketAddress,
          oraclePriceUpdateA: vaultA.data.oraclePriceUpdate,
          oraclePriceUpdateB: vaultB.data.oraclePriceUpdate,
          vaultA: vaultA.address,
          vaultAAta,
          vaultB: vaultB.address,
          vaultBAta,
          tunaPosition: tunaPositionAddress,
          tunaPositionMint: positionMint,
          tunaPositionAta,
          tunaPositionAtaA,
          tunaPositionAtaB,
          tunaPositionOwnerAtaA,
          tunaPositionOwnerAtaB,
          feeRecipientAtaA,
          feeRecipientAtaB,
          whirlpool: whirlpool.address,
          whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
          orcaPosition: orcaPositionAddress,
          tokenProgramA: mintA.programAddress,
          tokenProgramB: mintB.programAddress,
          memoProgram: MEMO_PROGRAM_ADDRESS,
          metadataUpdateAuth: WP_NFT_UPDATE_AUTH,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
          token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
          ...args,
          remainingAccountsInfo,
        });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}

type OpenAndIncreaseTunaLpPositionOrcaInputWithEphemeralSigner<TAccountTunaPositionMint extends string = string> = Omit<
  OpenAndIncreaseTunaLpPositionOrcaInput,
  "tunaPositionMint"
> & {
  tunaPositionMint: Address<TAccountTunaPositionMint>;
};

export function getOpenAndIncreaseTunaLpPositionOrcaInstructionWithEphemeralSigner(
  input: OpenAndIncreaseTunaLpPositionOrcaInputWithEphemeralSigner,
): IInstruction {
  return {
    accounts: [
      {
        address: input.authority.address,
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: input.tunaConfig,
        role: AccountRole.READONLY,
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
        address: input.market,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.vaultA,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.vaultB,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.vaultAAta,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.vaultBAta,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPosition,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPositionMint,
        role: AccountRole.WRITABLE,
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
        address: input.tunaPositionOwnerAtaA,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.tunaPositionOwnerAtaB,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.feeRecipientAtaA,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.feeRecipientAtaB,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.oraclePriceUpdateA,
        role: AccountRole.READONLY,
      },
      {
        address: input.oraclePriceUpdateB,
        role: AccountRole.READONLY,
      },
      {
        address: input.whirlpoolProgram,
        role: AccountRole.READONLY,
      },
      {
        address: input.whirlpool,
        role: AccountRole.WRITABLE,
      },
      {
        address: input.orcaPosition,
        role: AccountRole.WRITABLE,
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
        address: input.metadataUpdateAuth,
        role: AccountRole.READONLY,
      },
      {
        address: input.memoProgram,
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
    data: getOpenAndIncreaseTunaLpPositionOrcaInstructionDataEncoder().encode(
      input as OpenAndIncreaseTunaLpPositionOrcaInstructionDataArgs,
    ),
  };
}
