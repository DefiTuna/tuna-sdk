import {
  collectFeesOrcaInstructions,
  fetchTunaPosition,
  getTunaPositionAddress,
  TunaConfig as _TunaConfig,
  TunaPosition as _TunaPosition,
  TunaPosition,
} from "@defituna/client";
import { fetchWhirlpool, Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, address, KeyPairSigner as _KeyPairSigner } from "@solana/kit";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { accountExists, loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Collects fees from an *Orca Position*, managed via Orca's Whirlpools smart contract.
 * Uses the SOL/USDC *Whirlpool* for this example; this can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectFees(tunaPositionMint: Address): Promise<void> {
  /**
   * Program Derived Addresses and Accounts, fetched from their respective Client (Tuna or Orca);
   */
  /**
   * The {@link _KeyPairSigner Keypair} signing the transaction and the owner of the {@link _TunaPosition Tuna Position}.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();
  /**
   * The Program Derived {@link Address Address} of the pool from Orca's Whirlpools to create the position in.
   * For this example we use the SOL/USDC Pool.
   */
  const whirlpoolPda: Address = SOL_USDC_WHIRLPOOL;
  if (!accountExists(rpc, whirlpoolPda)) throw new Error("Whirlpool Account does not exist.");
  /**
   * The Whirlpool Account containing deserialized {@link Whirlpool data},
   * fetched using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}
   */
  const whirlpoolAccount: Account<Whirlpool> = await fetchWhirlpool(rpc, whirlpoolPda);
  /**
   * The {@link _TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaPositionPda: Address = (await getTunaPositionAddress(tunaPositionMint))[0];
  /**
   * The *Tuna Position* Account containing deserialized {@link TunaPosition data}, fetched using Tuna's Client
   */
  const tunaPositionAccount: Account<TunaPosition> = await fetchTunaPosition(rpc, tunaPositionPda);

  /**
   * Creation of instructions for collecting fees.
   */
  /**
   * The CollectFeesOrca instruction created via the Tuna Client, handling:
   * - Collecting the fees accrued in the *Whirlpool* through the *Orca Position* and transferring them to the user.
   */
  const collectFeesInstructions = await collectFeesOrcaInstructions(authority, tunaPositionAccount, whirlpoolAccount);

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(authority, collectFeesInstructions);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectFees(address(tunaPositionMint)).catch(console.error);
