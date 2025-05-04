import BaseCommand, { addressArg, addressFlag, bigintFlag } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import {
  fetchMarket,
  getMarketAddress,
  updateMarketInstruction,
  MAX_LIMIT_ORDER_EXECUTION_FEE,
  MAX_LIQUIDATION_FEE,
  LEVERAGE_ONE,
  MAX_LEVERAGE,
  MAX_PROTOCOL_FEE,
  HUNDRED_PERCENT,
  MAX_LIQUIDATION_THRESHOLD,
} from "@defituna/client";
import _ from "lodash";
import { Flags } from "@oclif/core";

// A devnet pool
// ORCA_POOL_DFT3_DFT4 = "5PbqRqB7erZQywntUq1LaJn7PpXFW1yvEjAUFNotDGbw"
// ORCA_POOL_USDC_DFT5 = "FKH7TTE7PgPPSb9SaaMRKVTGA7xTbiJjeTujXY2xTdxp"

// A mainnet pool
// ORCA_POOL_SOL_USDC_004 = "Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"

export default class UpdateMarket extends BaseCommand {
  static override args = {
    pool: addressArg({
      description: "Pool address",
      required: true,
    }),
  };
  static override flags = {
    disabled: Flags.boolean({
      description: "Indicates if the market is disabled",
    }),
    addressLookupTable: addressFlag({
      description: "Address lookup table",
    }),
    maxLeverage: Flags.integer({
      description: "Maximum allowed leverage for the market",
      min: LEVERAGE_ONE,
      max: MAX_LEVERAGE,
    }),
    protocolFeeOnCollateral: Flags.integer({
      description: "Protocol fee on collateral",
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    protocolFee: Flags.integer({
      description: "Protocol fee on borrowed funds",
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    limitOrderExecutionFee: Flags.integer({
      description: "Limit order execution fee",
      min: 0,
      max: MAX_LIMIT_ORDER_EXECUTION_FEE,
    }),
    liquidationFee: Flags.integer({
      description: "Position liquidation fee",
      min: 0,
      max: MAX_LIQUIDATION_FEE,
    }),
    liquidationThreshold: Flags.integer({
      description: "Liquidation threshold",
      min: 0,
      max: MAX_LIQUIDATION_THRESHOLD,
    }),
    borrowLimitA: bigintFlag({
      description: "Borrow limit A. Set to zero for unlimited borrowing",
    }),
    borrowLimitB: bigintFlag({
      description: "Borrow limit B. Set to zero for unlimited borrowing",
    }),
    oraclePriceDeviationThreshold: Flags.integer({
      description: "Oracle price deviation threshold from the spot price",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
    maxSwapSlippage: Flags.integer({
      description: "Maximum allowed swap slippage for the market",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
  };
  static override description = "Update a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE --maxLeverage 5090000 --protocolFee 500 --liquidationFee 50000 --liquidationThreshold 830000",
  ];

  public async run() {
    const { args, flags } = await this.parse(UpdateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];
    console.log("Fetching market:", marketAddress);
    const market = await fetchMarket(rpc, marketAddress);
    console.log("Market:", market);

    const newData = _.clone(market.data);

    if (flags.disabled !== undefined) {
      newData.disabled = flags.disabled;
    }

    if (flags.addressLookupTable !== undefined) {
      newData.addressLookupTable = flags.addressLookupTable;
    }

    if (flags.maxLeverage !== undefined) {
      newData.maxLeverage = flags.maxLeverage;
    }

    if (flags.protocolFee !== undefined) {
      newData.protocolFee = flags.protocolFee;
    }

    if (flags.protocolFeeOnCollateral !== undefined) {
      newData.protocolFeeOnCollateral = flags.protocolFeeOnCollateral;
    }

    if (flags.limitOrderExecutionFee !== undefined) {
      newData.limitOrderExecutionFee = flags.limitOrderExecutionFee;
    }

    if (flags.liquidationFee !== undefined) {
      newData.liquidationFee = flags.liquidationFee;
    }

    if (flags.liquidationThreshold !== undefined) {
      newData.liquidationThreshold = flags.liquidationThreshold;
    }

    if (flags.borrowLimitA !== undefined) {
      newData.borrowLimitA = flags.borrowLimitA;
    }

    if (flags.borrowLimitB !== undefined) {
      newData.borrowLimitB = flags.borrowLimitB;
    }

    if (flags.oraclePriceDeviationThreshold !== undefined) {
      newData.oraclePriceDeviationThreshold =
        flags.oraclePriceDeviationThreshold;
    }

    if (flags.maxSwapSlippage !== undefined) {
      newData.maxSwapSlippage = flags.maxSwapSlippage;
    }

    const ix = await updateMarketInstruction(signer, args.pool, {
      disabled: newData.disabled,
      addressLookupTable: newData.addressLookupTable,
      maxLeverage: newData.maxLeverage,
      protocolFee: newData.protocolFee,
      protocolFeeOnCollateral: newData.protocolFeeOnCollateral,
      limitOrderExecutionFee: newData.limitOrderExecutionFee,
      liquidationFee: newData.liquidationFee,
      liquidationThreshold: newData.liquidationThreshold,
      borrowLimitA: newData.borrowLimitA,
      borrowLimitB: newData.borrowLimitB,
      oraclePriceDeviationThreshold: newData.oraclePriceDeviationThreshold,
      maxSwapSlippage: newData.maxSwapSlippage,
    });

    console.log("");
    if (!_.isEqual(newData, market.data)) {
      console.log("Sending a transaction...");
      const signature = await sendTransaction([ix]);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing to update!");
    }
  }
}
