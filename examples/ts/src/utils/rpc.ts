import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import {
  Address,
  appendTransactionMessageInstructions,
  CompilableTransactionMessage,
  compileTransaction,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  fetchJsonParsedAccount,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  IInstruction,
  KeyPairSigner,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import { configDotenv } from "dotenv";
import { MAX_CU_LIMIT, MIN_COMPUTE_UNIT_PRICE } from "src/constants";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

export const rpc = createSolanaRpc(RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);

type SolanaAddressLookupTable = {
  addresses: Address[];
};

/**
 * Constructs and sends a transaction on the Solana blockchain, signed by the provided keypair, with priority fees applied.
 * @param {KeyPairSigner} signer - The {@link KeyPairSigner keypair signer} of the account authorizing the transaction.
 * @param {IInstruction[]} instructions - An array of {@link IInstruction instructions} to be executed by the transaction.
 * @param {Address} [addressLookupTableAddress] - Optional {@link addressLookupTableAddress addressLookupTable address} for
 * efficiently handling more addresses per transaction.
 * @param {number} [computeUnitLimit] - Optional *computeUnitLimit*
 * used in the transaction, which, combined with a fetched *Priority Fee*, determines transaction prioritization.
 * If undefined, it’s estimated with a buffer (up to *MAX_CU_LIMIT*).
 * @returns {Promise<Signature>} A promise resolving to the {@link Signature signature} of the confirmed transaction.
 */
export const createAndSendTransaction = async (
  signer: KeyPairSigner,
  instructions: IInstruction[],
  addressLookupTableAddress?: Address,
  computeUnitLimit?: number,
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
        units: computeUnitLimit ?? MAX_CU_LIMIT,
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
  if (!computeUnitLimit) {
    const newComputeUnitLimit = await simulateTransaction(transactionMessage);

    return createAndSendTransaction(signer, instructions, addressLookupTableAddress, newComputeUnitLimit);
  }

  const signedTransaction = await signTransactionMessageWithSigners(transactionMessage);

  await sendAndConfirmTransaction(signedTransaction, {
    skipPreflight: true,
    commitment: "processed",
    maxRetries: 0n,
  });

  return getSignatureFromTransaction(signedTransaction);
};

/**
 * Simulates a transaction on the Solana blockchain, calculating and returning the `computeUnitLimit` necessary for the transaction.
 * @param {CompilableTransactionMessage} txm - The {@link CompilableTransactionMessage transaction message} containg all accounts and instructions.
 * @returns {Promise<number>} A promise resolving to the `computeUnitLimit`.
 */
const simulateTransaction = async (txm: CompilableTransactionMessage): Promise<number> => {
  const transaction = compileTransaction(txm);
  const base64EncodedTransaction = getBase64EncodedWireTransaction(transaction);
  const simulation = await rpc.simulateTransaction(base64EncodedTransaction, { encoding: "base64" }).send();
  const {
    value: { unitsConsumed },
  } = simulation;

  if (!unitsConsumed) throw new Error("Simulation failed");

  const computeUnitLimitWithReserve = Math.min(Number((unitsConsumed * 115n) / 100n), MAX_CU_LIMIT);
  return computeUnitLimitWithReserve;
};
