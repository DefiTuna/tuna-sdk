import { DefitunaIDL } from "@defituna/idl";
import { Address, createSolanaRpc, getBase64Encoder } from "@solana/web3.js";

const TUNA_PROGRAM_ID = "tuna4uSQZncNeeiAMKbstuxA9CUkHH6HmC64wgmnogD" as Address;

const base64Encoder = getBase64Encoder();
const rpc = createSolanaRpc(process.env.RPC_URL!);

export async function getMarkets() {
  const accounts = await rpc
    .getProgramAccounts(TUNA_PROGRAM_ID, {
      filters: [{ dataSize: BigInt(DefitunaIDL.getMarketSize()) }],
      commitment: "processed",
      encoding: "base64",
      withContext: false,
    })
    .send();

  const decoder = DefitunaIDL.getMarketDecoder();

  const encodedAccounts = accounts.map(({ account: { data } }) => base64Encoder.encode(data[0]));
  const decodedAccounts = encodedAccounts.map(x => decoder.decode(x));

  return decodedAccounts.map((data, i) => ({
    ...accounts[i].account,
    address: accounts[i].pubkey,
    data,
  }));
}

export async function getVaults() {
  const accounts = await rpc
    .getProgramAccounts(TUNA_PROGRAM_ID, {
      filters: [{ dataSize: BigInt(DefitunaIDL.getVaultSize()) }],
      commitment: "processed",
      encoding: "base64",
      withContext: false,
    })
    .send();

  const decoder = DefitunaIDL.getVaultDecoder();

  const encodedAccounts = accounts.map(({ account: { data } }) => base64Encoder.encode(data[0]));
  const decodedAccounts = encodedAccounts.map(x => decoder.decode(x));

  return decodedAccounts.map((data, i) => ({
    ...accounts[i].account,
    address: accounts[i].pubkey,
    data,
  }));
}
