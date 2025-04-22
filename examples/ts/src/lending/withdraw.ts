import { withdrawInstructions } from "@defituna/client";
import { Address, address } from "@solana/kit";
import { USDC_MINT } from "src/constants";
import { getMintDecimals, loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

export async function withdrawLendingPosition(): Promise<void> {
  /**
   * Define variables and accounts for Withdraw operation;
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
   * The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
   * Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds.
   */
  const instructions = await withdrawInstructions(authority, tokenMintAddress, nominalAmount * decimalsScale, 0n);

  /**
   * We sign and send the transaction to the network, which will withdraw from the `Lending Position`.
   */
  await createAndSendTransaction(authority, instructions);
}

withdrawLendingPosition().catch(console.error);
