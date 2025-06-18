import { fetchTunaConfig, getTunaConfigAddress } from "@crypticdot/defituna-client";

import BaseCommand from "../base";
import { rpc } from "../rpc";

export default class FetchTunaConfig extends BaseCommand {
  static override description = "Fetch the tuna config";
  static override examples = ["<%= config.bin %> <%= command.id %>"];

  public async run() {
    console.log("Fetching the Tuna config...");
    const tunaConfigAddress = (await getTunaConfigAddress())[0];
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
    console.log("Tuna config:", tunaConfig);
  }
}
