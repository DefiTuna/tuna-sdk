import { withdrawInstructions } from "@crypticdot/defituna-client";
import { sendTransaction } from "@crypticdot/fusionamm-tx-sender";
import { address } from "@solana/kit";
import { fetchMint } from "@solana-program/token-2022";

import { loadKeypair, rpc } from "../utils/common";
import { USDC_MINT } from "../utils/consts";

export async function withdrawLendingPosition(): Promise<void> {
  const authority = await loadKeypair();

  const tokenMintAddress = address(USDC_MINT);
  const mint = await fetchMint(rpc, tokenMintAddress);

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
   * The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
   * Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds.
   */

  const instructions = await withdrawInstructions(
    rpc,
    authority,
    mint.address,
    undefined,
    nominalAmount * decimalsScale,
    0n,
  );

  /**
   * We sign and send the transaction to the network, which will withdraw from the `Lending Position`.
   */
  await sendTransaction(rpc, instructions, authority);
}

withdrawLendingPosition().catch(console.error);
