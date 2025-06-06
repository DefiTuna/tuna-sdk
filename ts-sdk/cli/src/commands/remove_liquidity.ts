import {
  closePositionWithLiquidityFusionInstructions,
  closePositionWithLiquidityOrcaInstructions,
  fetchMarket,
  fetchTunaPosition,
  getMarketAddress,
  getTunaPositionAddress,
  HUNDRED_PERCENT,
  MarketMaker,
  removeLiquidityFusionInstructions,
  removeLiquidityOrcaInstructions,
} from "@crypticdot/defituna-client";
import { DEFAULT_TRANSACTION_CONFIG, sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Flags } from "@oclif/core";
import { Address, IInstruction } from "@solana/kit";

import BaseCommand, { addressFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class RemoveLiquidity extends BaseCommand {
  static override flags = {
    positionMint: addressFlag({
      description: "Position mint address",
    }),

    positionAddress: addressFlag({
      description: "Position address",
    }),

    withdrawPercent: percentFlag({
      description: "Withdraw percentage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    maxSwapSlippage: percentFlag({
      description: "Maximum swap slippage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    maxAmountSlippage: percentFlag({
      description: "Maximum amount slippage",
      min: 0,
      max: HUNDRED_PERCENT,
    }),

    swapToToken: Flags.integer({
      description: "Swap liquidity to token (0 - don't swap, 1 - swap to token A, 2 - swap to token B)",
      min: 0,
      max: 2,
    }),
  };
  static override description =
    "Removes liquidity from the tuna position and closes the position if all liquidity is withdrawn";
  static override examples = [
    "<%= config.bin %> <%= command.id %> --pool address --lowerPrice=5.0 --upperPrice=300.0 --collateralA 1000000 --collateralB 0",
  ];

  public async run() {
    const { flags } = await this.parse(RemoveLiquidity);
    const instructions: IInstruction[] = [];

    if (!flags.positionMint && !flags.positionAddress)
      throw new Error("At least one argument: positionMint or positionAddress must be provided");

    console.log("Fetching tuna position...");
    let positionMint = flags.positionMint;
    let tunaPositionAddress: Address;
    if (positionMint) {
      tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
    } else {
      tunaPositionAddress = flags.positionAddress!;
    }

    const tunaPosition = await fetchTunaPosition(rpc, tunaPositionAddress);
    positionMint = tunaPosition.data.positionMint;
    console.log("Tuna position:", tunaPosition);

    const marketAddress = (await getMarketAddress(tunaPosition.data.pool))[0];
    const market = await fetchMarket(rpc, marketAddress);

    const addressLookupTable = market.data.addressLookupTable;

    const maxSwapSlippage = flags.maxSwapSlippage ?? HUNDRED_PERCENT / 10;
    const maxAmountSlippage = flags.maxAmountSlippage ?? HUNDRED_PERCENT;
    const swapToToken = flags.swapToToken ?? 0;

    if (!flags.withdrawPercent || flags.withdrawPercent == HUNDRED_PERCENT) {
      const args = {
        swapToToken,
        maxSwapSlippage,
        maxAmountSlippage,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await closePositionWithLiquidityFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await closePositionWithLiquidityOrcaInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      }
    } else {
      const args = {
        swapToToken,
        maxSwapSlippage,
        maxAmountSlippage,
        withdrawPercent: flags.withdrawPercent,
      };

      if (market.data.marketMaker == MarketMaker.Fusion) {
        const ixs = await removeLiquidityFusionInstructions(rpc, signer, positionMint, args);
        instructions.push(...ixs);
      } else {
        const ixs = await removeLiquidityOrcaInstructions(rpc, signer, positionMint, args);
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
