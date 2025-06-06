import {
  fetchAllTickArray,
  fetchMaybeWhirlpool,
  fetchPosition,
  getOracleAddress,
  getPositionAddress,
  getTickArrayAddress,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { collectRewardsQuote, getTickArrayStartTickIndex, getTickIndexInArray } from "@orca-so/whirlpools-core";
import {
  type Account,
  AccountRole,
  Address,
  assertAccountsExist,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import {
  fetchAllMaybeMint,
  findAssociatedTokenPda,
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import assert from "assert";

import {
  AccountsType,
  DEFAULT_ADDRESS,
  fetchAllVault,
  fetchMaybeTunaPosition,
  getCreateAtaInstructions,
  getLendingVaultAddress,
  getMarketAddress,
  getRemoveLiquidityOrcaInstruction,
  getTunaConfigAddress,
  getTunaPositionAddress,
  OrcaUtils,
  RemoveLiquidityOrcaInstructionDataArgs,
  TunaPosition,
  Vault,
} from "../index.ts";

export type RemoveLiquidityOrcaInstructionsArgs = Omit<
  RemoveLiquidityOrcaInstructionDataArgs,
  "remainingAccountsInfo" | "minRemovedAmountA" | "minRemovedAmountB"
> & { maxAmountSlippage: number };

export async function removeLiquidityOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  args: RemoveLiquidityOrcaInstructionsArgs,
  createInstructions?: IInstruction[],
  cleanupInstructions?: IInstruction[],
): Promise<IInstruction[]> {
  const tunaPosition = await fetchMaybeTunaPosition(rpc, (await getTunaPositionAddress(positionMint))[0]);
  if (!tunaPosition.exists) throw new Error("Tuna position account not found");

  const orcaPosition = await fetchPosition(rpc, (await getPositionAddress(positionMint))[0]);

  const whirlpool = await fetchMaybeWhirlpool(rpc, tunaPosition.data.pool);
  if (!whirlpool.exists) throw new Error("Whirlpool account not found");

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(whirlpool.data.tokenMintA))[0],
    (await getLendingVaultAddress(whirlpool.data.tokenMintB))[0],
  ]);

  const [mintA, mintB, ...rewardMints] = await fetchAllMaybeMint(rpc, [
    whirlpool.data.tokenMintA,
    whirlpool.data.tokenMintB,
    ...whirlpool.data.rewardInfos.map(x => x.mint).filter(x => x !== DEFAULT_ADDRESS),
  ]);
  const allMints = [mintA, mintB, ...rewardMints];

  assert(mintA.exists, "Token A account not found");
  assert(mintB.exists, "Token B account not found");
  assertAccountsExist(rewardMints);

  const lowerTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickLowerIndex,
    whirlpool.data.tickSpacing,
  );
  const [lowerTickArrayAddress] = await getTickArrayAddress(whirlpool.address, lowerTickArrayStartIndex);

  const upperTickArrayStartIndex = getTickArrayStartTickIndex(
    tunaPosition.data.tickUpperIndex,
    whirlpool.data.tickSpacing,
  );
  const [upperTickArrayAddress] = await getTickArrayAddress(whirlpool.address, upperTickArrayStartIndex);

  const [lowerTickArray, upperTickArray] = await fetchAllTickArray(rpc, [lowerTickArrayAddress, upperTickArrayAddress]);

  const lowerTick =
    lowerTickArray.data.ticks[
      getTickIndexInArray(tunaPosition.data.tickLowerIndex, lowerTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];
  const upperTick =
    upperTickArray.data.ticks[
      getTickIndexInArray(tunaPosition.data.tickUpperIndex, upperTickArrayStartIndex, whirlpool.data.tickSpacing)
    ];

  //
  // Collect the list of instructions.
  //

  const instructions: IInstruction[] = [];
  if (!createInstructions) createInstructions = instructions;
  if (!cleanupInstructions) cleanupInstructions = instructions;
  const internalCleanupInstructions: IInstruction[] = [];

  //
  // Add token account creation instructions for every mint if needed.
  //

  const rewardsToClaim: number[] = [];
  const requiredMints: Address[] = [];
  requiredMints.push(whirlpool.data.tokenMintA);
  requiredMints.push(whirlpool.data.tokenMintB);

  let currentUnixTimestamp = BigInt(Math.floor(Date.now() / 1000));
  // It may happen in tests or in case of a wrong date.
  if (currentUnixTimestamp < whirlpool.data.rewardLastUpdatedTimestamp)
    currentUnixTimestamp = whirlpool.data.rewardLastUpdatedTimestamp;

  const rewardsQuote = collectRewardsQuote(
    whirlpool.data,
    orcaPosition.data,
    lowerTick,
    upperTick,
    currentUnixTimestamp,
  );

  for (let i = 0; i < rewardsQuote.rewards.length; i++) {
    if (rewardsQuote.rewards[i].rewardsOwed > 0n) {
      requiredMints.push(whirlpool.data.rewardInfos[i].mint);
      rewardsToClaim.push(i);
    }
  }

  for (const mintAddress of requiredMints) {
    const mint = allMints.find(mint => mint.address == mintAddress);
    assert(mint && mint.exists);

    const ixs = await getCreateAtaInstructions(rpc, authority, mint.address, authority.address, mint.programAddress);

    createInstructions.push(...ixs.init);
    internalCleanupInstructions.push(...ixs.cleanup);
  }

  //
  // Finally add liquidity decrease instruction.
  //

  const ix = await removeLiquidityOrcaInstruction(
    authority,
    tunaPosition,
    mintA,
    mintB,
    vaultA,
    vaultB,
    whirlpool,
    rewardsToClaim,
    rewardMints,
    // TODO: Compute minRemovedAmounts according to slippage
    { ...args, minRemovedAmountA: 0, minRemovedAmountB: 0 },
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  cleanupInstructions.push(...internalCleanupInstructions);

  return instructions;
}

export async function removeLiquidityOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultA: Account<Vault>,
  vaultB: Account<Vault>,
  whirlpool: Account<Whirlpool>,
  rewardIndicesToClaim: number[],
  rewardMints: Account<Mint>[],
  args: Omit<RemoveLiquidityOrcaInstructionDataArgs, "remainingAccountsInfo">,
): Promise<IInstruction> {
  const positionMint = tunaPosition.data.positionMint;

  const tunaConfig = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: positionMint,
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
      owner: tunaPosition.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
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

  const swapTickArrays = await OrcaUtils.getSwapTickArrayAddresses(whirlpool);
  const lowerTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickLowerIndex,
  );
  const upperTickArrayAddress = await OrcaUtils.getTickArrayAddressFromTickIndex(
    whirlpool,
    tunaPosition.data.tickUpperIndex,
  );

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

  for (const rewardIndex of rewardIndicesToClaim) {
    const rewardInfo = whirlpool.data.rewardInfos[rewardIndex];
    const rewardMint = rewardMints.find(mint => mint.address == rewardInfo.mint);
    assert(rewardMint, "Reward mint not found in the provided reward mint accounts");

    const ownerAta = await findAssociatedTokenPda({
      owner: authority.address,
      mint: rewardMint.address,
      tokenProgram: rewardMint.programAddress,
    });

    remainingAccounts.push({ address: rewardMint.address, role: AccountRole.READONLY });
    remainingAccounts.push({ address: rewardMint.programAddress, role: AccountRole.READONLY });
    remainingAccounts.push({ address: ownerAta[0], role: AccountRole.WRITABLE });
    remainingAccounts.push({ address: rewardInfo.vault, role: AccountRole.WRITABLE });
  }

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
  if (rewardIndicesToClaim.length > 0) {
    remainingAccountsInfo.slices.push({ accountsType: AccountsType.Rewards, length: 4 * rewardIndicesToClaim.length });
  }

  const ix = getRemoveLiquidityOrcaInstruction({
    market: marketAddress,
    mintA: mintA.address,
    mintB: mintB.address,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    authority,
    tunaConfig,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    tokenProgramA: mintA.programAddress,
    tokenProgramB: mintB.programAddress,
    memoProgram: MEMO_PROGRAM_ADDRESS,
    ...args,
    remainingAccountsInfo,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
