import { calculateTunaSpotPositionProtocolFee } from "@crypticdot/defituna-core";
import { fetchFusionPool, FUSIONAMM_PROGRAM_ADDRESS, FusionPool } from "@crypticdot/fusionamm-client";
import { fetchTickArrayOrDefault } from "@crypticdot/fusionamm-sdk";
import {
  DefiTunaAccountsType,
  getRouteV2Instruction,
  JUPITER_PROGRAM_ADDRESS,
  RouteV2InstructionDataArgs,
} from "@crypticdot/jupiter-solana-client";
import {
  Account,
  AccountRole,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IAccountMeta,
  Rpc,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import { beforeEach, describe, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  fetchMarket,
  fetchTunaSpotPosition,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  HUNDRED_PERCENTn,
  JUPITER_EVENT_AUTHORITY,
  LEVERAGE_ONE,
  MarketMaker,
  mulDiv,
  PoolToken,
} from "../src";

import { LIQUIDATOR_KEYPAIR } from "./helpers/addresses.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { assertLiquidateTunaSpotPosition } from "./helpers/liquidateTunaSpotPosition.ts";
import { liquidateTunaSpotPositionJupiter } from "./helpers/liquidateTunaSpotPositionJupiter.ts";
import { rpc, signer } from "./helpers/mockRpc.ts";
import { assertModifyTunaSpotPosition, modifyTunaSpotPosition } from "./helpers/modifyTunaSpotPosition.ts";
import { modifyTunaSpotPositionJupiter } from "./helpers/modifyTunaSpotPositionJupiter.ts";
import { openAndIncreaseTunaSpotPositionJupiter } from "./helpers/openAndIncreaseTunaSpotPositionJupiter.ts";
import { openTunaSpotPosition } from "./helpers/openTunaSpotPosition.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";
import { swapExactInput } from "./helpers/swap.ts";

describe("Tuna Spot Position Jupiter", () => {
  let market: TestMarket;

  beforeEach(async () => {
    const marketArgs = {
      addressLookupTable: DEFAULT_ADDRESS,
      borrowLimitA: 0n,
      borrowLimitB: 0n,
      disabled: false,
      liquidationFee: 100000, // 10%
      liquidationThreshold: 850000, // 85%
      maxLeverage: (LEVERAGE_ONE * 520) / 100,
      maxSwapSlippage: 0,
      oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      spotPositionSizeLimitA: 1000_000_000_000,
      spotPositionSizeLimitB: 100000_000_000,
    };
    market = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);
  });

  const getRouteAccounts = async (
    rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
    fusionPool: Account<FusionPool>,
    tunaPositionAddress: Address,
    tunaPositionAtaA: Address,
    tunaPositionAtaB: Address,
  ): Promise<IAccountMeta[]> => {
    const tickArrays = await fetchTickArrayOrDefault(rpc, fusionPool);

    // Fusion AMM program address
    return [
      { address: FUSIONAMM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      // tokenProgramA
      { address: market.mintA.programAddress, role: AccountRole.READONLY },
      // tokenProgramB
      { address: market.mintB.programAddress, role: AccountRole.READONLY },
      // memoProgram
      { address: MEMO_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      // tokenAuthority
      { address: tunaPositionAddress, role: AccountRole.READONLY },
      // fusionPool
      { address: fusionPool.address, role: AccountRole.WRITABLE },
      // tokenMintA
      { address: fusionPool.data.tokenMintA, role: AccountRole.READONLY },
      // tokenMintB
      { address: fusionPool.data.tokenMintB, role: AccountRole.READONLY },
      // tokenOwnerAccountA
      //{ address: authorityAtaA, role: AccountRole.WRITABLE },
      { address: tunaPositionAtaA, role: AccountRole.WRITABLE },
      // tokenOwnerAccountB
      { address: tunaPositionAtaB, role: AccountRole.WRITABLE },
      // tokenVaultA
      { address: fusionPool.data.tokenVaultA, role: AccountRole.WRITABLE },
      // tokenVaultB
      { address: fusionPool.data.tokenVaultB, role: AccountRole.WRITABLE },
      // tickArray0
      { address: tickArrays[0].address, role: AccountRole.WRITABLE },
      // tickArray1: TAccountMetas[12];
      { address: tickArrays[1].address, role: AccountRole.WRITABLE },
      // tickArray2: TAccountMetas[13];
      { address: tickArrays[2].address, role: AccountRole.WRITABLE },
      // remaining account 0
      { address: tickArrays[3].address, role: AccountRole.WRITABLE },
      // remaining account 1
      { address: tickArrays[4].address, role: AccountRole.WRITABLE },
    ];
  };

  it(`Open a LONG position providing token A as collateral, increase, decrease and close it`, async () => {
    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, market.pool))[0];

    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintA.address,
        tokenProgram: market.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintB.address,
        tokenProgram: market.mintB.programAddress,
      })
    )[0];

    await openTunaSpotPosition({
      rpc,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
      pool: market.pool,
    });

    const collateralAmount = 1_000_000_000n;
    const borrowAmount = 200_000_000n;

    const marketAccount = await fetchMarket(rpc, market.marketAddress);
    const protocolFee = calculateTunaSpotPositionProtocolFee(
      PoolToken.A,
      PoolToken.B,
      collateralAmount,
      borrowAmount,
      marketAccount.data.protocolFee,
      marketAccount.data.protocolFeeOnCollateral,
    );
    const swapAmountIn = borrowAmount - protocolFee.b;
    //const quotedOutAmount = 1995617984n;
    const quotedOutAmount = 0n;

    let args: RouteV2InstructionDataArgs = {
      inAmount: swapAmountIn,
      quotedOutAmount,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: false,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // B->A swap
    let routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaA,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintB.address,
      sourceTokenProgram: market.mintB.programAddress,
      userSourceTokenAccount: tunaPositionAtaB,
      destinationMint: market.mintA.address,
      userDestinationTokenAccount: tunaPositionAtaA,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    let fusionPool = await fetchFusionPool(rpc, market.pool);

    let routeAccounts = await getRouteAccounts(
      rpc,
      fusionPool,
      tunaPositionAddress,
      tunaPositionAtaA,
      tunaPositionAtaB,
    );
    routeInstruction.accounts.push(...routeAccounts);

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPositionJupiter({
        rpc,
        pool: market.pool,
        decreasePercent: 0,
        collateralAmount,
        borrowAmount,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
      }),
      { amountA: 1997254447n, amountB: 0n },
    );

    //const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
    const decreasePercent = HUNDRED_PERCENT / 2;

    args = {
      inAmount: 500_000_000n,
      quotedOutAmount: 0,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: true,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // A->B swap
    routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaB,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintA.address,
      sourceTokenProgram: market.mintA.programAddress,
      userSourceTokenAccount: tunaPositionAtaA,
      destinationMint: market.mintB.address,
      userDestinationTokenAccount: tunaPositionAtaB,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    fusionPool = await fetchFusionPool(rpc, market.pool);

    routeAccounts = await getRouteAccounts(rpc, fusionPool, tunaPositionAddress, tunaPositionAtaA, tunaPositionAtaB);
    routeInstruction.accounts.push(...routeAccounts);

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPositionJupiter({
        rpc,
        pool: market.pool,
        decreasePercent,
        collateralAmount: 0n,
        borrowAmount: 0n,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
      }),
      {
        amountA: 998_627_223n,
        amountB: 0n,
        userBalanceDeltaA: 498_627_224n,
        userBalanceDeltaB: 0n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 100_036_947n,
      },
    );
  });

  /*
  it(`Open and increase a LONG position providing token B as collateral, decrease and close it`, async () => {
    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, market.pool))[0];

    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintA.address,
        tokenProgram: market.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintB.address,
        tokenProgram: market.mintB.programAddress,
      })
    )[0];

    const collateralAmount = 200_000_000n;
    const borrowAmount = 400_000_000n;

    const marketAccount = await fetchMarket(rpc, market.marketAddress);
    const protocolFee = calculateTunaSpotPositionProtocolFee(
      PoolToken.B,
      PoolToken.B,
      collateralAmount,
      borrowAmount,
      marketAccount.data.protocolFee,
      marketAccount.data.protocolFeeOnCollateral,
    );
    let swapAmountIn = collateralAmount + borrowAmount - protocolFee.b;
    const quotedOutAmount = 0n;

    let args: RouteV2InstructionDataArgs = {
      inAmount: swapAmountIn,
      quotedOutAmount,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: false,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // B->A swap
    let routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaA,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintB.address,
      sourceTokenProgram: market.mintB.programAddress,
      userSourceTokenAccount: tunaPositionAtaB,
      destinationMint: market.mintA.address,
      userDestinationTokenAccount: tunaPositionAtaA,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    let fusionPool = await fetchFusionPool(rpc, market.pool);
    let routeAccounts = await getRouteAccounts(
      rpc,
      fusionPool,
      tunaPositionAddress,
      tunaPositionAtaA,
      tunaPositionAtaB,
    );
    routeInstruction.accounts.push(...routeAccounts);

    assertModifyTunaSpotPosition(
      await openAndIncreaseTunaSpotPositionJupiter({
        rpc,
        pool: market.pool,
        positionToken: PoolToken.A,
        collateralToken: PoolToken.B,
        collateralAmount,
        borrowAmount,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
      }),
      { amountA: 2992091804n, amountB: 0n },
    );

    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
    const decreasePercent = HUNDRED_PERCENT / 2;

    const newPositionAmount = mulDiv(
      tunaPosition.data.amount,
      BigInt(HUNDRED_PERCENT - decreasePercent),
      HUNDRED_PERCENTn,
      false,
    );

    swapAmountIn = tunaPosition.data.amount - newPositionAmount;

    args = {
      inAmount: swapAmountIn,
      quotedOutAmount: 0,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: true,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // A->B swap
    routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaB,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintA.address,
      sourceTokenProgram: market.mintA.programAddress,
      userSourceTokenAccount: tunaPositionAtaA,
      destinationMint: market.mintB.address,
      userDestinationTokenAccount: tunaPositionAtaB,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    fusionPool = await fetchFusionPool(rpc, market.pool);

    routeAccounts = await getRouteAccounts(rpc, fusionPool, tunaPositionAddress, tunaPositionAtaA, tunaPositionAtaB);
    routeInstruction.accounts.push(...routeAccounts);

    assertModifyTunaSpotPosition(
      await modifyTunaSpotPositionJupiter({
        rpc,
        pool: market.pool,
        decreasePercent,
        collateralAmount: 0n,
        borrowAmount: 0n,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
      }),
      {
        amountA: 1_496_045_902n,
        amountB: 0n,
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: 99_720_795n,
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 200_000_000n,
      },
    );
  });

  it(`Liquidates a LONG position (collateral A) due to an unhealthy state (no bad debt)`, async () => {
    const pool = await fetchPool(rpc, market.pool, market.marketMaker);
    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];
    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintA.address,
        tokenProgram: market.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintB.address,
        tokenProgram: market.mintB.programAddress,
      })
    )[0];

    await openTunaSpotPosition({
      rpc,
      pool: market.pool,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
    });

    await modifyTunaSpotPosition({
      rpc,
      pool: market.pool,
      collateralAmount: 1_000_000_000n,
      borrowAmount: 800_000_000n,
    });

    // Significantly move the price.
    await swapExactInput(rpc, signer, pool.address, 70000_000_000n, pool.data.tokenMintA);

    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

    const swapInAmount = tunaPosition.data.amount - 737_700_000n;

    const args: RouteV2InstructionDataArgs = {
      inAmount: swapInAmount,
      quotedOutAmount: 0,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: true,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // A->B swap
    const routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaB,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintA.address,
      sourceTokenProgram: market.mintA.programAddress,
      userSourceTokenAccount: tunaPositionAtaA,
      destinationMint: market.mintB.address,
      userDestinationTokenAccount: tunaPositionAtaB,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    const fusionPool = await fetchFusionPool(rpc, market.pool);

    const routeAccounts = await getRouteAccounts(
      rpc,
      fusionPool,
      tunaPositionAddress,
      tunaPositionAtaA,
      tunaPositionAtaB,
      //authorityAtaB,
    );
    routeInstruction.accounts.push(...routeAccounts);

    assertLiquidateTunaSpotPosition(
      await liquidateTunaSpotPositionJupiter({
        rpc,
        signer: LIQUIDATOR_KEYPAIR,
        tunaPositionAddress,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
        intermediateTokenAccountsAndPrograms: [],
      }),
      {
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 800000000n,
        badDebtDeltaA: 0n,
        badDebtDeltaB: 0n,
        userBalanceDeltaA: 239032291n,
        userBalanceDeltaB: 56131n,
        feeRecipientBalanceDelta: 498667709n,
      },
    );
  });

  it(`Partially liquidates a LONG position (collateral A) due to an unhealthy state (no bad debt)`, async () => {
    const pool = await fetchPool(rpc, market.pool, market.marketMaker);
    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];
    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintA.address,
        tokenProgram: market.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintB.address,
        tokenProgram: market.mintB.programAddress,
      })
    )[0];

    await openTunaSpotPosition({
      rpc,
      pool: market.pool,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.A,
    });

    await modifyTunaSpotPosition({
      rpc,
      pool: market.pool,
      collateralAmount: 1_000_000_000n,
      borrowAmount: 800_000_000n,
    });

    // Significantly move the price.
    await swapExactInput(rpc, signer, pool.address, 70000_000_000n, pool.data.tokenMintA);

    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

    const swapInAmount = tunaPosition.data.amount / 2n - 370_600_000n;

    const args: RouteV2InstructionDataArgs = {
      inAmount: swapInAmount,
      quotedOutAmount: 0,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: true,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // A->B swap
    const routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaB,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintA.address,
      sourceTokenProgram: market.mintA.programAddress,
      userSourceTokenAccount: tunaPositionAtaA,
      destinationMint: market.mintB.address,
      userDestinationTokenAccount: tunaPositionAtaB,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    const fusionPool = await fetchFusionPool(rpc, market.pool);

    const routeAccounts = await getRouteAccounts(
      rpc,
      fusionPool,
      tunaPositionAddress,
      tunaPositionAtaA,
      tunaPositionAtaB,
    );
    routeInstruction.accounts.push(...routeAccounts);

    assertLiquidateTunaSpotPosition(
      await liquidateTunaSpotPositionJupiter({
        rpc,
        signer: LIQUIDATOR_KEYPAIR,
        tunaPositionAddress,
        decreasePercent: HUNDRED_PERCENT / 2,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
        intermediateTokenAccountsAndPrograms: [],
      }),
      {
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 400000000n,
        badDebtDeltaA: 0n,
        badDebtDeltaB: 0n,
        userBalanceDeltaA: 121266147n,
        userBalanceDeltaB: 67272n,
        feeRecipientBalanceDelta: 249333854n,
      },
    );
  });

  it(`Liquidates a LONG position (collateral B) due to an unhealthy state (no bad debt)`, async () => {
    const pool = await fetchPool(rpc, market.pool, market.marketMaker);
    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, pool.address))[0];
    const tunaPositionAtaA = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintA.address,
        tokenProgram: market.mintA.programAddress,
      })
    )[0];

    const tunaPositionAtaB = (
      await findAssociatedTokenPda({
        owner: tunaPositionAddress,
        mint: market.mintB.address,
        tokenProgram: market.mintB.programAddress,
      })
    )[0];

    await openTunaSpotPosition({
      rpc,
      pool: market.pool,
      positionToken: PoolToken.A,
      collateralToken: PoolToken.B,
    });

    await modifyTunaSpotPosition({
      rpc,
      pool: market.pool,
      collateralAmount: 200_000_000n,
      borrowAmount: 800_000_000n,
    });

    // Significantly move the price.
    await swapExactInput(rpc, signer, pool.address, 70000_000_000n, pool.data.tokenMintA);

    const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);

    const swapInAmount = tunaPosition.data.amount - 450_000_000n;

    const args: RouteV2InstructionDataArgs = {
      inAmount: swapInAmount,
      quotedOutAmount: 0,
      platformFeeBps: 0,
      slippageBps: 0,
      positiveSlippageBps: 0,
      routePlan: [
        {
          swap: {
            __kind: "DefiTuna",
            aToB: true,
            remainingAccountsInfo: {
              slices: [
                {
                  accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                  length: 2,
                },
              ],
            },
          },
          bps: 10000,
          inputIndex: 0,
          outputIndex: 1,
        },
      ],
    };

    // A->B swap
    const routeInstruction = getRouteV2Instruction({
      userTransferAuthority: signer,
      destinationTokenAccount: tunaPositionAtaB,
      destinationTokenProgram: market.mintB.programAddress,
      eventAuthority: JUPITER_EVENT_AUTHORITY,
      sourceMint: market.mintA.address,
      sourceTokenProgram: market.mintA.programAddress,
      userSourceTokenAccount: tunaPositionAtaA,
      destinationMint: market.mintB.address,
      userDestinationTokenAccount: tunaPositionAtaB,
      program: JUPITER_PROGRAM_ADDRESS,
      ...args,
    });
    routeInstruction.accounts[0] = {
      address: tunaPositionAddress,
      role: AccountRole.READONLY,
    };

    const fusionPool = await fetchFusionPool(rpc, market.pool);

    const routeAccounts = await getRouteAccounts(
      rpc,
      fusionPool,
      tunaPositionAddress,
      tunaPositionAtaA,
      tunaPositionAtaB,
    );
    routeInstruction.accounts.push(...routeAccounts);

    assertLiquidateTunaSpotPosition(
      await liquidateTunaSpotPositionJupiter({
        rpc,
        signer: LIQUIDATOR_KEYPAIR,
        tunaPositionAddress,
        routeAccounts: routeInstruction.accounts,
        routeData: routeInstruction.data,
        intermediateTokenAccountsAndPrograms: [],
      }),
      {
        vaultBalanceDeltaA: 0n,
        vaultBalanceDeltaB: 800000000n,
        badDebtDeltaA: 0n,
        badDebtDeltaB: 0n,
        userBalanceDeltaA: 0n,
        userBalanceDeltaB: 54050561n,
        feeRecipientBalanceDelta: 450000000n,
      },
    );
  });*/
}, 20000);
