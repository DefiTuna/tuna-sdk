import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import {
  fetchMaybeMarket,
  getMarketAddress,
  createMarketInstruction,
  MAX_LIMIT_ORDER_EXECUTION_FEE,
  MAX_LIQUIDATION_FEE,
  LEVERAGE_ONE,
  MAX_LEVERAGE,
  MAX_PROTOCOL_FEE,
  HUNDRED_PERCENT,
  MAX_LIQUIDATION_THRESHOLD,
  createAddressLookupTableForMarketInstructions,
} from "@defituna/client";
import { Flags } from "@oclif/core";

export default class CreateMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Pool address",
      required: true,
    }),
  };
  static override flags = {
    disabled: Flags.boolean({
      description: "Indicates if the market is disabled",
      default: false,
    }),
    addressLookupTable: addressFlag({
      description: "Address lookup table",
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
  };
  static override description = "Create a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE --maxLeverage 509% --protocolFeeOnCollateral 0.01% --protocolFee 0.05% --limitOrderExecutionFee 0.05% --liquidationFee 5% --liquidationThreshold 83%",
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

    let addressLookupTable = flags.addressLookupTable;
    if (!addressLookupTable) {
      const currentSlot = await rpc.getSlot({ commitment: "finalized" }).send();
      const lookupTable = await createAddressLookupTableForMarketInstructions(rpc, args.pool, signer, currentSlot);
      addressLookupTable = lookupTable.lookupTableAddress;
      console.log("Market lookup table address is:", addressLookupTable);
      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction(lookupTable.instructions);
      console.log("Transaction landed:", signature);
    }

    const ix = await createMarketInstruction(signer, args.pool, {
      liquidityProvider: 0,
      addressLookupTable,
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
    });

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction([ix]);
    console.log("Transaction landed:", signature);
  }
}
