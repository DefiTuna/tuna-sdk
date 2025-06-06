import { openPositionInstructions as openFusionPositionInstructions } from "@crypticdot/fusionamm-sdk";
import { openPositionInstructions as openOrcaPositionInstructions, setWhirlpoolsConfig } from "@orca-so/whirlpools";
import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { Account, Address } from "@solana/kit";
import { fetchMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import {
  createMarketInstruction,
  CreateMarketInstructionDataArgs,
  createTunaConfigInstruction,
  CreateVaultInstructionDataArgs,
  createVaultInstructions,
  DEFAULT_ADDRESS,
  depositInstruction,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getMarketAddress,
  MarketMaker,
  NATIVE_MINT,
  openLendingPositionInstruction,
} from "../../src";

import { FEE_RECIPIENT_KEYPAIR, LIQUIDATOR_KEYPAIR, TUNA_ADMIN_KEYPAIR } from "./addresses.ts";
import { setupFusionPool, setupFusionPoolsConfig } from "./fusion.ts";
import { rpc, sendTransaction, signer } from "./mockRpc.ts";
import { initializeReward, setupWhirlpool, setupWhirlpoolsConfigAndFeeTiers } from "./orca.ts";
import { setupAta, setupMint } from "./token.ts";
import { setupMintTE } from "./token2022.ts";

export async function setup() {
  const ix = await createTunaConfigInstruction(
    signer,
    TUNA_ADMIN_KEYPAIR.address,
    FEE_RECIPIENT_KEYPAIR.address,
    LIQUIDATOR_KEYPAIR.address,
    signer.address,
  );
  await sendTransaction([ix]);

  // Setup Orca config
  const configAddress = await setupWhirlpoolsConfigAndFeeTiers();
  await setWhirlpoolsConfig(configAddress);

  // Setup Fusion config
  await setupFusionPoolsConfig();
}

export async function setupVault(mint: Account<Mint>, args: CreateVaultInstructionDataArgs) {
  const instructions = await createVaultInstructions(TUNA_ADMIN_KEYPAIR, mint, args);
  await sendTransaction(instructions);

  const vaultAddress = (await getLendingVaultAddress(mint.address))[0];
  const vaultAtaAddress = (
    await findAssociatedTokenPda({
      owner: vaultAddress,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  return {
    vaultAddress,
    vaultAtaAddress,
  };
}

export async function setupMarket(pool: Address, args: CreateMarketInstructionDataArgs) {
  const ix = await createMarketInstruction(TUNA_ADMIN_KEYPAIR, pool, args);
  await sendTransaction([ix]);
  return (await getMarketAddress(pool))[0];
}

export type TestMarket = {
  marketMaker: MarketMaker;
  mintA: Account<Mint>;
  mintB: Account<Mint>;
  rewardMint0?: Account<Mint>;
  rewardMint1?: Account<Mint>;
  ataAAddress: Address;
  ataBAddress: Address;
  pool: Address;
  vaultAAddress: Address;
  vaultBAddress: Address;
  vaultAAtaAddress: Address;
  vaultBAtaAddress: Address;
  lendingPositionAAddress: Address;
  lendingPositionBAddress: Address;
  marketAddress: Address;
};

export async function setupTestMarket(
  args: CreateMarketInstructionDataArgs,
  mintAIsNative = false,
  initializeRewards = false,
): Promise<TestMarket> {
  if (args.marketMaker > 0) assert(!initializeRewards, "Rewards are supported by this liquidity provider");

  const lendingPositionAAmount = 1000_000_000_000n;
  const lendingPositionBAmount = 100000_000_000n;

  const mintAAddress = mintAIsNative ? NATIVE_MINT : await setupMint({ decimals: 9 });
  const mintBAddress = await setupMintTE({ decimals: 6 });

  const mintA = await fetchMint(rpc, mintAAddress);
  const mintB = await fetchMint(rpc, mintBAddress);

  const ataAAddress = await setupAta(mintA, { amount: 10000e9 });
  const ataBAddress = await setupAta(mintB, { amount: 1000000e6 });

  const initialSqrtPrice = priceToSqrtPrice(200.0, 9, 6);

  let poolAddress: Address;

  const initialPositionParams = { liquidity: 1000_000_000_000n };

  if (args.marketMaker == 0) {
    poolAddress = await setupWhirlpool(mintA.address, mintB.address, 64, { initialSqrtPrice });

    if (initializeRewards) {
      const mintCAddress = await setupMintTE({ decimals: 8 });
      const mintC = await fetchMint(rpc, mintCAddress);
      await setupAta(mintC, { amount: 10000e8 });

      await initializeReward(poolAddress, mintCAddress, 0, 100n << 64n);
      await initializeReward(poolAddress, mintBAddress, 1, 100n << 64n);
    }

    // Add initial liquidity to the pool.
    const { instructions } = await openOrcaPositionInstructions(
      rpc,
      poolAddress,
      initialPositionParams,
      20.0,
      2000.0,
      undefined,
      signer,
    );
    await sendTransaction(instructions);
  } else {
    poolAddress = await setupFusionPool(mintA.address, mintB.address, 64, { initialSqrtPrice });

    // Add initial liquidity to the pool.
    const { instructions } = await openFusionPositionInstructions(
      rpc,
      poolAddress,
      initialPositionParams,
      { price: 20.0 },
      { price: 2000.0 },
      undefined,
      signer,
    );
    await sendTransaction(instructions);
  }

  const lendingPositionAAddress = (await getLendingPositionAddress(signer.address, mintA.address))[0];
  const lendingPositionBAddress = (await getLendingPositionAddress(signer.address, mintB.address))[0];

  const vaultA = await setupVault(mintA, {
    pythOracleFeedId: DEFAULT_ADDRESS,
    pythOraclePriceUpdate: DEFAULT_ADDRESS,
    interestRate: 3655890108n,
    supplyLimit: 0n,
  });

  const vaultB = await setupVault(mintB, {
    pythOracleFeedId: DEFAULT_ADDRESS,
    pythOraclePriceUpdate: DEFAULT_ADDRESS,
    interestRate: 3655890108n,
    supplyLimit: 0n,
  });

  await sendTransaction([
    await openLendingPositionInstruction(signer, mintA.address),
    await depositInstruction(signer, mintA, lendingPositionAAmount),
  ]);
  await sendTransaction([
    await openLendingPositionInstruction(signer, mintB.address),
    await depositInstruction(signer, mintB, lendingPositionBAmount),
  ]);

  const marketAddress = (await getMarketAddress(poolAddress))[0];

  await setupMarket(poolAddress, args);

  return {
    marketMaker: args.marketMaker,
    ataAAddress,
    ataBAddress,
    lendingPositionAAddress,
    lendingPositionBAddress,
    marketAddress,
    mintA,
    mintB,
    pool: poolAddress,
    vaultAAddress: vaultA.vaultAddress,
    vaultAAtaAddress: vaultA.vaultAtaAddress,
    vaultBAddress: vaultB.vaultAddress,
    vaultBAtaAddress: vaultB.vaultAtaAddress,
  };
}
