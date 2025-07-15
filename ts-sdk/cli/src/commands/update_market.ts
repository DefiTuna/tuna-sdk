import {
  createAddressLookupTableForMarketInstructions,
  fetchMarket,
  getMarketAddress,
  HUNDRED_PERCENT,
  LEVERAGE_ONE,
  MAX_LEVERAGE,
  MAX_LIMIT_ORDER_EXECUTION_FEE,
  MAX_LIQUIDATION_FEE,
  MAX_LIQUIDATION_THRESHOLD,
  MAX_PROTOCOL_FEE,
  updateMarketInstruction,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { Flags } from "@oclif/core";
import _ from "lodash";

import BaseCommand, { addressArg, addressFlag, bigintFlag, percentFlag } from "../base";
import { rpc, signer } from "../rpc";

// A devnet pool
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
    disabled: Flags.integer({
      description: "Indicates if the market is disabled",
      min: 0,
      max: 1,
    }),
    addressLookupTable: addressFlag({
      description: "Address lookup table",
    }),
    recreateAddressLookupTable: Flags.boolean({
      description: "Creates a new address lookup table for the market",
    }),
    maxLeverage: percentFlag({
      description: "Maximum allowed leverage for the market (hundredths of a basis point or %)",
      min: LEVERAGE_ONE,
      max: MAX_LEVERAGE,
    }),
    protocolFeeOnCollateral: percentFlag({
      description: "Protocol fee on collateral (hundredths of a basis point or %)",
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    protocolFee: percentFlag({
      description: "Protocol fee on borrowed funds (hundredths of a basis point or %)",
      min: 0,
      max: MAX_PROTOCOL_FEE,
    }),
    limitOrderExecutionFee: percentFlag({
      description: "Limit order execution fee (hundredths of a basis point or %)",
      min: 0,
      max: MAX_LIMIT_ORDER_EXECUTION_FEE,
    }),
    liquidationFee: percentFlag({
      description: "Position liquidation fee (hundredths of a basis point or %)",
      min: 0,
      max: MAX_LIQUIDATION_FEE,
    }),
    liquidationThreshold: percentFlag({
      description: "Liquidation threshold (hundredths of a basis point or %)",
      min: 0,
      max: MAX_LIQUIDATION_THRESHOLD,
    }),
    borrowLimitA: bigintFlag({
      description: "Borrow limit A. Set to zero for unlimited borrowing",
    }),
    borrowLimitB: bigintFlag({
      description: "Borrow limit B. Set to zero for unlimited borrowing",
    }),
    oraclePriceDeviationThreshold: percentFlag({
      description: "Oracle price deviation threshold from the spot price (hundredths of a basis point or %)",
      min: 0,
      max: HUNDRED_PERCENT,
    }),
    maxSwapSlippage: percentFlag({
      description: "Maximum allowed swap slippage for the market (hundredths of a basis point or %)",
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
  static override description = "Update a tuna market";
  static override examples = [
    "<%= config.bin %> <%= command.id %> Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE --maxLeverage 509% --protocolFee 0.05% --liquidationFee 5% --liquidationThreshold 83%",
  ];

  public async run() {
    const { args, flags } = await this.parse(UpdateMarket);

    const marketAddress = (await getMarketAddress(args.pool))[0];
    console.log("Fetching market:", marketAddress);
    const market = await fetchMarket(rpc, marketAddress);
    console.log("Market:", market);

    const newData = _.clone(market.data);

    if (flags.disabled !== undefined) {
      newData.disabled = flags.disabled != 0;
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

    if (flags.recreateAddressLookupTable) {
      if (flags.addressLookupTable !== undefined) {
        throw new Error("'recreateAddressLookupTable' parameter can't be used together with 'addressLookupTable'");
      }

      const currentSlot = await rpc.getSlot({ commitment: "finalized" }).send();
      const lookupTable = await createAddressLookupTableForMarketInstructions(
        rpc,
        args.pool,
        market.data.marketMaker,
        signer,
        currentSlot,
      );
      newData.addressLookupTable = lookupTable.lookupTableAddress;
      console.log("Market lookup table address is:", newData.addressLookupTable);

      console.log("");
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, lookupTable.instructions, signer);
      console.log("Transaction landed:", signature);
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
      rebalanceProtocolFee: flags.rebalanceProtocolFee,
    });

    console.log("");
    if (!_.isEqual(newData, market.data)) {
      console.log("Sending a transaction...");
      const signature = await sendTransaction(rpc, [ix], signer);
      console.log("Transaction landed:", signature);
    } else {
      console.log("Nothing to update!");
    }
  }
}
