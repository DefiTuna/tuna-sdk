import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag } from "../base.ts";
import { rpc, sendTransaction, signer } from "../rpc.ts";
import { fetchMarket, getMarketAddress, updateMarketInstruction } from "@defituna/client";
import _ from "lodash";
import { Flags } from "@oclif/core";

// A devnet pool
// ORCA_POOL_DFT3_DFT4 = "5PbqRqB7erZQywntUq1LaJn7PpXFW1yvEjAUFNotDGbw"
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
    }),
    protocolFeeOnCollateral: Flags.integer({
      description: "Protocol fee on collateral",
    }),
    protocolFee: Flags.integer({
      description: "Protocol fee on borrowed funds",
    }),
    limitOrderExecutionFee: Flags.integer({
      description: "Limit order execution fee",
    }),
    liquidationFee: Flags.integer({
      description: "Position liquidation fee",
    }),
    liquidationThreshold: Flags.integer({
      description: "Liquidation threshold",
    }),
    borrowLimitA: bigintFlag({
      description: "Borrow limit A. Set to zero for unlimited borrowing",
    }),
    borrowLimitB: bigintFlag({
      description: "Borrow limit B. Set to zero for unlimited borrowing",
    }),
    oraclePriceDeviationThreshold: bigintFlag({
      description: "Oracle price deviation threshold from the spot price",
    }),
    maxSwapSlippage: bigintFlag({
      description: "Maximum allowed swap slippage on the market",
    }),
  };
  static override description = "Update a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE --maxLeverage 5090000 --protocolFee 500 --liquidationFee 50000 --liquidationThreshold 810000",
  ];

  public async run() {
    const { args, flags } = await this.parse(UpdateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];
    console.log("Fetching market:", marketAddress);
    const market = await fetchMarket(rpc, marketAddress);
    console.log("Market fetched:");
    console.log(market);

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
      newData.oraclePriceDeviationThreshold = flags.oraclePriceDeviationThreshold;
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
