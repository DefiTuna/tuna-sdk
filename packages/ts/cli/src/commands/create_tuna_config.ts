import { address, Address } from "@solana/kit";
import { sendTransaction, signer } from "../utils/rpc";
import { createTunaConfigInstruction } from "@defituna/client";

if (process.argv.length < 7) {
  console.log("Not enough arguments for the command");
  console.log("");
  console.log("Usage: pnpm run start create_tuna_config owner_authority admin_authority liquidation_authority fee_recipient");
  console.log("");
  console.log("owner_authority          address       Owner authority.");
  console.log("admin_authority          address       Administrator authority.");
  console.log("liquidation_authority    address       Liquidator authority.");
  console.log("fee_recipient            address       Authority who receives all protocol fees of the platform.");
} else {
  await run(address(process.argv[3]), address(process.argv[4]), address(process.argv[5]), address(process.argv[6]));
}

async function run(ownerAuthority: Address, adminAuthority: Address, liquidationAuthority: Address, feeRecipient: Address) {
  const ix = await createTunaConfigInstruction(signer, adminAuthority, feeRecipient, liquidationAuthority, ownerAuthority);

  const signature = await sendTransaction([ix]);
  console.log("Transaction landed:", signature);
}
