import { openPositionInstructions as openFusionPositionInstructions } from "@crypticdot/fusionamm-sdk";
import { openPositionInstructions as openOrcaPositionInstructions, setWhirlpoolsConfig } from "@orca-so/whirlpools";
import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { Account, Address, generateKeyPairSigner } from "@solana/kit";
import { fetchMint, findAssociatedTokenPda, Mint } from "@solana-program/token-2022";
import assert from "assert";

import {
  createMarketInstruction,
  CreateMarketInstructionDataArgs,
  createMarketPermissionlessInstruction,
  CreateMarketPermissionlessInstructionDataArgs,
  createTunaConfigInstruction,
  CreateVaultInstructionDataArgs,
  createVaultInstructions,
  CreateVaultPermissionlessInstructionDataArgs,
  createVaultPermissionlessInstructions,
  DEFAULT_ADDRESS,
  depositInstruction,
  fetchMaybeVault,
  getCreatePriceUpdateInstruction,
  getLendingPositionAddress,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaPriceUpdateAddress,
  getUpdateMarketInstruction,
  MarketMaker,
  NATIVE_MINT,
  openLendingPositionInstruction,
  openLendingPositionV2Instruction,
  UNLIMITED_SUPPLY_LIMIT,
} from "../../src";

import {
  FEE_RECIPIENT_KEYPAIR,
  LIQUIDATOR_KEYPAIR,
  TUNA_ADMIN_KEYPAIR,
  TUNA_ORACLE_PRICE_UPDATE_KEYPAIR,
} from "./addresses.ts";
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
    TUNA_ORACLE_PRICE_UPDATE_KEYPAIR.address,
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

    if (args.oraclePriceUpdate != DEFAULT_ADDRESS) {
      const ix = getCreatePriceUpdateInstruction({
        authority: TUNA_ORACLE_PRICE_UPDATE_KEYPAIR,
        mint: mint.address,
        priceUpdate: args.oraclePriceUpdate,
        tunaConfig: (await getTunaConfigAddress())[0],
      });
      await sendTransaction([ix]);
    }
  }

  return {
    address,
    ataAddress,
  };
}

