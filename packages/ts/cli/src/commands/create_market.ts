import BaseCommand, { addressArg, addressFlag, bigintFlag } from "../base.ts";
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
import { IInstruction } from "@solana/kit";

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
    maxLeverage: Flags.integer({
      description: "Maximum allowed leverage for the market",
      default: LEVERAGE_ONE,
      min: LEVERAGE_ONE,
      max: MAX_LEVERAGE,
    }),
    protocolFeeOnCollateral: Flags.integer({
      description: "Protocol fee on collateral",
      default: 0,
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    protocolFee: Flags.integer({
      description: "Protocol fee on borrowed funds",
      default: 0,
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    limitOrderExecutionFee: Flags.integer({
      description: "Limit order execution fee",
      default: 0,
      min: 0,
      max: MAX_LIMIT_ORDER_EXECUTION_FEE,
    }),
    liquidationFee: Flags.integer({
      description: "Position liquidation fee",
      default: 0,
      min: 0,
      max: MAX_LIQUIDATION_FEE,
    }),
    liquidationThreshold: Flags.integer({
      description: "Liquidation threshold",
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
    oraclePriceDeviationThreshold: Flags.integer({
      description: "Oracle price deviation threshold from the spot price",
      default: 0,
      min: 0,
      max: HUNDRED_PERCENT,
    }),
    maxSwapSlippage: Flags.integer({
      description: "Maximum allowed swap slippage for the market",
      default: 0,
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description = "Create a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE --maxLeverage 5090000 --protocolFee 500 --liquidationFee 50000 --liquidationThreshold 830000",
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

    const instructions: IInstruction[] = [];

    let addressLookupTable = flags.addressLookupTable;
    if (!addressLookupTable) {
      const currentSlot = await rpc.getSlot({ commitment: "finalized" }).send();
      const lookupTable = await createAddressLookupTableForMarketInstructions(rpc, args.pool, signer, currentSlot);
      addressLookupTable = lookupTable.lookupTableAddress;
      instructions.push(...lookupTable.instructions);
      console.log("Market lookup table address is:", addressLookupTable);
    }

    instructions.push(
      await createMarketInstruction(signer, args.pool, {
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
      }),
    );

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction(instructions);
    console.log("Transaction landed:", signature);
  }
}
