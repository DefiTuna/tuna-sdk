import {
  fetchVault,
  getLendingVaultAddress,
  getSocializeBadDebtInstruction,
  getTunaConfigAddress,
} from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";

import BaseCommand, { addressArg } from "../base";
import { rpc, signer } from "../rpc";

export default class SocializeBadDebt extends BaseCommand {
  static override args = {
    mint: addressArg({
      description: "Token mint address",
      required: true,
    }),
    market: addressArg({
      description: "Permissionless market address",
    }),
  };
  static override description = "Socialize the bad debt in a lending vault";
  static override examples = ["<%= config.bin %> <%= command.id %> So11111111111111111111111111111111111111112"];

  public async run() {
    const { args } = await this.parse(SocializeBadDebt);

    const [tunaConfigAddress] = await getTunaConfigAddress();
    const [vaultAddress] = await getLendingVaultAddress(args.mint, args.market);

    console.log("Fetching vault:", vaultAddress);
    const vault = await fetchVault(rpc, vaultAddress);
    if (!vault.data.unpaidDebtShares) {
      console.log("No bad debt to socialize!");
      return;
    }

    console.log(`Socializing bad debt of ${vault.data.unpaidDebtShares} shares...`);
    const ix = getSocializeBadDebtInstruction({
      authority: signer,
      tunaConfig: tunaConfigAddress,
      vault: vaultAddress,
    });

    console.log("Sending a transaction...");
    const signature = await sendTransaction(rpc, [ix], signer);
    console.log("Transaction landed:", signature);
  }
}
