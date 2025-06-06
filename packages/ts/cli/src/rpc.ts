import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  IInstruction,
  KeyPairSigner,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { configDotenv } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";

async function loadKeypair(): Promise<KeyPairSigner> {
  try {
    const keypairFile = fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"));
    const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
    return await createKeyPairSignerFromBytes(keypairBytes);
  } catch (error: unknown) {
    throw new Error("Failed to load keypair: " + error);
  }
}

export async function sendTransaction(ixs: IInstruction[]) {
  const blockhash = await rpc.getLatestBlockhash().send();
  const transaction = await pipe(
    createTransactionMessage({ version: 0 }),
    x => appendTransactionMessageInstructions([...ixs], x),
    x => setTransactionMessageFeePayerSigner(signer, x),
    x => setTransactionMessageLifetimeUsingBlockhash(blockhash.value, x),
    x => signTransactionMessageWithSigners(x),
  );

  const signature = getSignatureFromTransaction(transaction);
  await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(transaction, {
    skipPreflight: false,
    commitment: "confirmed",
  });

  return signature;
}

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

export const rpc = createSolanaRpc(RPC_URL);
export const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);
export const signer = await loadKeypair();
