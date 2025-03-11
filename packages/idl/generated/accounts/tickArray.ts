/**
 * This code was AUTOGENERATED using the codama library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun codama to update it.
 *
 * @see https://github.com/codama-idl/codama
 */

import {
  assertAccountExists,
  assertAccountsExist,
  combineCodec,
  decodeAccount,
  fetchEncodedAccount,
  fetchEncodedAccounts,
  fixDecoderSize,
  fixEncoderSize,
  getAddressDecoder,
  getAddressEncoder,
  getArrayDecoder,
  getArrayEncoder,
  getBytesDecoder,
  getBytesEncoder,
  getI32Decoder,
  getI32Encoder,
  getStructDecoder,
  getStructEncoder,
  transformEncoder,
  type Account,
  type Address,
  type Codec,
  type Decoder,
  type EncodedAccount,
  type Encoder,
  type FetchAccountConfig,
  type FetchAccountsConfig,
  type MaybeAccount,
  type MaybeEncodedAccount,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  getTickDecoder,
  getTickEncoder,
  type Tick,
  type TickArgs,
} from "../types";

export const TICK_ARRAY_DISCRIMINATOR = new Uint8Array([
  69, 97, 189, 190, 110, 7, 66, 187,
]);

export function getTickArrayDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(TICK_ARRAY_DISCRIMINATOR);
}

export type TickArray = {
  discriminator: ReadonlyUint8Array;
  startTickIndex: number;
  ticks: Array<Tick>;
  whirlpool: Address;
};

export type TickArrayArgs = {
  startTickIndex: number;
  ticks: Array<TickArgs>;
  whirlpool: Address;
};

export function getTickArrayEncoder(): Encoder<TickArrayArgs> {
  return transformEncoder(
    getStructEncoder([
      ["discriminator", fixEncoderSize(getBytesEncoder(), 8)],
      ["startTickIndex", getI32Encoder()],
      ["ticks", getArrayEncoder(getTickEncoder(), { size: 88 })],
      ["whirlpool", getAddressEncoder()],
    ]),
    (value) => ({ ...value, discriminator: TICK_ARRAY_DISCRIMINATOR }),
  );
}

export function getTickArrayDecoder(): Decoder<TickArray> {
  return getStructDecoder([
    ["discriminator", fixDecoderSize(getBytesDecoder(), 8)],
    ["startTickIndex", getI32Decoder()],
    ["ticks", getArrayDecoder(getTickDecoder(), { size: 88 })],
    ["whirlpool", getAddressDecoder()],
  ]);
}

export function getTickArrayCodec(): Codec<TickArrayArgs, TickArray> {
  return combineCodec(getTickArrayEncoder(), getTickArrayDecoder());
}

export function decodeTickArray<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress>,
): Account<TickArray, TAddress>;
export function decodeTickArray<TAddress extends string = string>(
  encodedAccount: MaybeEncodedAccount<TAddress>,
): MaybeAccount<TickArray, TAddress>;
export function decodeTickArray<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress> | MaybeEncodedAccount<TAddress>,
): Account<TickArray, TAddress> | MaybeAccount<TickArray, TAddress> {
  return decodeAccount(
    encodedAccount as MaybeEncodedAccount<TAddress>,
    getTickArrayDecoder(),
  );
}

export async function fetchTickArray<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig,
): Promise<Account<TickArray, TAddress>> {
  const maybeAccount = await fetchMaybeTickArray(rpc, address, config);
  assertAccountExists(maybeAccount);
  return maybeAccount;
}

export async function fetchMaybeTickArray<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig,
): Promise<MaybeAccount<TickArray, TAddress>> {
  const maybeAccount = await fetchEncodedAccount(rpc, address, config);
  return decodeTickArray(maybeAccount);
}

export async function fetchAllTickArray(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig,
): Promise<Account<TickArray>[]> {
  const maybeAccounts = await fetchAllMaybeTickArray(rpc, addresses, config);
  assertAccountsExist(maybeAccounts);
  return maybeAccounts;
}

export async function fetchAllMaybeTickArray(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig,
): Promise<MaybeAccount<TickArray>[]> {
  const maybeAccounts = await fetchEncodedAccounts(rpc, addresses, config);
  return maybeAccounts.map((maybeAccount) => decodeTickArray(maybeAccount));
}

export function getTickArraySize(): number {
  return 9988;
}
