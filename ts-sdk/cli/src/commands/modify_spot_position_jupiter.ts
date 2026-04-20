import {
  closeTunaSpotPositionInstruction,
  fetchMaybeMarket,
  fetchMaybeTunaSpotPosition,
  fetchVault,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  jupiterSwapQuote,
  jupiterSwapQuoteByOutputAmount,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  modifyTunaSpotPositionJupiterInstructions,
  ModifyTunaSpotPositionJupiterInstructionsArgs,
  openAndIncreaseTunaSpotPositionJupiterInstructions,
  OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs,
  PoolToken,
  setTunaSpotPositionLimitOrdersInstruction,
  sharesToFunds,
} from "@crypticdot/defituna-client";
import { getDecreaseSpotPositionEstimation, getIncreaseSpotPositionEstimation } from "@crypticdot/defituna-core";
import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Flags } from "@oclif/core";
import { priceToSqrtPrice, sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import { Account, IInstruction } from "@solana/kit";
import { fetchAllMint, Mint } from "@solana-program/token-2022";

import BaseCommand, { addressFlag, bigintFlag, percentFlag, priceFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class ModifySpotPositionJupiter extends BaseCommand {
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

    collateralToken: Flags.string({
      description: "Collateral token ('a' or 'b')",
      options: ["a", "b"],
    }),

    positionToken: Flags.string({
      description: "Position token ('a' or 'b')",
      options: ["a", "b"],
    }),

    amount: bigintFlag({
      description: "Increase or decrease amount in the collateral token",
      required: true,
    }),

    decrease: Flags.boolean({
      description: "Decrease the position",
      default: false,
    }),

    leverage: Flags.integer({
      description: "Leverage",
      min: 1,
      max: 10,
      default: 1,
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
      default: 10,
    }),
  };
  static override description = "Increases a tuna spot position via jupiter.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --leverage 3 --collateralToken b --positionToken a --amount 1000000",
  ];

  public async run() {
    const { flags } = await this.parse(ModifySpotPositionJupiter);

    const slippageBps = flags.slippageBps;

    console.log("Fetching market...");
    const marketAddress = (await getMarketAddress(flags.pool))[0];
    const market = await fetchMaybeMarket(rpc, marketAddress);
    if (!market.exists) {
      throw new Error("Market for the provided pool address is not found");
    }

    if (market.data.marketMaker != MarketMaker.Fusion) {
      throw new Error("Only Fusion markets are supported for spot positions");
    }

    const pool = await fetchFusionPool(rpc, flags.pool);
    const price = sqrtPriceToPrice(pool.data.sqrtPrice, 1, 1);

    const [mintA, mintB] = await fetchAllMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);

    const tunaPositionAddress = (await getTunaSpotPositionAddress(signer.address, flags.pool))[0];
    console.log("Position address:", tunaPositionAddress);

    console.log("Fetching tuna position...");
    const tunaPosition = await fetchMaybeTunaSpotPosition(rpc, tunaPositionAddress);

    let collateralToken = flags.collateralToken == "b" ? PoolToken.B : PoolToken.A;
    let positionToken = flags.positionToken == "b" ? PoolToken.B : PoolToken.A;

    if (tunaPosition.exists) {
      console.log("Tuna position:", tunaPosition);

      if (flags.collateralToken) {
        if (collateralToken != tunaPosition.data.collateralToken)
          throw new Error("Collateral token is incorrect. You may skip this field for the existing position.");
      } else {
        collateralToken = tunaPosition.data.collateralToken;
      }

      if (flags.positionToken) {
        if (positionToken != tunaPosition.data.positionToken)
          throw new Error("Position token is incorrect. You may skip this field for the existing position.");
      } else {
        positionToken = tunaPosition.data.positionToken;
      }
    } else {
      if (!flags.collateralToken) throw new Error("Collateral token must be set");
      if (!flags.positionToken) throw new Error("Position token must be set");
    }

    let decreasePercent = 0;
    let swapExactIn = true;
    let swapInAmount = 0;
    let swapOutAmount = 0;
    let collateralAmount: bigint = 0n;
    let borrowAmount: bigint = 0n;
    let inputMint: Account<Mint>;
    let outputMint: Account<Mint>;

    if (flags.decrease) {
      inputMint = positionToken == PoolToken.A ? mintA : mintB;
      outputMint = positionToken == PoolToken.A ? mintB : mintA;

      if (!tunaPosition.exists) {
        throw new Error("Can't decrease a non existing position.");
      }

      const vaultAddress = positionToken == PoolToken.A ? market.data.vaultB : market.data.vaultA;
      const vault = await fetchVault(rpc, vaultAddress);

      const positionDebt = sharesToFunds(
        tunaPosition.data.loanShares,
        vault.data.borrowedFunds,
        vault.data.borrowedShares,
        true,
      );

      const decreaseQuote = getDecreaseSpotPositionEstimation(
        flags.amount,
        tunaPosition.data.collateralToken,
        tunaPosition.data.positionToken,
        tunaPosition.data.amount,
        positionDebt,
        price,
      );

      decreasePercent = decreaseQuote.decreasePercent;
      swapExactIn = decreaseQuote.swapExactIn;
      if (decreaseQuote.swapExactIn) {
        swapInAmount = Number(decreaseQuote.swapAmount);
      } else {
        swapOutAmount = Number(decreaseQuote.swapAmount);
        console.log("Required swap output amount:", swapOutAmount);

        swapOutAmount += Math.floor((swapOutAmount * slippageBps) / 10000);
        console.log("Required swap output amount with slippage applied:", swapOutAmount);

        const aToB = positionToken == PoolToken.A;
        const price = sqrtPriceToPrice(pool.data.sqrtPrice, 1, 1);
        swapInAmount = Math.ceil(aToB ? swapOutAmount / price : swapOutAmount * price);
      }
    } else {
      inputMint = positionToken == PoolToken.A ? mintB : mintA;
      outputMint = positionToken == PoolToken.A ? mintA : mintB;

      const increaseQuote = getIncreaseSpotPositionEstimation(
        flags.amount,
        collateralToken,
        positionToken,
        flags.leverage,
        market.data.protocolFee,
        market.data.protocolFeeOnCollateral,
        price,
      );

      collateralAmount = increaseQuote.collateral;
      borrowAmount = increaseQuote.borrow;
      swapExactIn = true;
      swapInAmount = Number(increaseQuote.swapInputAmount);
    }

    console.log("Quoting...");

    const quote = swapExactIn
      ? await jupiterSwapQuote({
          tunaPositionAddress,
          inputMint: inputMint,
          outputMint: outputMint,
          inputAmount: swapInAmount,
          slippageBps: flags.slippageBps,
        })
      : await jupiterSwapQuoteByOutputAmount({
          tunaPositionAddress,
          inputMint: inputMint,
          outputMint: outputMint,
          estimatedInputAmount: swapInAmount,
          minOutputAmount: swapOutAmount,
          slippageBps: flags.slippageBps,
        });
    console.log("Swap input amount:", quote.inAmount);
    console.log("Swap output amount:", quote.outAmount);
    console.log(`Slippage: ${slippageBps / 100}%`);
    console.log(`Price impact: ${(Number(quote.priceImpactPct) * 100).toFixed(2)}%`);

    const instructions: IInstruction[] = [];

    if (!tunaPosition.exists) {
      console.log("The position doesn't exist, opening a new one...");

      const args: OpenAndIncreaseTunaSpotPositionJupiterInstructionsArgs = {
        positionToken,
        collateralToken,
        collateralAmount,
        borrowAmount,
        jupiterRouteData: quote.swapInstructionData,
      };

      instructions.push(
        ...(await openAndIncreaseTunaSpotPositionJupiterInstructions(
          rpc,
          signer,
          flags.pool,
          quote.swapInstructionAccounts,
          [],
          args,
        )),
      );
    } else {
      const args: ModifyTunaSpotPositionJupiterInstructionsArgs = {
        decreasePercent,
        collateralAmount,
        borrowAmount,
        jupiterRouteData: quote.swapInstructionData,
      };

      instructions.push(
        ...(await modifyTunaSpotPositionJupiterInstructions(
          rpc,
          signer,
          flags.pool,
          quote.swapInstructionAccounts,
          [],
          args,
        )),
      );

      if (args.decreasePercent == HUNDRED_PERCENT) {
        const ix = await closeTunaSpotPositionInstruction(signer, flags.pool, mintA, mintB);
        instructions.push(ix);
      }
    }

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
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      market.data.addressLookupTable,
      ...quote.addressLookupTableAddresses,
    ]);
    console.log("Transaction landed:", signature);
  }
}
