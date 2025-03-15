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
  Rpc,
  RpcSubscriptions,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  Signature,
  signTransactionMessageWithSigners,
  SolanaRpcApi,
  SolanaRpcSubscriptionsApi,
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
import { MAX_CU_LIMIT, MIN_COMPUTE_UNIT_PRICE } from "examples/constants";
import { AtaInstructions, SolanaAddressLookupTable, SolanaTransactionSimulation } from "examples/types";

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
  const [associateTokenAddress] = await findAssociatedTokenPda({ mint, owner, tokenProgram });

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
 * @param {KeyPairSigner} signer - The {@link KeyPairSigner keypair signer} of the account authorizing the transaction.
 * @param {IInstruction[]} instructions - An array of {@link IInstruction instructions} to be executed by the transaction.
 * @param {number} [computeUnitLimit] - Optional limit for *Compute Units* used in the transaction, which, combined with a fetched
 * *Priority Fee*, determines transaction prioritization. If undefined, it’s estimated with a buffer (up to *MAX_CU_LIMIT*).
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

  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

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

const simulateTransaction = async (
  rpc: Rpc<SolanaRpcApi>,
  txm: CompilableTransactionMessage,
  failedAttempts = 0,
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
