import { Address, createNoopSigner, TransactionSigner } from "@solana/kit";

import { DEFAULT_ADDRESS } from "../../src";

import { getNextKeypair } from "./keypair.ts";

/**
 * The default (null) address.
 */
export const DEFAULT_FUNDER: TransactionSigner = createNoopSigner(DEFAULT_ADDRESS);

/**
 * The currently selected funder for transactions.
 */
export let FUNDER: TransactionSigner = DEFAULT_FUNDER;

export const ALICE_KEYPAIR = getNextKeypair();
export const TUNA_ADMIN_KEYPAIR = getNextKeypair();
export const LIQUIDATOR_KEYPAIR = getNextKeypair();
export const FEE_RECIPIENT_KEYPAIR = getNextKeypair();

export const airdropAddresses = [ALICE_KEYPAIR, TUNA_ADMIN_KEYPAIR, LIQUIDATOR_KEYPAIR];

/**
 * Sets the default funder for transactions.
 *
 * @param {TransactionSigner | Address | null} funder - The funder to be set as default, either as an address or a transaction signer.
 */
export function setDefaultFunder(funder: TransactionSigner | Address | null): void {
  if (typeof funder === "string") {
    FUNDER = createNoopSigner(funder);
  } else {
    FUNDER = funder ?? createNoopSigner(DEFAULT_ADDRESS);
  }
}
