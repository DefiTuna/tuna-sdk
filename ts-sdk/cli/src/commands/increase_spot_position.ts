import {
  fetchMaybeMarket,
  fetchTunaSpotPosition,
  getMarketAddress,
  getTunaSpotPositionAddress,
  HUNDRED_PERCENT,
  increaseTunaSpotPositionFusionInstructions,
  increaseTunaSpotPositionOrcaInstructions,
  MarketMaker,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  openAndIncreaseTunaSpotPositionFusionInstructions,
  openAndIncreaseTunaSpotPositionOrcaInstructions,
  PoolToken,
} from "@crypticdot/defituna-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Address, IInstruction } from "@solana/kit";

import BaseCommand, { addressFlag, bigintFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class IncreaseSpotPosition extends BaseCommand {
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

    maxSwapSlippage: percentFlag({
      description: "Maximum swap slippage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description =
    "Increases a tuna spot position. Opens a new position if a position mint account is not provided.";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --collateralB 1000000 --borrowB 1000000",
  ];

  public async run() {
    const { flags } = await this.parse(IncreaseSpotPosition);

    const instructions: IInstruction[] = [];
    let addressLookupTable: Address;

    const maxSwapSlippage = flags.maxSwapSlippage ?? HUNDRED_PERCENT / 10;

    if (flags.collateralA && flags.collateralB)
      throw new Error("Can't use both tokens as collateral. Please provide collateral in only one token.");
    if (flags.borrowA && flags.borrowB)
      throw new Error("Can't borrow in both tokens. Please specify the borrowed amount in only one token.");

    if (flags.positionMint || flags.positionAddress) {
      if (flags.pool) throw new Error("Pool address can't be specified for the existing position");

      console.log("Fetching tuna position...");
      let positionMint = flags.positionMint;
      let tunaPositionAddress: Address;
      if (positionMint) {
        tunaPositionAddress = (await getTunaSpotPositionAddress(positionMint))[0];
      } else {
        tunaPositionAddress = flags.positionAddress!;
      }

      const tunaPosition = await fetchTunaSpotPosition(rpc, tunaPositionAddress);
      positionMint = tunaPosition.data.positionMint;
      console.log("Tuna position:", tunaPosition);

      console.log("Fetching market...");
      const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
      const market = await fetchMaybeMarket(rpc, marketAddress);
      if (!market.exists) {
        throw new Error("Market for the provided pool address is not found");
      }

      addressLookupTable = market.data.addressLookupTable;

      if (tunaPosition.data.collateralToken == PoolToken.A && flags.collateralB)
        throw new Error("Collateral token must be A");
      if (tunaPosition.data.collateralToken == PoolToken.B && flags.collateralA)
        throw new Error("Collateral token mus be B");

      if (tunaPosition.data.positionToken == PoolToken.A && flags.borrowA) throw new Error("Borrowed token must be B");
      if (tunaPosition.data.positionToken == PoolToken.B && flags.borrowB) throw new Error("Borrowed token must be A");

      const args = {
        collateralAmount: flags.collateralA ?? flags.collateralB ?? 0n,
        borrowAmount: flags.borrowA ?? flags.borrowB ?? 0n,
        maxSwapSlippage,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await increaseTunaSpotPositionFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await increaseTunaSpotPositionOrcaInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      }
    } else {
      if (!flags.pool) throw new Error("Pool address must be specified for a new position");
      if (!flags.collateralA && !flags.collateralB)
        throw new Error("Collateral A or B must be provided for a new position");

      const marketAddress = (await getMarketAddress(flags.pool))[0];

      console.log("Fetching market...");
      const market = await fetchMaybeMarket(rpc, marketAddress);
      if (!market.exists) {
        throw new Error("Market for the provided pool address is not found");
      }

      addressLookupTable = market.data.addressLookupTable;

      const args = {
        positionToken: flags.borrowA ? PoolToken.B : PoolToken.A,
        collateralToken: flags.collateralA ? PoolToken.A : PoolToken.B,
        collateralAmount: flags.collateralA ?? flags.collateralB ?? 0n,
        borrowAmount: flags.borrowA ?? flags.borrowB ?? 0n,
        lowerLimitOrderSqrtPrice: MIN_SQRT_PRICE,
        upperLimitOrderSqrtPrice: MAX_SQRT_PRICE,
        flags: 0,
        maxSwapSlippage,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ix = await openAndIncreaseTunaSpotPositionFusionInstructions(rpc, signer, flags.pool, args);
        instructions.push(...ix.instructions);
        const tunaPositionAddress = (await getTunaSpotPositionAddress(ix.positionMint))[0];
        console.log("Position address:", tunaPositionAddress);
      } else {
        const ix = await openAndIncreaseTunaSpotPositionOrcaInstructions(rpc, signer, flags.pool, args);
        instructions.push(...ix.instructions);
        const tunaPositionAddress = (await getTunaSpotPositionAddress(ix.positionMint))[0];
        console.log("Position address:", tunaPositionAddress);
      }
    }

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, instructions, signer, DEFAULT_TRANSACTION_CONFIG, [
      addressLookupTable,
    ]);
    console.log("Transaction landed:", signature);
  }
}
