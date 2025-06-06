import { createKeyPairSignerFromBytes, createSolanaRpc, KeyPairSigner } from "@solana/kit";
import { configDotenv } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";

configDotenv({ path: "./.env" });

export const loadKeypair = async (): Promise<KeyPairSigner> => {
  try {
    const keypairFile = fs.readFileSync(path.join(os.homedir(), ".config", "solana", "id.json"));
    const keypairBytes = new Uint8Array(JSON.parse(keypairFile.toString()));
    return await createKeyPairSignerFromBytes(keypairBytes);
  } catch (error) {
    throw new Error(`Failed to load keypair: ${error.message}`);
  }
};

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
export const rpc = createSolanaRpc(RPC_URL);
