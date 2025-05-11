import { createKeyPairSignerFromBytes, KeyPairSigner } from "@solana/kit";
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
