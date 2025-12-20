import {
  fetchVault,
  getLendingVaultAddress,
  repayBadDebtInstruction,
  sharesToFunds,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class RepayBadDebt extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
  };
  static override description = "Repay the bad debt in a lending vault";
  static override examples = ["<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112"];

  public async run() {
    const { args } = await this.parse(RepayBadDebt);

    const vaultAddress = (await getLendingVaultAddress(args.mint))[0];

    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchVault(rpc, vaultAddress);
    if (!vault.data.unpaidDebtShares) {
      console.log("No bad debt to repay!");
      return;
    }

    const shares = vault.data.unpaidDebtShares;
    const funds = sharesToFunds(vault.data.unpaidDebtShares, vault.data.borrowedFunds, vault.data.borrowedShares, true);
    console.log(`Repaying bad debt shares/funds: ${shares}/${funds}`);
    const ix = await repayBadDebtInstruction(rpc, signer, vault.data.mint, 0n, vault.data.unpaidDebtShares);

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, [ix], signer);
    console.log("Transaction landed:", signature);
  }
}
