import { FUSIONAMM_PROGRAM_ADDRESS, FusionPool } from "@crypticdot/fusionamm-client";
import { fetchTickArrayOrDefault as fetchFusionTickArrayOrDefault } from "@crypticdot/fusionamm-sdk";
import {
  AccountsType,
  CreateTokenAccountInstructionDataArgs,
  DefiTunaAccountsType,
  getCreateTokenAccountInstruction,
  getRouteV2Instruction,
  JUPITER_PROGRAM_ADDRESS,
  RouteV2InstructionDataArgs,
} from "@crypticdot/jupiter-solana-client";
import { getOracleAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import {
  Account,
  AccountRole,
  Address,
  address,
  GetAccountInfoApi,
  getAddressEncoder,
  GetMultipleAccountsApi,
  getProgramDerivedAddress,
  IAccountMeta,
  Rpc,
} from "@solana/kit";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction } from "@solana-program/token-2022";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ADDRESS,
  getTunaLpPositionAddress,
  HUNDRED_PERCENT,
  JUPITER_EVENT_AUTHORITY,
  LEVERAGE_ONE,
  MarketMaker,
  NATIVE_MINT,
  TUNA_PROGRAM_ADDRESS,
  TunaPositionState,
} from "../src";

import { LIQUIDATOR_KEYPAIR } from "./helpers/addresses.ts";
import { assertDecreaseTunaLpPositionLiquidity, decreaseTunaLpPosition } from "./helpers/decreaseTunaLpPosition.ts";
import { fetchPool } from "./helpers/fetch.ts";
import { assertLiquidateTunaLpPosition } from "./helpers/liquidateTunaLpPosition.ts";
import { liquidateTunaLpPositionJupiter } from "./helpers/liquidateTunaLpPositionJupiter.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";
import { openAndIncreaseTunaLpPosition } from "./helpers/openAndIncreaseTunaLpPosition.ts";
import { fetchTickArrayOrDefault as fetchOrcaTickArrayOrDefault } from "./helpers/orca.ts";
import { setupTestMarket, TestMarket } from "./helpers/setup.ts";
import { accountExists } from "./helpers/solana.ts";
import { swapExactInput } from "./helpers/swap.ts";

