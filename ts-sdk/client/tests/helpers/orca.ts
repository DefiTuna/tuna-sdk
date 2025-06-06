import {
  getInitializableTickIndex,
  getTickArrayStartTickIndex,
  increaseLiquidityQuote,
  tickIndexToSqrtPrice,
} from "@orca-so/whirlpools-core";
import {
  fetchAllMaybeTickArray,
  fetchPosition,
  fetchWhirlpool,
  getFeeTierAddress,
  getIncreaseLiquidityV2Instruction,
  getInitializeConfigInstruction,
  getInitializeFeeTierInstruction,
  getInitializePoolV2Instruction,
  getInitializeRewardV2Instruction,
  getInitializeTickArrayInstruction,
  getOpenPositionInstruction,
  getOpenPositionWithTokenExtensionsInstruction,
  getPositionAddress,
  getSetRewardEmissionsV2Instruction,
  getTickArrayAddress,
  getTokenBadgeAddress,
  getUpdateFeesAndRewardsInstruction,
  getWhirlpoolAddress,
} from "@orca-so/whirlpools-client";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  findAssociatedTokenPda,
  getMintToInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import {
  address,
  type Address,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  GetMultipleAccountsApi,
  type IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { getNextKeypair } from "./keypair.ts";
import { rpc, sendTransaction, signer } from "./mockRpc.ts";
import { SPLASH_POOL_TICK_SPACING, swapInstructions, WHIRLPOOLS_CONFIG_ADDRESS } from "@orca-so/whirlpools";

export async function setupWhirlpoolsConfigAndFeeTiers(): Promise<Address> {
  const keypair = getNextKeypair();
  const instructions: IInstruction[] = [];

  instructions.push(
    getInitializeConfigInstruction({
      systemProgram: undefined,
      config: keypair,
      funder: signer,
      feeAuthority: signer.address,
      collectProtocolFeesAuthority: signer.address,
      rewardEmissionsSuperAuthority: signer.address,
      defaultProtocolFeeRate: 100,
    }),
  );

  const defaultFeeTierPda = await getFeeTierAddress(keypair.address, 128);
  instructions.push(
    getInitializeFeeTierInstruction({
      config: keypair.address,
      feeTier: defaultFeeTierPda[0],
      funder: signer,
      feeAuthority: signer,
      tickSpacing: 128,
      defaultFeeRate: 1000,
    }),
  );

  const concentratedFeeTierPda = await getFeeTierAddress(keypair.address, 64);
  instructions.push(
    getInitializeFeeTierInstruction({
      config: keypair.address,
      feeTier: concentratedFeeTierPda[0],
      funder: signer,
      feeAuthority: signer,
      tickSpacing: 64,
      defaultFeeRate: 300,
    }),
  );

  const splashFeeTierPda = await getFeeTierAddress(keypair.address, SPLASH_POOL_TICK_SPACING);
  instructions.push(
    getInitializeFeeTierInstruction({
      config: keypair.address,
      feeTier: splashFeeTierPda[0],
      funder: signer,
      feeAuthority: signer,
      tickSpacing: SPLASH_POOL_TICK_SPACING,
      defaultFeeRate: 1000,
    }),
  );

  await sendTransaction(instructions);
  return keypair.address;
}

export async function setupWhirlpool(
  tokenA: Address,
  tokenB: Address,
  tickSpacing: number,
  config: { initialSqrtPrice?: bigint } = {},
): Promise<Address> {
  const feeTierAddress = await getFeeTierAddress(WHIRLPOOLS_CONFIG_ADDRESS, tickSpacing);
  const whirlpoolAddress = await getWhirlpoolAddress(WHIRLPOOLS_CONFIG_ADDRESS, tokenA, tokenB, tickSpacing);
  const vaultA = getNextKeypair();
  const vaultB = getNextKeypair();
  const badgeA = await getTokenBadgeAddress(WHIRLPOOLS_CONFIG_ADDRESS, tokenA);
  const badgeB = await getTokenBadgeAddress(WHIRLPOOLS_CONFIG_ADDRESS, tokenB);
  const mintA = await fetchMint(rpc, tokenA);
  const mintB = await fetchMint(rpc, tokenB);
  const programA = mintA.programAddress;
  const programB = mintB.programAddress;

  const sqrtPrice = config.initialSqrtPrice ?? tickIndexToSqrtPrice(0);

  const instructions: IInstruction[] = [];

  instructions.push(
    getInitializePoolV2Instruction({
      whirlpool: whirlpoolAddress[0],
      feeTier: feeTierAddress[0],
      tokenMintA: tokenA,
      tokenMintB: tokenB,
      tickSpacing,
      whirlpoolsConfig: WHIRLPOOLS_CONFIG_ADDRESS,
      funder: signer,
      tokenVaultA: vaultA,
      tokenVaultB: vaultB,
      tokenBadgeA: badgeA[0],
      tokenBadgeB: badgeB[0],
      tokenProgramA: programA,
      tokenProgramB: programB,
      initialSqrtPrice: sqrtPrice,
    }),
  );

  await sendTransaction(instructions);
  return whirlpoolAddress[0];
}

export async function initializeReward(
  whirlpool: Address,
  rewardMintAddress: Address,
  rewardIndex: number,
  emissionsPerSecondX64: bigint,
) {
  const rewardMint = await fetchMint(rpc, rewardMintAddress);
  const rewardVault = getNextKeypair();
  const rewardTokenBadge = await getTokenBadgeAddress(WHIRLPOOLS_CONFIG_ADDRESS, rewardMintAddress);

  const instructions: IInstruction[] = [];
  instructions.push(
    getInitializeRewardV2Instruction({
      funder: signer,
      rewardAuthority: signer,
      rewardIndex,
      rewardMint: rewardMintAddress,
      rewardTokenBadge: rewardTokenBadge[0],
      rewardTokenProgram: rewardMint.programAddress,
      rewardVault,
      whirlpool,
    }),
  );

  instructions.push(
    getMintToInstruction(
      {
        mint: rewardMint.address,
        token: rewardVault.address,
        mintAuthority: signer,
        amount: (emissionsPerSecondX64 * 3600n * 24n) >> 64n,
      },
      { programAddress: rewardMint.programAddress },
    ),
  );

  instructions.push(
    getSetRewardEmissionsV2Instruction({
      emissionsPerSecondX64,
      rewardVault: rewardVault.address,
      rewardAuthority: signer,
      rewardIndex,
      whirlpool,
    }),
  );

  await sendTransaction(instructions);
}

export async function updateFeesAndRewards(positionAddress: Address) {
  const position = await fetchPosition(rpc, positionAddress);
  const whirlpoolAddress = position.data.whirlpool;
  const whirlpool = await fetchWhirlpool(rpc, whirlpoolAddress);

  const initializableLowerTickIndex = getInitializableTickIndex(
    position.data.tickLowerIndex,
    whirlpool.data.tickSpacing,
    false,
  );
  const initializableUpperTickIndex = getInitializableTickIndex(
    position.data.tickUpperIndex,
    whirlpool.data.tickSpacing,
    true,
  );

  const lowerTickArrayIndex = getTickArrayStartTickIndex(initializableLowerTickIndex, whirlpool.data.tickSpacing);
  const upperTickArrayIndex = getTickArrayStartTickIndex(initializableUpperTickIndex, whirlpool.data.tickSpacing);

  await sendTransaction([
    getUpdateFeesAndRewardsInstruction({
      position: positionAddress,
      tickArrayLower: (await getTickArrayAddress(whirlpoolAddress, lowerTickArrayIndex))[0],
      tickArrayUpper: (await getTickArrayAddress(whirlpoolAddress, upperTickArrayIndex))[0],
      whirlpool: whirlpoolAddress,
    }),
  ]);
}

export async function swapExactInputOrca(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi & GetMinimumBalanceForRentExemptionApi & GetEpochInfoApi>,
  signer: TransactionSigner,
  pool: Address,
  inputAmount: bigint,
  mint: Address,
  slippageToleranceBps?: number | undefined,
) {
  const { instructions } = await swapInstructions(
    rpc,
    {
      inputAmount,
      mint,
    },
    pool,
    slippageToleranceBps,
    signer,
  );
  await sendTransaction(instructions);
}
