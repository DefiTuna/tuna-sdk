import {
  COMPUTED_AMOUNT,
  fetchMaybeMarket,
  fetchTunaLpPosition,
  getMarketAddress,
  getTunaLpPositionAddress,
  HUNDRED_PERCENT,
  increaseTunaLpPositionFusionInstructions,
  increaseTunaLpPositionOrcaInstructions,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  openAndIncreaseTunaLpPositionFusionInstructions,
  openAndIncreaseTunaLpPositionOrcaInstructions,
} from "@crypticdot/defituna-client";
import { fetchFusionPool } from "@crypticdot/fusionamm-client";
import { getInitializableTickIndex, priceToTickIndex } from "@crypticdot/fusionamm-core";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { fetchWhirlpool } from "@orca-so/whirlpools-client";
import { Address, IInstruction } from "@solana/kit";
import { fetchAllMint } from "@solana-program/token-2022";

import BaseCommand, { addressFlag, bigintFlag, percentFlag, priceFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class IncreaseLpPosition extends BaseCommand {
  static override flags = {
    pool: addressFlag({
      description: "Pool address. Only required for a new position",
    }),

    positionMint: addressFlag({
      description: "Position mint address",
    }),

    positionAddress: addressFlag({
      description: "Position address",
    }),

    lowerPrice: priceFlag({
      description: "Lower price. Only required for a new position",
    }),

    upperPrice: priceFlag({
      description: "Upper price. Only required for a new position",
    }),

    collateralA: bigintFlag({
      description: "Provided amount of token A",
    }),

    collateralB: bigintFlag({
      description: "Provided amount of token B",
    }),

    borrowA: bigintFlag({
      description: "Borrowed amount of token A",
    }),

    borrowB: bigintFlag({
      description: "Borrowed amount of token B",
    }),

    maxSwapSlippage: percentFlag({
      description: "Maximum swap slippage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description =
    "Add liquidity to the tuna position. Opens a new position if a position mint account is not provided.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --lowerPrice=5.0 --upperPrice=300.0 --collateralA 1000000 --collateralB 0",
  ];

  public async run() {
    const { flags } = await this.parse(IncreaseLpPosition);

    const instructions: IInstruction[] = [];
    let addressLookupTable: Address;

    let collateralA = flags.collateralA ?? 0n;
    let collateralB = flags.collateralB ?? 0n;
    let borrowA = flags.borrowA ?? 0n;
    let borrowB = flags.borrowB ?? 0n;

    if (collateralA > 0n && !flags.collateralB) {
      collateralB = COMPUTED_AMOUNT;
      borrowB = COMPUTED_AMOUNT;
    } else if (collateralB > 0n && !flags.collateralA) {
      collateralA = COMPUTED_AMOUNT;
      borrowA = COMPUTED_AMOUNT;
    }

    const maxSwapSlippage = flags.maxSwapSlippage ?? HUNDRED_PERCENT / 10;

    if (flags.positionMint || flags.positionAddress) {
      if (flags.pool) throw new Error("Pool address can't be specified for the existing position");

      console.log("Fetching tuna position...");
      let positionMint = flags.positionMint;
      let tunaPositionAddress: Address;
      if (positionMint) {
        tunaPositionAddress = (await getTunaLpPositionAddress(positionMint))[0];
      } else {
        tunaPositionAddress = flags.positionAddress!;
      }

      const tunaPosition = await fetchTunaLpPosition(rpc, tunaPositionAddress);
      positionMint = tunaPosition.data.positionMint;
      console.log("Tuna position:", tunaPosition);

      console.log("Fetching market...");
      const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
      const market = await fetchMaybeMarket(rpc, marketAddress);
      if (!market.exists) {
        throw new Error("Market for the provided pool address is not found");
      }

      addressLookupTable = market.data.addressLookupTable;

      const args = {
        collateralA,
        collateralB,
        borrowA,
        borrowB,
        maxSwapSlippage,
        minAddedAmountA: 0n,
        minAddedAmountB: 0n,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await increaseTunaLpPositionFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await increaseTunaLpPositionOrcaInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      }
    } else {
      if (!flags.pool) throw new Error("Pool address must be specified for a new position");
      if (!flags.lowerPrice) throw new Error("Lower price must be specified for a new position");
      if (!flags.upperPrice) throw new Error("Upper price must be specified for a new position");
      if (!flags.collateralA && !flags.collateralB)
        throw new Error("Collateral A, B or both must be specified for a new position");

      const marketAddress = (await getMarketAddress(flags.pool))[0];

      console.log("Fetching market and pool...");
      const market = await fetchMaybeMarket(rpc, marketAddress);
      if (!market.exists) {
        throw new Error("Market for the provided pool address is not found");
      }

      addressLookupTable = market.data.addressLookupTable;

      const pool =
        market.data.marketMaker == MarketMaker.Fusion
          ? await fetchFusionPool(rpc, flags.pool)
          : await fetchWhirlpool(rpc, flags.pool);

      const [mintA, mintB] = await fetchAllMint(rpc, [pool.data.tokenMintA, pool.data.tokenMintB]);

      const initializableLowerTickIndex = getInitializableTickIndex(
        priceToTickIndex(flags.lowerPrice, mintA.data.decimals, mintB.data.decimals),
        pool.data.tickSpacing,
        false,
      );
      const initializableUpperTickIndex = getInitializableTickIndex(
        priceToTickIndex(flags.upperPrice, mintA.data.decimals, mintB.data.decimals),
        pool.data.tickSpacing,
        true,
      );

      const args = {
        tickLowerIndex: initializableLowerTickIndex,
        tickUpperIndex: initializableUpperTickIndex,
        lowerLimitOrderSqrtPrice: MIN_SQRT_PRICE,
        upperLimitOrderSqrtPrice: MAX_SQRT_PRICE,
        flags: 0,
        collateralA,
        collateralB,
        borrowA,
        borrowB,
        maxSwapSlippage,
        minAddedAmountA: 0n,
        minAddedAmountB: 0n,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ix = await openAndIncreaseTunaLpPositionFusionInstructions(rpc, signer, flags.pool, args);
        const tunaPositionAddress = (await getTunaLpPositionAddress(ix.positionMint))[0];
        console.log("Position address:", tunaPositionAddress);
        instructions.push(...ix.instructions);
      } else {
        const ix = await openAndIncreaseTunaLpPositionOrcaInstructions(rpc, signer, flags.pool, args);
        const tunaPositionAddress = (await getTunaLpPositionAddress(ix.positionMint))[0];
        console.log("Position address:", tunaPositionAddress);
        instructions.push(...ix.instructions);
      }
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
