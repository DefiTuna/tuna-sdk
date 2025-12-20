import {
  fetchMaybeMarket,
  fetchMaybeTunaSpotPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  HUNDRED_PERCENTn,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  ModifyTunaSpotPositionJupiterInstructionDataArgs,
  modifyTunaSpotPositionJupiterInstructions,
  mulDiv,
  openTunaSpotPositionInstructions,
  PoolToken,
  setTunaSpotPositionLimitOrdersInstruction,
  sharesToFunds,
} from "@crypticdot/defituna-client";
import { calculateTunaSpotPositionProtocolFee } from "@crypticdot/defituna-core";
import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { createJupiterApiClient, SwapInstructionsPostRequest } from "@jup-ag/api";
import { Flags } from "@oclif/core";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import { priceToSqrtPrice, sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import { AccountRole, address, IAccountMeta, IInstruction } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";

import BaseCommand, { addressFlag, bigintFlag, percentFlag, priceFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class IncreaseSpotPositionJupiter extends BaseCommand {
  static override flags = {
    pool: addressFlag({
      description: "Pool address",
      required: true,
    }),

    decreasePercent: percentFlag({
      description: "Withdraw percentage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    collateralA: bigintFlag({
      description: "Collateral amount in token A",
    }),

    collateralB: bigintFlag({
      description: "Collateral amount in token B",
    }),

    borrowA: bigintFlag({
      description: "Borrowed amount in token A",
    }),

    borrowB: bigintFlag({
      description: "Borrowed amount in token B",
    }),

    lowerLimitOrderPrice: priceFlag({
      description: "Lower limit order price",
    }),

    upperLimitOrderPrice: priceFlag({
      description: "Upper limit order price",
    }),

    slippageBps: Flags.integer({
      description: "Maximum allowed swap slippage in bps",
      min: 0,
      max: 10000,
      default: 50,
    }),
  };
  static override description = "Increases a tuna spot position via jupiter.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --collateralB 1000000 --borrowB 1000000",
  ];

  public async run() {
    const { flags } = await this.parse(IncreaseSpotPositionJupiter);

    const instructions: IInstruction[] = [];

    if (flags.collateralA && flags.collateralB)
      throw new Error("Can't use both tokens as collateral. Please provide collateral in only one token.");
    if (flags.borrowA && flags.borrowB)
      throw new Error("Can't borrow in both tokens. Please specify the borrowed amount in only one token.");

    console.log("Fetching market...");
    const marketAddress = (await getMarketAddress(flags.pool))[0];
    const market = await fetchMaybeMarket(rpc, marketAddress);
    if (!market.exists) {
      throw new Error("Market for the provided pool address is not found");
    }

    const pool =
      market.data.marketMaker == MarketMaker.Fusion
        ? await fetchFusionPool(rpc, flags.pool)
        : await fetchWhirlpool(rpc, flags.pool);

    const price = sqrtPriceToPrice(pool.data.sqrtPrice, 1, 1);

    const [mintA, mintB] = await fetchAllMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);

    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, flags.pool))[0];
    console.log("Position address:", tunaPositionAddress);

    console.log("Fetching tuna position...");
    const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);

    if (tunaPosition.exists) {
      console.log("Tuna position:", tunaPosition);

      if (tunaPosition.data.collateralToken == PoolToken.A && flags.collateralB)
        throw new Error("Collateral token must be A");
      if (tunaPosition.data.collateralToken == PoolToken.B && flags.collateralA)
        throw new Error("Collateral token mus be B");

      if (tunaPosition.data.positionToken == PoolToken.A && flags.borrowA) throw new Error("Borrowed token must be B");
      if (tunaPosition.data.positionToken == PoolToken.B && flags.borrowB) throw new Error("Borrowed token must be A");
    } else {
      if (!flags.collateralA && !flags.collateralB)
        throw new Error("Collateral A or B must be provided for a new position");
    }

    const borrowedToken = flags.borrowA ? PoolToken.A : PoolToken.B;
    const positionToken = flags.borrowA ? PoolToken.B : PoolToken.A;
    const collateralToken = flags.collateralA ? PoolToken.A : PoolToken.B;
    const collateralAmount = flags.collateralA ?? flags.collateralB ?? 0n;
    const borrowAmount = flags.borrowA ?? flags.borrowB ?? 0n;

    const decreasePercent = flags.decreasePercent ?? HUNDRED_PERCENT;

    let swapAmountIn: bigint;

    if (decreasePercent > 0) {
      if (!tunaPosition.exists) {
        throw new Error("Can't decrease non existing position.");
      }

      const vaultAddress = (
        await getLendingVaultAddress(positionToken == PoolToken.A ? tunaPosition.data.mintB : tunaPosition.data.mintA)
      )[0];
      const vault = await fetchVault(rpc, vaultAddress);

      const debt = sharesToFunds(
        tunaPosition.data.loanShares,
        vault.data.borrowedFunds,
        vault.data.borrowedShares,
        true,
      );
      const repayAmount = Number(mulDiv(debt, BigInt(decreasePercent), HUNDRED_PERCENTn, true));

      const newPositionAmount = mulDiv(
        tunaPosition.data.amount,
        BigInt(HUNDRED_PERCENT - decreasePercent),
        HUNDRED_PERCENTn,
        false,
      );

      if (collateralToken != positionToken) {
        swapAmountIn = tunaPosition.data.amount - newPositionAmount;
      } else {
        swapAmountIn = BigInt(
          Math.ceil(
            (positionToken == PoolToken.A ? repayAmount / price : repayAmount * price) *
              (1.0 + flags.slippageBps / 10000.0),
          ),
        );
        if (swapAmountIn > tunaPosition.data.amount) swapAmountIn = tunaPosition.data.amount;
      }
    } else {
      const protocolFee = calculateTunaSpotPositionProtocolFee(
        collateralToken,
        borrowedToken,
        collateralAmount,
        borrowAmount,
        market.data.protocolFeeOnCollateral,
        market.data.protocolFee,
      );
      swapAmountIn = borrowAmount;
      if (collateralToken == borrowedToken) swapAmountIn += collateralAmount;
      swapAmountIn -= borrowedToken == PoolToken.A ? protocolFee.a : protocolFee.b;
    }

    console.log("Swap input amount:", swapAmountIn);

    const jupiterQuoteApi = createJupiterApiClient();

    const quoteResponse = await jupiterQuoteApi.quoteGet({
      inputMint: borrowedToken == PoolToken.A ? mintA.address : mintB.address,
      outputMint: borrowedToken == PoolToken.A ? mintB.address : mintA.address,
      amount: Number(swapAmountIn),
      instructionVersion: "V1",
      //dexes: ["DefiTuna"],
      slippageBps: flags.slippageBps,
    });

    const swapInstructionsRequest: SwapInstructionsPostRequest = {
      swapRequest: {
        userPublicKey: tunaPositionAddress,
        quoteResponse: quoteResponse,
      },
    };
    const swapInstructionsResponse = await jupiterQuoteApi.swapInstructionsPost(swapInstructionsRequest);

    const swapIx = swapInstructionsResponse.swapInstruction;

    const modifyIxArgs: ModifyTunaSpotPositionJupiterInstructionDataArgs = {
      decreasePercent: 0,
      collateralAmount: flags.collateralA ?? flags.collateralB ?? 0n,
      borrowAmount: flags.borrowA ?? flags.borrowB ?? 0n,
      routeData: Uint8Array.from(Buffer.from(swapIx.data, "base64")),
    };

    // The first 9 accounts will be added inside the Tuna program.
    const accounts: IAccountMeta[] = swapIx.accounts.slice(9).map(account => ({
      address: address(account.pubkey),
      role: account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
    }));

    console.log("Passed accounts:", accounts);
    console.log("Passed data:", modifyIxArgs.routeData);

    if (!tunaPosition.exists) {
      console.log("The position doesn't exist, opening a new one...");

      const ixs = await openTunaSpotPositionInstructions(rpc, signer, flags.pool, {
        positionToken,
        collateralToken,
      });
      instructions.push(...ixs);
    }

    const ixs = await modifyTunaSpotPositionJupiterInstructions(rpc, signer, flags.pool, accounts, modifyIxArgs);
    instructions.push(...ixs);

    // Set limit orders if needed
    if (flags.lowerLimitOrderPrice || flags.upperLimitOrderPrice) {
      const lowerLimitOrderSqrtPrice = flags.lowerLimitOrderPrice
        ? priceToSqrtPrice(flags.lowerLimitOrderPrice, mintA.data.decimals, mintB.data.decimals)
        : MIN_SQRT_PRICE;

      const upperLimitOrderSqrtPrice = flags.upperLimitOrderPrice
        ? priceToSqrtPrice(flags.upperLimitOrderPrice, mintA.data.decimals, mintB.data.decimals)
        : MAX_SQRT_PRICE;

      const ix = await setTunaSpotPositionLimitOrdersInstruction(signer, flags.pool, {
        lowerLimitOrderSqrtPrice,
        upperLimitOrderSqrtPrice,
      });
      instructions.push(ix);
    }

    console.log("Sending a transaction...");
    const addressLookupTable = market.data.addressLookupTable;
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
