import { DefitunaIDL } from "@defituna/idl";
import { address, createSolanaRpc, getAddressEncoder, getBase64Decoder, getBase64Encoder } from "@solana/web3.js";

const TUNA_PROGRAM_ID = address("tuna4uSQZncNeeiAMKbstuxA9CUkHH6HmC64wgmnogD");

const base64Decoder = getBase64Decoder();
const base64Encoder = getBase64Encoder();
const addressEncoder = getAddressEncoder();
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

export async function getLendingPositions(userAddress: string) {
  const accounts = await rpc
    .getProgramAccounts(TUNA_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 11n, // Discriminator + version + bump
            bytes: base64Decoder.decode(addressEncoder.encode(address(userAddress))),
            encoding: "base64",
          },
        },
        { dataSize: BigInt(DefitunaIDL.getLendingPositionSize()) },
      ],
      commitment: "processed",
      encoding: "base64",
      withContext: false,
    })
    .send();

  const decoder = DefitunaIDL.getLendingPositionDecoder();

  const encodedAccounts = accounts.map(({ account: { data } }) => base64Encoder.encode(data[0]));
  const decodedAccounts = encodedAccounts.map(x => decoder.decode(x));

  return decodedAccounts.map((data, i) => ({
    ...accounts[i].account,
    address: accounts[i].pubkey,
    data,
  }));
}

export async function getTunaPositions(userAddress: string) {
  const accounts = await rpc
    .getProgramAccounts(TUNA_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 11n, // Discriminator + version + bump
            bytes: base64Decoder.decode(addressEncoder.encode(address(userAddress))),
            encoding: "base64",
          },
        },
        { dataSize: BigInt(DefitunaIDL.getTunaPositionSize()) },
      ],
      commitment: "processed",
      encoding: "base64",
      withContext: false,
    })
    .send();

  const decoder = DefitunaIDL.getTunaPositionDecoder();

  const encodedAccounts = accounts.map(({ account: { data } }) => base64Encoder.encode(data[0]));
  const decodedAccounts = encodedAccounts.map(x => decoder.decode(x));

  return decodedAccounts.map((data, i) => ({
    ...accounts[i].account,
    address: accounts[i].pubkey,
    data,
  }));
}
