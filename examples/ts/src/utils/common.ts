import { fetchVault, Vault as _Vault } from "@defituna/client";
import { _TICK_ARRAY_SIZE } from "@orca-so/whirlpools-core";
import {
  AccountInfoBase as _AccountInfoBase,
  Address,
  createKeyPairSignerFromBytes,
  KeyPairSigner,
  Rpc,
  SolanaRpcApi,
} from "@solana/kit";
import { fetchMint, Mint as _Mint } from "@solana-program/token";
import fs from "fs";
import os from "os";
import path from "path";

export const loadKeypair = async (): Promise<KeyPairSigner> => {
  try {
    const keypairFile = fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"));
    const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
    return await createKeyPairSignerFromBytes(keypairBytes);
  } catch (error) {
    throw new Error(`Failed to load keypair: ${error.message}`);
  }
};

/**
 * Fetches the {@link _Mint Mint} Account for the {@link Address `tokenMintAddress`} provided and returns the decimals from the Account's data.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc RPC} client for Solana blockchain interactions.
 * @param {Address} tokenMintAddress - The {@link Address address} of the *Mint* account to be fetched.
 * @returns {number} A promise resolving to the decimals value for the *Mint* account fetched
 * via  {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
 */
export const getMintDecimals = async (rpc: Rpc<SolanaRpcApi>, tokenMintAddress: Address): Promise<number> => {
  const { data: mintData } = await fetchMint(rpc, tokenMintAddress);
  return mintData.decimals;
};

/**
 * Fetches the {@link _AccountInfoBase AccountInfo} for the {@link Address address} provided and returns true if account exists and false otherwise.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc RPC} client for Solana blockchain interactions.
 * @param {Address} address - The {@link Address address} of the account to be fetched.
 * @returns {number} A promise resolving to a *Boolean* for whether the account exists or not.
 */
export const accountExists = async (rpc: Rpc<SolanaRpcApi>, address: Address): Promise<boolean> => {
  const { value: accountInfo } = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  return Boolean(accountInfo);
};

/**
 * Fetches the {@link _Vault Lending Vault} Account for the {@link Address `lendingVaultAddress`} provided and returns the
 * `pythOraclePriceUpdate` {@link Address address}  from the Account's data.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc RPC} client for Solana blockchain interactions.
 * @param {Address} lendingVaultAddress - The {@link Address address} of the *Lending Vaut* account to be fetched.
 * @returns {number} A promise resolving to the `pythOraclePriceUpdate` value for the *Lending Vaut* account fetched
 * via Tunas's Client.
 */
export const getPythOraclePriceFeed = async (
  rpc: Rpc<SolanaRpcApi>,
  lendingVaultAddress: Address,
): Promise<Address> => {
  const { data: lendingVaultData } = await fetchVault(rpc, lendingVaultAddress);
  return lendingVaultData.pythOraclePriceUpdate;
};
