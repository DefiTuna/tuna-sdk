import { Address, getAddressEncoder, KeyPairSigner } from "@solana/kit";
import { generateKeyPairSigner } from "@solana/kit";

function orderMints(mint1: Address, mint2: Address): [Address, Address] {
  const encoder = getAddressEncoder();
  const mint1Bytes = new Uint8Array(encoder.encode(mint1));
  const mint2Bytes = new Uint8Array(encoder.encode(mint2));
  return Buffer.compare(mint1Bytes, mint2Bytes) < 0 ? [mint1, mint2] : [mint2, mint1];
}

const keypairs = await Promise.all(
  Array(800)
    .fill(0)
    .map(() => generateKeyPairSigner()),
);
const orderedKeypairs = [...keypairs].sort((a, b) => (orderMints(a.address, b.address)[0] === a.address ? -1 : 1));
let index = 0;

/**
 * Because for certain functions mint keypairs need to be ordered correctly
 * we made this function to get the next keypair in such a way that it
 * is always ordered behind the previous one
 */
export function getNextKeypair(): KeyPairSigner {
  return orderedKeypairs[index++];
}
