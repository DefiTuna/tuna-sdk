import {
  fetchMaybeMarket,
  fetchMaybeTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
  increaseTunaSpotPositionFusionInstructions,
  increaseTunaSpotPositionOrcaInstructions,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  openAndIncreaseTunaSpotPositionFusionInstructions,
  openAndIncreaseTunaSpotPositionOrcaInstructions,
  PoolToken,
} from "@crypticdot/defituna-client";
import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import { priceToSqrtPrice } from "@orca-so/whirlpools-core";
import { IInstruction } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";

import BaseCommand, { addressFlag, bigintFlag, priceFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class IncreaseSpotPosition extends BaseCommand {
  static override flags = {
    pool: addressFlag({
      description: "Pool address",
      required: true,
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

    minSwapAmountOut: bigintFlag({
      description: "Minimum swap output amount>",
    }),
  };
  static override description = "Increases a tuna spot position.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --collateralB 1000000 --borrowB 1000000",
  ];

  public async run() {
    const { flags } = await this.parse(IncreaseSpotPosition);

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

    const addressLookupTable = market.data.addressLookupTable;

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

      const args = {
        collateralAmount: flags.collateralA ?? flags.collateralB ?? 0n,
        borrowAmount: flags.borrowA ?? flags.borrowB ?? 0n,
        minSwapAmountOut: flags.minSwapAmountOut ?? 0n,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await increaseTunaSpotPositionFusionInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      } else {
        const ixs = await increaseTunaSpotPositionOrcaInstructions(rpc, signer, tunaPosition.data.pool, args);
        instructions.push(...ixs);
      }
    } else {
      console.log("The position doesn't exist, opening a new one...");
      if (!flags.collateralA && !flags.collateralB)
        throw new Error("Collateral A or B must be provided for a new position");

      const pool =
        market.data.marketMaker == MarketMaker.Fusion
          ? await fetchFusionPool(rpc, flags.pool)
          : await fetchWhirlpool(rpc, flags.pool);

      const [mintA, mintB] = await fetchAllMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);

      const args = {
        positionToken: flags.borrowA ? PoolToken.B : PoolToken.A,
        collateralToken: flags.collateralA ? PoolToken.A : PoolToken.B,
        collateralAmount: flags.collateralA ?? flags.collateralB ?? 0n,
        borrowAmount: flags.borrowA ?? flags.borrowB ?? 0n,
        lowerLimitOrderSqrtPrice: flags.lowerLimitOrderPrice
          ? priceToSqrtPrice(flags.lowerLimitOrderPrice, mintA.data.decimals, mintB.data.decimals)
          : MIN_SQRT_PRICE,
        upperLimitOrderSqrtPrice: flags.upperLimitOrderPrice
          ? priceToSqrtPrice(flags.upperLimitOrderPrice, mintA.data.decimals, mintB.data.decimals)
          : MAX_SQRT_PRICE,
        minSwapAmountOut: flags.minSwapAmountOut ?? 0n,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await openAndIncreaseTunaSpotPositionFusionInstructions(rpc, signer, flags.pool, args);
        instructions.push(...ixs);
      } else {
        const ixs = await openAndIncreaseTunaSpotPositionOrcaInstructions(rpc, signer, flags.pool, args);
        instructions.push(...ixs);
      }
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
