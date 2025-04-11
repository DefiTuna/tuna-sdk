import {
  Account,
  Address,
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  fetchJsonParsedAccount,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  getSignatureFromTransaction,
  IInstruction,
  KeyPairSigner,
  pipe,
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
  VariableSizeDecoder,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCloseAccountInstruction,
  getCreateAssociatedTokenInstructionAsync,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { MAX_CU_LIMIT, MIN_COMPUTE_UNIT_PRICE } from "src/constants";
import { AtaInstructions, SolanaAddressLookupTable, SolanaTransactionSimulation } from "src/types";

import { accountExists, isWSolMint } from "./common";

/**
 * Creates or retrieves an *Associated Token Address* (*ATA*) on the Solana blockchain, adding creation instructions if needed.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc rpc} client for Solana blockchain interactions.
 * @param {AtaInstructions} ataInstructions - {@link AtaInstructions Object} containing arrays of {@link IInstruction instructions} (createAtaIxs and closeWSolAtaIxs),
 * to push new instructions as required.
 * @param {KeyPairSigner} payer - The {@link KeyPairSigner Keypair payer} funding the instruction fees.
 * @param {Address} mint - The {@link Address address} of the *Token Mint*.
 * @param {Address} owner - The {@link Address address} of the *ATA* owner.
 * @param {Address} [tokenProgram] - The optional {@link Address address} of the Token Program, defaults to {@link TOKEN_PROGRAM_ADDRESS TOKEN_PROGRAM_ADDRESS}
 * @returns {Promise<Address>}
 */
export const findOrCreateAta = async (
  rpc: Rpc<SolanaRpcApi>,
  ataInstructions: AtaInstructions,
  payer: KeyPairSigner,
  mint: Address,
  owner: Address,
  tokenProgram: Address = TOKEN_PROGRAM_ADDRESS,
): Promise<Address> => {
  const [associateTokenAddress] = await findAssociatedTokenPda({
    mint,
    owner,
    tokenProgram,
  });

  if (!(await accountExists(rpc, associateTokenAddress))) {
    ataInstructions.createAtaIxs.push(
      await getCreateAssociatedTokenInstructionAsync({
        mint,
        owner,
        payer,
      }),
    );
  }

  return associateTokenAddress;
};

/**
 * Creates or retrieves an *Associated Token Address* (*ATA*) on the Solana blockchain, handling the *WSOL* case with additional *instructions*.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc rpc} client for Solana blockchain interactions.
 * @param {AtaInstructions} ataInstructions - {@link AtaInstructions Object} containing arrays of {@link IInstruction instructions} (*createAtaIxs* and *closeWSolAtaIxs*),
 * to push new instructions as required.
 * @param {KeyPairSigner} authority - The {@link KeyPairSigner authority} keypair paying fees and authorizing potential *WSOL* transfers.
 * @param {Address} mint - The {@link Address address} of the *Token Mint*.
 * @param {Address} amount - The amount to transfer to the *ATA* if the *Token Mint* is *WSOL*.
 * @returns  {Promise<Address>}
 */
export const findOrCreateAtaWithAuth = async (
  rpc: Rpc<SolanaRpcApi>,
  ataInstructions: AtaInstructions,
  authority: KeyPairSigner,
  mint: Address,
  amount?: number,
): Promise<Address> => {
  const associateTokenAddress = await findOrCreateAta(rpc, ataInstructions, authority, mint, authority.address);

  if (isWSolMint(mint)) {
    if (amount && amount > 0) {
      ataInstructions.createAtaIxs.push(
        getTransferSolInstruction({
          source: authority,
          destination: associateTokenAddress,
          amount,
        }),
        getSyncNativeInstruction({
          account: associateTokenAddress,
        }),
      );
    }

    ataInstructions.closeWSolAtaIxs.push(
      getCloseAccountInstruction({
        account: associateTokenAddress,
        destination: authority.address,
        owner: authority.address,
      }),
    );
  }

  return associateTokenAddress;
};

/**
 * Constructs and sends a transaction on the Solana blockchain, signed by the provided keypair, with priority fees applied.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc rpc} client for Solana blockchain interactions.
 * @param {RpcSubscriptions<SolanaRpcSubscriptionsApi>} rpcSubscriptions - The {@link RpcSubscriptions rpcs subscriptions}
 * for real time updates on the Solana blockchain.
 * @param {KeyPairSigner} signer - The {@link KeyPairSigner keypair signer} of the account authorizing the transaction.
 * @param {IInstruction[]} instructions - An array of {@link IInstruction instructions} to be executed by the transaction.
 * @param {Address} [addressLookupTableAddress] - Optional {@link addressLookupTableAddress addressLookupTable address} for
 * efficiently handling more addresses per transaction.
 * @param {SolanaTransactionSimulation} [simulation] - Optional {@link SolanaTransactionSimulation similation} with the *computeUnitLimit*
 * used in the transaction, which, combined with a fetched *Priority Fee*, determines transaction prioritization.
 * If undefined, it’s estimated with a buffer (up to *MAX_CU_LIMIT*).
 * @returns {Promise<Signature>} A promise resolving to the {@link Signature signature} of the confirmed transaction.
 */
export const createAndSendTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>,
  signer: KeyPairSigner,
  instructions: IInstruction[],
  addressLookupTableAddress?: Address,
  simulation?: SolanaTransactionSimulation,
): Promise<Signature> => {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });

  let transactionMessage = pipe(
    createTransactionMessage({ version: 0 }),
    txMessage => setTransactionMessageFeePayer(signer.address, txMessage),
    txMessage => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, txMessage),
    txMessage => {
      const setComputeUnitLimitInstruction = getSetComputeUnitLimitInstruction({
        units: simulation?.computeUnitLimit ?? MAX_CU_LIMIT,
      });
      const setComputeUnitPriceInstruction = getSetComputeUnitPriceInstruction({
        microLamports: MIN_COMPUTE_UNIT_PRICE,
      });
      const ixs = [setComputeUnitLimitInstruction, setComputeUnitPriceInstruction, ...instructions];
      return appendTransactionMessageInstructions(ixs, txMessage);
    },
  );

  if (addressLookupTableAddress) {
    const addressLookupAccount = await fetchJsonParsedAccount<SolanaAddressLookupTable>(rpc, addressLookupTableAddress);
    if (!addressLookupAccount.exists) throw new Error("No address lookup table");
    const addressLookupTable = addressLookupAccount.data as SolanaAddressLookupTable;
    transactionMessage = compressTransactionMessageUsingAddressLookupTables(transactionMessage, {
      [addressLookupTableAddress]: addressLookupTable.addresses,
    });
  }

  /** Estimate compute units and recursively retry if limit is undefined */
  if (!simulation) {
    const simulation = await simulateTransaction(rpc, transactionMessage);

    return createAndSendTransaction(rpc, rpcSubscriptions, signer, instructions, addressLookupTableAddress, simulation);
  }

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

  sendAndConfirmTransaction(signedTransaction, {
    skipPreflight: true,
    commitment: "confirmed",
    maxRetries: 0n,
  });

  return getSignatureFromTransaction(signedTransaction);
};

