import { openPositionInstructions as openFusionPositionInstructions } from "@crypticdot/fusionamm-sdk";
import { openPositionInstructions as openOrcaPositionInstructions, setWhirlpoolsConfig } from "@orca-so/whirlpools";
import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { fetchMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import { Account, Address } from "@solana/kit";
import assert from "assert";

import {
  createMarketInstruction,
  CreateMarketInstructionDataArgs,
  createTunaConfigInstruction,
  CreateVaultInstructionDataArgs,
  createVaultInstructions,
  CreateVaultV2InstructionDataArgs,
  createVaultV2Instructions,
  DEFAULT_ADDRESS,
  depositInstruction,
  fetchMaybeVault,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getLendingVaultV2Address,
  getMarketAddress,
  MarketMaker,
  NATIVE_MINT,
  openLendingPositionInstruction,
  UNLIMITED_SUPPLY_LIMIT,
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
    signer.address,
    TUNA_ADMIN_KEYPAIR.address,
    LIQUIDATOR_KEYPAIR.address,
    FEE_RECIPIENT_KEYPAIR.address,
  );
  await sendTransaction([ix]);

  // Setup Orca config
  const configAddress = await setupWhirlpoolsConfigAndFeeTiers();
  await setWhirlpoolsConfig(configAddress);

  // Setup Fusion config
  await setupFusionPoolsConfig();
}

export async function setupVault(mint: Account<Mint>, args: CreateVaultInstructionDataArgs, skipCreate = false) {
  const address = (await getLendingVaultAddress(mint.address))[0];
  const ataAddress = (
    await findAssociatedTokenPda({
      owner: address,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  if (!skipCreate) {
    const instructions = await createVaultInstructions(TUNA_ADMIN_KEYPAIR, mint, args);
    await sendTransaction(instructions);
  }

  return {
    address,
    ataAddress,
  };
}

export async function setupVaultV2(mint: Account<Mint>, args: CreateVaultV2InstructionDataArgs, skipCreate = false) {
  const address = (await getLendingVaultV2Address(mint.address, args.id))[0];
  const ataAddress = (
    await findAssociatedTokenPda({
      owner: address,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  if (!skipCreate) {
    const instructions = await createVaultV2Instructions(TUNA_ADMIN_KEYPAIR, address, mint, args);
    await sendTransaction(instructions);
  }
  return {
    address,
    ataAddress,
  };
}

export async function setupMarket(
  pool: Address,
  vaultA: Address,
  vaultB: Address,
  args: CreateMarketInstructionDataArgs,
) {
  const ix = await createMarketInstruction(TUNA_ADMIN_KEYPAIR, pool, vaultA, vaultB, args);
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
  marketMaker: MarketMaker,
  mintAIsNative = false,
  initializeRewards?: boolean,
  adaptiveFee?: boolean,
): Promise<TestMarket> {
  if (marketMaker != MarketMaker.Orca)
    assert(!initializeRewards, "Rewards are not supported by this liquidity provider");

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

  if (marketMaker == MarketMaker.Orca) {
    poolAddress = await setupWhirlpool(mintA.address, mintB.address, 64, { initialSqrtPrice, adaptiveFee });

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

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultAAccount = await fetchMaybeVault(rpc, vaultAAddress);

  const vaultA = await setupVault(
    mintA,
    {
      pythOracleFeedId: DEFAULT_ADDRESS,
      pythOraclePriceUpdate: DEFAULT_ADDRESS,
      interestRate: 3655890108n,
      supplyLimit: UNLIMITED_SUPPLY_LIMIT,
      allowUnsafeTokenExtensions: true,
    },
    vaultAAccount.exists,
  );

  if (!vaultAAccount.exists) {
    await sendTransaction([
      await openLendingPositionInstruction(signer, mintA.address),
      await depositInstruction(signer, mintA, undefined, lendingPositionAAmount),
    ]);
  }

  const vaultB = await setupVault(mintB, {
    pythOracleFeedId: DEFAULT_ADDRESS,
    pythOraclePriceUpdate: DEFAULT_ADDRESS,
    interestRate: 3655890108n,
    supplyLimit: UNLIMITED_SUPPLY_LIMIT,
    allowUnsafeTokenExtensions: true,
  });

  await sendTransaction([
    await openLendingPositionInstruction(signer, mintB.address),
    await depositInstruction(signer, mintB, undefined, lendingPositionBAmount),
  ]);

  const marketAddress = (await getMarketAddress(poolAddress))[0];

  await setupMarket(poolAddress, vaultA.address, vaultB.address, args);

  return {
    marketMaker,
    ataAAddress,
    ataBAddress,
    lendingPositionAAddress,
    lendingPositionBAddress,
    marketAddress,
    mintA,
    mintB,
    pool: poolAddress,
    vaultAAddress: vaultA.address,
    vaultAAtaAddress: vaultA.ataAddress,
    vaultBAddress: vaultB.address,
    vaultBAtaAddress: vaultB.ataAddress,
  };
}
