import BaseCommand, { addressArg } from "../base.ts";
import { sendTransaction, signer } from "../rpc.ts";
import { createTunaConfigInstruction } from "@defituna/client";

export default class CreateTunaConfig extends BaseCommand {
  static override args = {
    ownerAuthority: addressArg({
      description: "Owner authority",
      required: true,
    }),
    adminAuthority: addressArg({
      description: "Administrator authority",
      required: true,
    }),
    liquidationAuthority: addressArg({ description: "Liquidator authority", required: true }),
    feeRecipient: addressArg({
      description: "Authority who receives all protocol fees of the platform",
      required: true,
    }),
  };
  static override description = "Create a global tuna config";
  static override examples = ["<%= config.bin %> <%= command.id %> address address address address"];

  public async run() {
    const { args } = await this.parse(CreateTunaConfig);

    const ix = await createTunaConfigInstruction(signer, args.adminAuthority, args.feeRecipient, args.liquidationAuthority, args.ownerAuthority);

    console.log("");
    console.log("Sending a transaction...");
    const signature = await sendTransaction([ix]);
    console.log("Transaction landed:", signature);
  }
}