describe("Tuna Liquidity Position via Jupiter", () => {
  let testOrcaMarket: TestMarket;
  let testFusionMarket: TestMarket;
  let markets: TestMarket[];
  const marketNames = ["Orca", "Fusion"];

  beforeEach(async () => {
    const marketArgs = {
      addressLookupTable: DEFAULT_ADDRESS,
      borrowLimitA: 0n,
      borrowLimitB: 0n,
      disabled: false,
      liquidationFee: 10000, // 1%
      liquidationThreshold: 920000, // 92%
      maxLeverage: (LEVERAGE_ONE * 1020) / 100,
      maxSwapSlippage: 0,
      oraclePriceDeviationThreshold: HUNDRED_PERCENT, // Allow large deviation for tests
      protocolFee: 1000, // 0.1%
      protocolFeeOnCollateral: 1000, // 0.1%
      rebalanceProtocolFee: HUNDRED_PERCENT / 10,
      spotPositionSizeLimitA: 1000_000_000_000,
      spotPositionSizeLimitB: 100000_000_000,
    };
    testOrcaMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Orca);
    testFusionMarket = await setupTestMarket({ ...marketArgs }, MarketMaker.Fusion);
    markets = [testOrcaMarket, testFusionMarket];
  });

  const getFusionRouteAccounts = async (
    rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
    fusionPool: Account<FusionPool>,
    tunaPositionAddress: Address,
    tunaPositionAtaA: Address,
    tunaPositionAtaB: Address,
    tokenProgramA: Address,
    tokenProgramB: Address,
  ): Promise<IAccountMeta[]> => {
    const tickArrays = await fetchFusionTickArrayOrDefault(rpc, fusionPool);

    return [
      { address: FUSIONAMM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      // tokenProgramA
      { address: tokenProgramA, role: AccountRole.READONLY },
      // tokenProgramB
      { address: tokenProgramB, role: AccountRole.READONLY },
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
      { address: tunaPositionAtaA, role: AccountRole.WRITABLE },
      // tokenOwnerAccountB
      { address: tunaPositionAtaB, role: AccountRole.WRITABLE },
      // tokenVaultA
      { address: fusionPool.data.tokenVaultA, role: AccountRole.WRITABLE },
      // tokenVaultB
      { address: fusionPool.data.tokenVaultB, role: AccountRole.WRITABLE },
      // tickArray0
      { address: tickArrays[0].address, role: AccountRole.WRITABLE },
      // tickArray1:
      { address: tickArrays[1].address, role: AccountRole.WRITABLE },
      // tickArray2:
      { address: tickArrays[2].address, role: AccountRole.WRITABLE },
      // remaining account 0
      { address: tickArrays[3].address, role: AccountRole.WRITABLE },
      // remaining account 1
      { address: tickArrays[4].address, role: AccountRole.WRITABLE },
    ];
  };

  const getOrcaRouteAccounts = async (
    rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
    whirlpool: Account<Whirlpool>,
    tunaPositionAddress: Address,
    tunaPositionAtaA: Address,
    tunaPositionAtaB: Address,
    tokenProgramA: Address,
    tokenProgramB: Address,
  ): Promise<IAccountMeta[]> => {
    const tickArrays = await fetchOrcaTickArrayOrDefault(rpc, whirlpool);
    const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

    return [
      { address: WHIRLPOOL_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      // tokenProgramA
      { address: tokenProgramA, role: AccountRole.READONLY },
      // tokenProgramB
      { address: tokenProgramB, role: AccountRole.READONLY },
      // memoProgram
      { address: MEMO_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      // tokenAuthority
      { address: tunaPositionAddress, role: AccountRole.READONLY },
      // fusionPool
      { address: whirlpool.address, role: AccountRole.WRITABLE },
      // tokenMintA
      { address: whirlpool.data.tokenMintA, role: AccountRole.READONLY },
      // tokenMintB
      { address: whirlpool.data.tokenMintB, role: AccountRole.READONLY },
      // tokenOwnerAccountA
      { address: tunaPositionAtaA, role: AccountRole.WRITABLE },
      // tokenVaultA
      { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
      // tokenOwnerAccountB
      { address: tunaPositionAtaB, role: AccountRole.WRITABLE },
      // tokenVaultB
      { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
      // tickArray0
      { address: tickArrays[0].address, role: AccountRole.WRITABLE },
      // tickArray1
      { address: tickArrays[1].address, role: AccountRole.WRITABLE },
      // tickArray2
      { address: tickArrays[2].address, role: AccountRole.WRITABLE },
      // oracle
      { address: orcaOracleAddress, role: AccountRole.WRITABLE },
      // remaining account 0
      { address: tickArrays[3].address, role: AccountRole.WRITABLE },
      // remaining account 1
      { address: tickArrays[4].address, role: AccountRole.WRITABLE },
    ];
  };

  for (const marketName of marketNames) {
    it(`Liquidates a position due to an unhealthy state (no bad debt) (${marketName})`, async () => {
      const market = markets.find(m => m.name == marketName)!;
      const pool = await fetchPool(rpc, market.pool, market.marketMaker);
      const actualTickIndex = pool.data.tickCurrentIndex - (pool.data.tickCurrentIndex % pool.data.tickSpacing);

      const positionMint = await openAndIncreaseTunaLpPosition({
        rpc,
        tickLowerIndex: actualTickIndex - pool.data.tickSpacing * 3,
        tickUpperIndex: actualTickIndex + pool.data.tickSpacing * 3,
        pool: pool.address,
        collateralA: 1_000_000_000n,
        collateralB: 0n,
        borrowA: 4_000_000_000n,
        borrowB: 0n,
      });

      const tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
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

      // Significantly move the price.
      await swapExactInput(rpc, signer, pool.address, 50_000_000_000n, market.mintB.address);

      const intermediateTokenAccount = (
        await findAssociatedTokenPda({
          mint: NATIVE_MINT,
          owner: tunaPositionAddress,
          tokenProgram: TOKEN_PROGRAM_ADDRESS,
        })
      )[0];

      const createIntermediateAtaInstruction = getCreateAssociatedTokenIdempotentInstruction({
        payer: signer,
        ata: intermediateTokenAccount,
        mint: NATIVE_MINT,
        owner: tunaPositionAddress,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
      await sendTransaction([createIntermediateAtaInstruction]);

      const aToB = false;
      const swapInAmount = 987086845n;

      const args: RouteV2InstructionDataArgs = {
        inAmount: swapInAmount,
        quotedOutAmount: 4000000002,
        platformFeeBps: 0,
        slippageBps: 100,
        positiveSlippageBps: 0,
        routePlan: [
          {
            swap:
              market.marketMaker == MarketMaker.Fusion
                ? {
                    __kind: "DefiTuna",
                    aToB,
                    remainingAccountsInfo: {
                      slices: [
                        {
                          accountsType: DefiTunaAccountsType.SupplementalTickArrays,
                          length: 2,
                        },
                      ],
                    },
                  }
                : {
                    __kind: "WhirlpoolSwapV2",
                    aToB,
                    remainingAccountsInfo: {
                      slices: [
                        {
                          accountsType: AccountsType.SupplementalTickArrays,
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
      const routeInstruction = getRouteV2Instruction({
        userTransferAuthority: signer,
        destinationTokenAccount: tunaPositionAtaA,
        destinationTokenProgram: market.mintA.programAddress,
        eventAuthority: JUPITER_EVENT_AUTHORITY,
        sourceMint: market.mintB.address,
        sourceTokenProgram: market.mintB.programAddress,
        userSourceTokenAccount: tunaPositionAtaB,
        destinationMint: market.mintA.address,
        userDestinationTokenAccount: JUPITER_PROGRAM_ADDRESS,
        program: JUPITER_PROGRAM_ADDRESS,
        ...args,
      });
      routeInstruction.accounts[0] = {
        address: tunaPositionAddress,
        role: AccountRole.READONLY,
      };

      const routeAccounts =
        market.marketMaker == MarketMaker.Fusion
          ? await getFusionRouteAccounts(
              rpc,
              pool as Account<FusionPool>,
              tunaPositionAddress,
              tunaPositionAtaA,
              tunaPositionAtaB,
              market.mintA.programAddress,
              market.mintB.programAddress,
            )
          : await getOrcaRouteAccounts(
              rpc,
              pool as Account<Whirlpool>,
              tunaPositionAddress,
              tunaPositionAtaA,
              tunaPositionAtaB,
              market.mintA.programAddress,
              market.mintB.programAddress,
            );
      routeInstruction.accounts.push(...routeAccounts);

      assertLiquidateTunaLpPosition(
        await liquidateTunaLpPositionJupiter({
          rpc,
          signer: LIQUIDATOR_KEYPAIR,
          positionMint,
          routeAccounts: routeInstruction.accounts,
          routeData: routeInstruction.data,
          intermediateTokenAccountsAndPrograms: [
            { address: intermediateTokenAccount, role: AccountRole.WRITABLE },
            { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
          ],
        }),
        {
          vaultBalanceDeltaA: 4000000000n,
          vaultBalanceDeltaB: 0n,
          badDebtDeltaA: 0n,
          badDebtDeltaB: 0n,
          tunaPositionState: TunaPositionState.Liquidated,
        },
      );

      expect(await accountExists(rpc, intermediateTokenAccount)).toBeFalsy();

      assertDecreaseTunaLpPositionLiquidity(
        await decreaseTunaLpPosition({
          rpc,
          signer,
          positionMint,
          pool: pool.address,
          decreasePercent: HUNDRED_PERCENT,
        }),
        {
          userBalanceDeltaA: 32727877n,
          userBalanceDeltaB: 0n,
          vaultBalanceDeltaA: 0n,
          vaultBalanceDeltaB: 0n,
          poolBalanceDeltaA: 0n,
          poolBalanceDeltaB: 0n,
        },
      );
    });
  }
}, 20000);
