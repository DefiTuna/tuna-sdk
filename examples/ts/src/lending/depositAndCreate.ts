import { openLendingPositionAndDepositInstructions } from "@crypticdot/defituna-client";
import { address } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";
import { USDC_MINT } from "src/constants";
import { loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Deposits into a *Lending Position*, creating the position if it doesn't exist.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function depositAndCreateLendingPosition(): Promise<void> {
  const tokenMintAddress = address(USDC_MINT);
  const mint = await fetchMint(rpc, tokenMintAddress);

  /**
   * Define variables and accounts for Open Lending Position and Deposit operation;
   */
  /**
   * The {@link _KeyPairSigner keypair} signing the transaction and owning the *Lending Position*,
   * defaults to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();
  /**
   * The nominal amount to deposit, excluding *Token* decimals (e.g., 1 SOL as a flat value).
   * Note For deai
   */
  const nominalAmount = 1n;
  /**
   * The decimal scale to adjust nominal amounts for the Token based on its decimals.
   */
  const decimalsScale = BigInt(Math.pow(10, mint.data.decimals));

  /**
   * The instructions that interact with the Tuna program to open a Lending Position, if still not opened,
   * and deposit the funds into the lending position.
   */

  const instructions = await openLendingPositionAndDepositInstructions(
    rpc,
    authority,
    mint.address,
    nominalAmount * decimalsScale,
  );

  /**
   * We sign and send the transaction to the network, which will create (if necessary) and deposit into the `Lending Position`.
   */
  await createAndSendTransaction(authority, instructions);
}

depositAndCreateLendingPosition().catch(console.error);
