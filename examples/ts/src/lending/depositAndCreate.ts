import { openLendingPositionAndDepositInstructions } from "@defituna/client";
import { Address, address } from "@solana/kit";
import { USDC_MINT } from "src/constants";
import { getMintDecimals, loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Deposits into a *Lending Position*, creating the position if it doesn't exist.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function depositAndCreateLendingPosition(): Promise<void> {
  /**
   * Define variables and accounts for Open Lending Position and Deposit operation;
   */
  /**
   * The {@link _KeyPairSigner keypair} signing the transaction and owning the *Lending Position*,
   * defaults to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();
  /**
   * The {@link Address address} of the token mint to deposit/withdraw, identifying the target Tuna *Lending Vault*.
   * Set to the USDC token address in our examples;
   * There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
   */
  const tokenMintAddress: Address = address(USDC_MINT);
  /**
   * The nominal amount to deposit, excluding *Token* decimals (e.g., 1 SOL as a flat value).
   * Note For deai
   */
  const nominalAmount = 1n;
  /**
   * Fetches token decimals for the Token, using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const decimals = await getMintDecimals(rpc, tokenMintAddress);
  /**
   * The decimal scale to adjust nominal amounts for the Token based on its decimals.
   */
  const decimalsScale = BigInt(Math.pow(10, decimals));

  /**
   * The instructions that interact with the Tuna program to open a Leding Position, if still not opened,
   * and deposit the funds into the lending position.
   */
  const instructions = await openLendingPositionAndDepositInstructions(
    rpc,
    authority,
    tokenMintAddress,
    nominalAmount * decimalsScale,
  );

  /**
   * We sign and send the transaction to the network, which will create (if necessary) and deposit into the `Lending Position`.
   */
  await createAndSendTransaction(authority, instructions);
}

depositAndCreateLendingPosition().catch(console.error);
