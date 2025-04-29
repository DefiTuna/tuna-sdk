import {
  collectAndCompoundFeesOrcaInstructions,
  fetchMarket,
  fetchTunaConfig,
  fetchTunaPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaPositionAddress,
  Market,
  TunaConfig,
  TunaPosition,
  Vault,
} from "@defituna/client";
import { fetchWhirlpool, Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, address, KeyPairSigner as _KeyPairSigner } from "@solana/kit";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { accountExists, loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";
/**
 * Collects fees from an *Orca Position* and compounds them back into the position via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset compounding settings for this example; these can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect and compound fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectAndCompoundFees(tunaPositionMint: Address): Promise<void> {
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
   * The {@link TunaConfig Tuna Config} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaConfigPda: Address = (await getTunaConfigAddress())[0];
  /**
   * The *Tuna Config* Account containing deserialized {@link TunaConfig data}, fetched using Tuna's Client
   */
  const tunaConfigAccount: Account<TunaConfig> = await fetchTunaConfig(rpc, tunaConfigPda);
  /**
   * The {@link _Market Market} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const marketPda: Address = (await getMarketAddress(whirlpoolPda))[0];
  /**
   * The *Market* Account containing deserialized {@link Market data}, fetched using Tuna's Client.
   */
  const marketAccount: Account<Market> = await fetchMarket(rpc, marketPda);
  /**
   * The {@link _TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaPositionPda: Address = (await getTunaPositionAddress(tunaPositionMint))[0];
  /**
   * The *Tuna Position* Account containing deserialized {@link TunaPosition data}, fetched using Tuna's Client.
   */
  const tunaPositionAccount: Account<TunaPosition> = await fetchTunaPosition(rpc, tunaPositionPda);
  /**
   * The {@link Vault Lending Vault} Program Derived {@link Address Address} for Token A for Tuna operations,
   * fetched from the Tuna Client.
   */
  const lendingVaultPdaA: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintA))[0];
  /**
   * The *Lending Vault* Account for Token A containing deserialized {@link Vault data}, fetched using Tuna's Client.
   */
  const lendingVaultAccountA: Account<Vault> = await fetchVault(rpc, lendingVaultPdaA);
  /**
   * The {@link Vault Lending Vault} Program Derived {@link Address Address} for Token B for Tuna operations,
   * fetched from the Tuna Client.
   */
  const lendingVaultPdaB: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintB))[0];
  /**
   * The *Lending Vault* Account for Token B containing deserialized {@link Vault data}, fetched using Tuna's Client.
   */
  const lendingVaultAccountB: Account<Vault> = await fetchVault(rpc, lendingVaultPdaB);

  /**
   * Defining input variables;
   */
  /**
   * Wheter to maintain the *leverage multiplier* by borrowing additional *tokens* from Tuna *Lending Vaults* to match the compounded fees.
   * For example, with fees of 0.005 *Token A* and 2.5 *Token B* and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
   * `true` for opting into keeping the *leverage multiplier* the same, and `false` otherwise.
   */
  const useLeverage = true;

  /**
   * Creation of instructions for collecting and compounding fees;
   */
  /**
   * The CollectAndCompoundFeesOrca instruction created via the Tuna Client, handling:
   * - Collecting the fees accrued in the *Whirlpool* through the *Orca Position* and transferring them back into the Position.
   * - Potentially maintaining the *leverage multiplier* the same, by borrowing an equal amount of *Tokens* as the compounded amount, controlled by `useLeverage`.
   */
  const collectAndCompoundFeesInstructions = await collectAndCompoundFeesOrcaInstructions(
    authority,
    tunaPositionAccount,
    tunaConfigAccount,
    lendingVaultAccountA,
    lendingVaultAccountB,
    whirlpoolAccount,
    useLeverage,
  );

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(authority, collectAndCompoundFeesInstructions, marketAccount.data.addressLookupTable);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectAndCompoundFees(address(tunaPositionMint)).catch(console.error);
