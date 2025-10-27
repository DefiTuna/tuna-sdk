import {
  createAddressLookupTableForMarketInstructions,
  createMarketInstruction,
  fetchMaybeMarket,
  getMarketAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MarketMaker,
  MAX_LEVERAGE,
  MAX_LIMIT_ORDER_EXECUTION_FEE,
  MAX_LIQUIDATION_FEE,
  MAX_LIQUIDATION_THRESHOLD,
  MAX_PROTOCOL_FEE,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Args, Flags } from "@oclif/core";

import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

export default class CreateMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Pool address",
      required: true,
    }),
    marketMaker: Args.string({
      description: "Market maker: Orca or Fusion",
      required: true,
      options: ["Orca", "Fusion"],
    }),
  };
  static override flags = {
    addressLookupTable: addressFlag({
      description: "Address lookup table",
    }),
    disabled: Flags.boolean({
      description: "Indicates if the market is disabled",
      default: false,
    }),
    maxLeverage: percentFlag({
      description: "Maximum allowed leverage for the market (hundredths of a basis point or %)",
      default: LEVERAGE_ONE,
      min: LEVERAGE_ONE,
      max: MAX_LEVERAGE,
    }),
    protocolFeeOnCollateral: percentFlag({
      description: "Protocol fee on collateral (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    protocolFee: percentFlag({
      description: "Protocol fee on borrowed funds (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    limitOrderExecutionFee: percentFlag({
      description: "Limit order execution fee (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: MAX_LIMIT_ORDER_EXECUTION_FEE,
    }),
    liquidationFee: percentFlag({
      description: "Position liquidation fee (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: MAX_LIQUIDATION_FEE,
    }),
    liquidationThreshold: percentFlag({
      description: "Liquidation threshold (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: MAX_LIQUIDATION_THRESHOLD,
    }),
    borrowLimitA: bigintFlag({
      description: "Borrow limit A. Set to zero for unlimited borrowing",
      default: 0n,
    }),
    borrowLimitB: bigintFlag({
      description: "Borrow limit B. Set to zero for unlimited borrowing",
      default: 0n,
    }),
    spotPositionSizeLimitA: bigintFlag({
      description: "Position size limit in token A. Set to zero for unlimited size",
      default: 0n,
    }),
    spotPositionSizeLimitB: bigintFlag({
      description: "Position size limit in token B. Set to zero for unlimited size",
      default: 0n,
    }),
    oraclePriceDeviationThreshold: percentFlag({
      description: "Oracle price deviation threshold from the spot price (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: HUNDRED_PERCENT,
    }),
    maxSwapSlippage: percentFlag({
      description: "Maximum allowed swap slippage for the market (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: HUNDRED_PERCENT,
    }),
    rebalanceProtocolFee: percentFlag({
      description: "Protocol fee taken from yield on position re-balancing (hundredths of a basis point or %)",
      default: 0,
      min: 0,
      max: HUNDRED_PERCENT / 2,
    }),
  };
  static override description = "Create a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE Fusion --maxLeverage 509% --protocolFeeOnCollateral 0.01% --protocolFee 0.05% --limitOrderExecutionFee 0.05% --liquidationFee 5% --liquidationThreshold 83%",
  ];

  public async run() {
    const { args, flags } = await this.parse(CreateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];

    console.log("Fetching market:", marketAddress);
    const market = await fetchMaybeMarket(rpc, marketAddress);
    if (market.exists) {
      console.log("Market:", market);
      throw new Error(`The market for liquidity pool ${args.pool} already exists`);
    } else {
      console.log("Market not found. Creating a new one.");
    }

    const marketMaker = args.marketMaker == "Orca" ? MarketMaker.Orca : MarketMaker.Fusion;

    let addressLookupTable = flags.addressLookupTable;
    if (!addressLookupTable) {
      const currentSlot = await rpc.getSlot({ commitment: "finalized" }).send();
      const lookupTable = await createAddressLookupTableForMarketInstructions(
        rpc,
        args.pool,
        marketMaker,
        signer,
        currentSlot,
      );
      addressLookupTable = lookupTable.lookupTableAddress;
      console.log("Market lookup table address is:", addressLookupTable);
      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, lookupTable.instructions, signer);
      console.log("Transaction landed:", signature);
    }

    const ix = await createMarketInstruction(signer, args.pool, {
      addressLookupTable,
      marketMaker,
      disabled: flags.disabled,
      maxLeverage: flags.maxLeverage,
      protocolFee: flags.protocolFee,
      protocolFeeOnCollateral: flags.protocolFeeOnCollateral,
      limitOrderExecutionFee: flags.limitOrderExecutionFee,
      liquidationFee: flags.liquidationFee,
      liquidationThreshold: flags.liquidationThreshold,
      borrowLimitA: flags.borrowLimitA,
      borrowLimitB: flags.borrowLimitB,
      oraclePriceDeviationThreshold: flags.oraclePriceDeviationThreshold,
      maxSwapSlippage: flags.maxSwapSlippage,
      rebalanceProtocolFee: flags.rebalanceProtocolFee,
      spotPositionSizeLimitA: flags.spotPositionSizeLimitA,
      spotPositionSizeLimitB: flags.spotPositionSizeLimitB,
    });

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, [ix], signer);
    console.log("Transaction landed:", signature);
  }
}