/**
 * Simulates a transaction on the Solana blockchain, calculating and returning the `computeUnitLimit` necessary for the transaction.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc rpc} client for Solana blockchain interactions.
 * @param {CompilableTransactionMessage} txm - The {@link CompilableTransactionMessage transaction message} containg all accounts and instructions.
 * @param {Number} failedAttempts - The failed attemps counter (between 0 and 3). Increases for every failed attempt.
 * @returns {Promise<SolanaTransactionSimulation>} A promise resolving to a object containing the `computeUnitLimit`.
 */
const simulateTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  txm: CompilableTransactionMessage,
  failedAttempts: number = 0,
): Promise<SolanaTransactionSimulation> => {
  const transaction = compileTransaction(txm);
  const base64EncodedTransaction = getBase64EncodedWireTransaction(transaction);
  const simulation = await rpc.simulateTransaction(base64EncodedTransaction, { encoding: "base64" }).send();
  const {
    value: { unitsConsumed },
  } = simulation;

  if (!unitsConsumed) {
    if (failedAttempts === 3) {
      throw new Error("Simulation failed");
    }

    const nextFailedAttempts = failedAttempts + 1;
    return simulateTransaction(rpc, txm, nextFailedAttempts);
  }

  const computeUnitLimitWithReserve = Math.min(Number((unitsConsumed * 115n) / 100n), MAX_CU_LIMIT);
  return {
    computeUnitLimit: computeUnitLimitWithReserve,
  };
};

/**
 * Fetches decoded PDAs with specific filters.
 * @param {Rpc<SolanaRpcApi>} rpc - The {@link Rpc rpc} client for Solana blockchain interactions.
 * @param {GetProgramAccountsMemcmpFilter} memcmpFilter - The {@link GetProgramAccountsMemcmpFilter memcmp filter} to refine
 * the search for the Program accounts.
 * @param {GetProgramAccountsDatasizeFilter} dataSizeFilter - The {@link GetProgramAccountsDatasizeFilter size of the data filter} to refine
 * the search for the Program accounts.
 * @param {VariableSizeDecoder<T>} decoder - The decoder for the specific PDA and it's type.
 * @returns {Promise<SolanaTransactionSimulation>} A promise resolving to a object containing the `computeUnitLimit`.
 */
export async function fetchDecodedProgramAccounts<T extends object>(
  rpc: Rpc<SolanaRpcApi>,
  programAddress: Address,
  memcmpFilter: GetProgramAccountsMemcmpFilter,
  dataSizeFilter: GetProgramAccountsDatasizeFilter,
  decoder: VariableSizeDecoder<T>,
): Promise<Account<T>[]> {
  const accounts = await rpc
    .getProgramAccounts(programAddress, {
      encoding: "base64",
      filters: [memcmpFilter, dataSizeFilter],
    })
    .send();

  const base64Encoder = getBase64Encoder();

  const encodedAccounts = accounts.map(({ account: { data } }) => base64Encoder.encode(data[0]));
  const decodedAccounts = encodedAccounts.map(x => decoder.decode(x));
  return decodedAccounts.map((data, i) => ({
    ...accounts[i].account,
    address: accounts[i].pubkey,
    programAddress,
    data,
  }));
}
