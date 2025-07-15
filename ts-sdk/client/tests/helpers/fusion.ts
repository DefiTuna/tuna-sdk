import {
  fetchFusionPool,
  fetchPosition,
  getFusionPoolAddress,
  getFusionPoolsConfigAddress,
  getInitializeConfigInstruction,
  getInitializePoolInstruction,
  getTickArrayAddress,
  getTokenBadgeAddress,
  getUpdateFeesInstruction,
} from "@crypticdot/fusionamm-client";
import {
  getInitializableTickIndex,
  getTickArrayStartTickIndex,
  tickIndexToSqrtPrice,
} from "@crypticdot/fusionamm-core";
import { swapInstructions } from "@crypticdot/fusionamm-sdk";
import {
  type Address,
  GetAccountInfoApi,
  GetEpochInfoApi,
  GetMinimumBalanceForRentExemptionApi,
  GetMultipleAccountsApi,
  type IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";

import { getNextKeypair } from "./keypair.ts";
import { rpc, sendTransaction, signer } from "./mockRpc.ts";

export async function setupFusionPoolsConfig() {
  const instructions: IInstruction[] = [];

  instructions.push(
    getInitializeConfigInstruction({
      funder: signer,
      fusionPoolsConfig: (await getFusionPoolsConfigAddress())[0],
      tokenBadgeAuthority: signer.address,
      feeAuthority: signer.address,
      collectProtocolFeesAuthority: signer.address,
      defaultProtocolFeeRate: 100,
      defaultClpRewardRate: 0,
      defaultOrderProtocolFeeRate: 100,
    }),
  );

  await sendTransaction(instructions);
}

export async function setupFusionPool(
  tokenA: Address,
  tokenB: Address,
  tickSpacing: number,
  config: { initialSqrtPrice?: bigint } = {},
): Promise<Address> {
  const fusionPoolAddress = await getFusionPoolAddress(tokenA, tokenB, tickSpacing);
  const vaultA = getNextKeypair();
  const vaultB = getNextKeypair();
  const badgeA = await getTokenBadgeAddress(tokenA);
  const badgeB = await getTokenBadgeAddress(tokenB);
  const mintA = await fetchMint(rpc, tokenA);
  const mintB = await fetchMint(rpc, tokenB);
  const programA = mintA.programAddress;
  const programB = mintB.programAddress;
  const fusionPoolsConfig = await getFusionPoolsConfigAddress();

  const sqrtPrice = config.initialSqrtPrice ?? tickIndexToSqrtPrice(0);

  const instructions: IInstruction[] = [];

  instructions.push(
    getInitializePoolInstruction({
      fusionPoolsConfig: fusionPoolsConfig[0],
      fusionPool: fusionPoolAddress[0],
      tokenMintA: tokenA,
      tokenMintB: tokenB,
      funder: signer,
      tokenVaultA: vaultA,
      tokenVaultB: vaultB,
      tokenBadgeA: badgeA[0],
      tokenBadgeB: badgeB[0],
      tokenProgramA: programA,
      tokenProgramB: programB,
      initialSqrtPrice: sqrtPrice,
      feeRate: 300,
      tickSpacing,
    }),
  );

  await sendTransaction(instructions);
  return fusionPoolAddress[0];
}

export async function updateFees(positionAddress: Address) {
  const position = await fetchPosition(rpc, positionAddress);
  const fusionPoolAddress = position.data.fusionPool;
  const whirlpool = await fetchFusionPool(rpc, fusionPoolAddress);

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
    getUpdateFeesInstruction({
      position: positionAddress,
      tickArrayLower: (await getTickArrayAddress(fusionPoolAddress, lowerTickArrayIndex))[0],
      tickArrayUpper: (await getTickArrayAddress(fusionPoolAddress, upperTickArrayIndex))[0],
      fusionPool: fusionPoolAddress,
    }),
  ]);
}

export async function swapExactInputFusion(
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
