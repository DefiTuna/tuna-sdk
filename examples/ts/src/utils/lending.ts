import {
  getLendingPositionAddress,
  getLendingVaultAddress,
  getTunaConfigAddress,
  LendingPosition as _LendingPosition,
  Vault as _Vault,
} from "@defituna/client";
import { Address, address, KeyPairSigner as _KeyPairSigner, KeyPairSigner, Rpc, SolanaRpcApi } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getMintDecimals, loadKeypair } from "src/utils/common";

/**
 * Prepares accounts and parameters for Tuna *lending pool* operations on the Solana blockchain.
 * @param rpc - The {@link Rpc RPC} client for Solana blockchain interactions.
 * @returns {Promise<{ tokenMintAddress: Address, nominalAmount: bigint, authority: KeyPairSigner, tunaConfigPda: Address, vaultPda: Address, lendingPositionPda: Address, authorityAta: Address, vaultAta: Address, decimalsScale: bigint }>}
 */
export async function prepareLendingAccountsAndParameters(rpc: Rpc<SolanaRpcApi>): Promise<{
  tokenMintAddress: Address;
  nominalAmount: bigint;
  authority: KeyPairSigner;
  tunaConfigPda: Address;
  vaultPda: Address;
  lendingPositionPda: Address;
  authorityAta: Address;
  vaultAta: Address;
  decimalsScale: bigint;
}> {
  /**
   * Define variables and accounts for Tuna *lending* operations;
   */
  /**
   * The {@link Address address} of the token mint to deposit/withdraw, identifying the target Tuna *Lending Vault*.
   * Set to the USDC token address in our examples;
   * There are methods in our sdk to fetch all available lending vaults and their respective mint addresses.
   */
  const tokenMintAddress: Address = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  /**
   * The nominal amount to deposit, excluding *Token* decimals (e.g., 1 SOL as a flat value).
   * Note For deai
   */
  const nominalAmount = 1n;
  /**
   * The {@link _KeyPairSigner keypair} signing the transaction and owning the *Lending Position*,
   * defaults to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();

  /**
   * The {@link TunaConfig Tuna Config} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaConfigPda = (await getTunaConfigAddress())[0];
  /**
   * The {@link _Vault Lending Vault} Program Derived {@link Address address}, fetched from the Tuna Client.
   * Derived from the token mint address.
   */
  const vaultPda = (await getLendingVaultAddress(tokenMintAddress))[0];
  /**
   * The {@link _LendingPosition Lending Position} Program Derived {@link Address address}, fetched from the Tuna Client.
   * Derived from the authority (user) address and the token mint address.
   */
  const lendingPositionPda = (await getLendingPositionAddress(authority.address, tokenMintAddress))[0];

  /**
   * The Associated Token {@link Address Address}, owned by the *authority*.
   */
  const authorityAta = (
    await findAssociatedTokenPda({
      mint: tokenMintAddress,
      owner: authority.address,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];
  /**
   * The Associated Token {@link Address Address}, owned by the *Lending Vault*.
   */
  const vaultAta = (
    await findAssociatedTokenPda({
      mint: tokenMintAddress,
      owner: vaultPda,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  /**
   * Fetches token decimals for the Token, using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const decimals = await getMintDecimals(rpc, tokenMintAddress);
  /**
   * The decimal scale to adjust nominal amounts for the Token based on its decimals.
   */
  const decimalsScale = BigInt(Math.pow(10, decimals));

  return {
    tokenMintAddress,
    nominalAmount,
    authority,
    tunaConfigPda,
    vaultPda,
    lendingPositionPda,
    authorityAta,
    vaultAta,
    decimalsScale,
  };
}