export async function setupVaultPermissionless(
  mint: Account<Mint>,
  args: CreateVaultPermissionlessInstructionDataArgs,
  skipCreate = false,
) {
  const address = (await getLendingVaultAddress(mint.address, args.market))[0];
  const ataAddress = (
    await findAssociatedTokenPda({
      owner: address,
      mint: mint.address,
      tokenProgram: mint.programAddress,
    })
  )[0];

  if (!skipCreate) {
    const instructions = await createVaultPermissionlessInstructions(TUNA_ADMIN_KEYPAIR, address, mint, args);
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

export async function setupMarketPermissionless(
  pool: Address,
  vaultA: Address,
  vaultB: Address,
  args: CreateMarketPermissionlessInstructionDataArgs,
) {
  const ix = await createMarketPermissionlessInstruction(TUNA_ADMIN_KEYPAIR, pool, vaultA, vaultB, args);
  await sendTransaction([ix]);
  return (await getMarketAddress(pool))[0];
}

export type TestMarket = {
  name: String;
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

export type TestMarketOptions = {
  mintAIsNative?: boolean;
  initializeRewards?: boolean;
  adaptiveFee?: boolean;
  enableTunaOracle?: boolean;
  permissionless?: boolean;
};

export async function setupTestMarket(
  args: CreateMarketInstructionDataArgs,
  marketMaker: MarketMaker,
  options?: TestMarketOptions,
): Promise<TestMarket> {
  if (marketMaker != MarketMaker.Orca)
    assert(!options?.initializeRewards, "Rewards are not supported by this liquidity provider");

  const tunaConfigAddress = (await getTunaConfigAddress())[0];

  const lendingPositionAAmount = 1000_000_000_000n;
  const lendingPositionBAmount = 100000_000_000n;

  const mintAAddress = options?.mintAIsNative ? NATIVE_MINT : await setupMint({ decimals: 9 });
  const mintBAddress = await setupMintTE({ decimals: 6 });

  const mintA = await fetchMint(rpc, mintAAddress);
  const mintB = await fetchMint(rpc, mintBAddress);

  const ataAAddress = await setupAta(mintA, { amount: 10000e9 });
  const ataBAddress = await setupAta(mintB, { amount: 1000000e6 });

  const initialSqrtPrice = priceToSqrtPrice(200.0, 9, 6);

  let poolAddress: Address;

  const initialPositionParams = { liquidity: 1000_000_000_000n };

  if (marketMaker == MarketMaker.Orca) {
    poolAddress = await setupWhirlpool(mintA.address, mintB.address, 64, {
      initialSqrtPrice,
      adaptiveFee: options?.adaptiveFee,
    });

    if (options?.initializeRewards) {
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
      await generateKeyPairSigner(),
      poolAddress,
      initialPositionParams,
      { price: 20.0 },
      { price: 2000.0 },
      undefined,
      signer,
    );
    await sendTransaction(instructions);
  }

  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const permissionlessMarket = options?.permissionless ? marketAddress : undefined;

  const vaultAAddress = (await getLendingVaultAddress(mintA.address, permissionlessMarket))[0];
  const vaultAAccount = await fetchMaybeVault(rpc, vaultAAddress);

  const vaultBAddress = (await getLendingVaultAddress(mintB.address, permissionlessMarket))[0];
  const vaultBAccount = await fetchMaybeVault(rpc, vaultBAddress);

  const oraclePriceUpdateA = (await getTunaPriceUpdateAddress(mintA.address))[0];
  const oraclePriceUpdateB = (await getTunaPriceUpdateAddress(mintB.address))[0];

  const lendingPositionAAddress = (await getLendingPositionAddress(signer.address, mintA.address))[0];
  const lendingPositionBAddress = (await getLendingPositionAddress(signer.address, mintB.address))[0];

  const vaultA = options?.permissionless
    ? await setupVaultPermissionless(
        mintA,
        {
          market: marketAddress,
          interestRate: 3655890108n,
        },
        vaultAAccount.exists,
      )
    : await setupVault(
        mintA,
        {
          pythOracleFeedId: DEFAULT_ADDRESS,
          oraclePriceUpdate: options?.enableTunaOracle ? oraclePriceUpdateA : DEFAULT_ADDRESS,
          interestRate: 3655890108n,
          supplyLimit: UNLIMITED_SUPPLY_LIMIT,
          allowUnsafeTokenExtensions: true,
        },
        vaultAAccount.exists,
      );

  if (!vaultAAccount.exists) {
    await sendTransaction([
      options?.permissionless
        ? await openLendingPositionV2Instruction(signer, mintA.address, vaultAAddress)
        : await openLendingPositionInstruction(signer, mintA.address),
      await depositInstruction(signer, mintA, permissionlessMarket ? vaultAAddress : undefined, lendingPositionAAmount),
    ]);
  }

  const vaultB = options?.permissionless
    ? await setupVaultPermissionless(
        mintB,
        {
          market: marketAddress,
          interestRate: 3655890108n,
        },
        vaultBAccount.exists,
      )
    : await setupVault(mintB, {
        pythOracleFeedId: DEFAULT_ADDRESS,
        oraclePriceUpdate: options?.enableTunaOracle ? oraclePriceUpdateB : DEFAULT_ADDRESS,
        interestRate: 3655890108n,
        supplyLimit: UNLIMITED_SUPPLY_LIMIT,
        allowUnsafeTokenExtensions: true,
      });

  await sendTransaction([
    options?.permissionless
      ? await openLendingPositionV2Instruction(signer, mintB.address, vaultBAddress)
      : await openLendingPositionInstruction(signer, mintB.address),
    await depositInstruction(signer, mintB, permissionlessMarket ? vaultBAddress : undefined, lendingPositionBAmount),
  ]);

  if (permissionlessMarket) {
    await setupMarketPermissionless(poolAddress, vaultA.address, vaultB.address, args);

    // Updated permissionless market with ADMIN authority
    const ix = getUpdateMarketInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress,
      market: marketAddress,
      addressLookupTable: args.addressLookupTable,
      disabled: args.disabled,
      maxLeverage: args.maxLeverage,
      protocolFee: args.protocolFee,
      protocolFeeOnCollateral: args.protocolFeeOnCollateral,
      liquidationFee: args.liquidationFee,
      liquidationThreshold: args.liquidationThreshold,
      oraclePriceDeviationThreshold: args.oraclePriceDeviationThreshold,
      borrowLimitA: args.borrowLimitA,
      borrowLimitB: args.borrowLimitB,
      maxSwapSlippage: args.maxSwapSlippage,
      rebalanceProtocolFee: args.rebalanceProtocolFee,
      spotPositionSizeLimitA: args.spotPositionSizeLimitA,
      spotPositionSizeLimitB: args.spotPositionSizeLimitB,
    });
    await sendTransaction([ix]);
  } else {
    await setupMarket(poolAddress, vaultA.address, vaultB.address, args);
  }

  const name = marketMaker == MarketMaker.Orca ? "Orca" : permissionlessMarket ? "Fusion Isolated" : "Fusion";

  return {
    name,
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
