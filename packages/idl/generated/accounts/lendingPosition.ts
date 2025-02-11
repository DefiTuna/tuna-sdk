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
  getBytesDecoder,
  getBytesEncoder,
  getStructDecoder,
  getStructEncoder,
  getU16Decoder,
  getU16Encoder,
  getU64Decoder,
  getU64Encoder,
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
} from '@solana/web3.js';

export const LENDING_POSITION_DISCRIMINATOR = new Uint8Array([
  47, 255, 252, 35, 20, 245, 157, 243,
]);

export function getLendingPositionDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(
    LENDING_POSITION_DISCRIMINATOR
  );
}

export type LendingPosition = {
  discriminator: ReadonlyUint8Array;
  /** Struct version */
  version: number;
  /** Bump seed for the lending position account */
  bump: ReadonlyUint8Array;
  /** Authority address used for managing the position */
  authority: Address;
  /** Mint address of the token in the vault */
  poolMint: Address;
  /** The amount of funds provided by user. Used to compute earned amount. */
  depositedFunds: bigint;
  /** The amount of funds provided by user to the vault as shares */
  depositedShares: bigint;
  /** Reserved */
  reserved: ReadonlyUint8Array;
};

export type LendingPositionArgs = {
  /** Struct version */
  version: number;
  /** Bump seed for the lending position account */
  bump: ReadonlyUint8Array;
  /** Authority address used for managing the position */
  authority: Address;
  /** Mint address of the token in the vault */
  poolMint: Address;
  /** The amount of funds provided by user. Used to compute earned amount. */
  depositedFunds: number | bigint;
  /** The amount of funds provided by user to the vault as shares */
  depositedShares: number | bigint;
  /** Reserved */
  reserved: ReadonlyUint8Array;
};

export function getLendingPositionEncoder(): Encoder<LendingPositionArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', fixEncoderSize(getBytesEncoder(), 8)],
      ['version', getU16Encoder()],
      ['bump', fixEncoderSize(getBytesEncoder(), 1)],
      ['authority', getAddressEncoder()],
      ['poolMint', getAddressEncoder()],
      ['depositedFunds', getU64Encoder()],
      ['depositedShares', getU64Encoder()],
      ['reserved', fixEncoderSize(getBytesEncoder(), 64)],
    ]),
    (value) => ({ ...value, discriminator: LENDING_POSITION_DISCRIMINATOR })
  );
}

export function getLendingPositionDecoder(): Decoder<LendingPosition> {
  return getStructDecoder([
    ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
    ['version', getU16Decoder()],
    ['bump', fixDecoderSize(getBytesDecoder(), 1)],
    ['authority', getAddressDecoder()],
    ['poolMint', getAddressDecoder()],
    ['depositedFunds', getU64Decoder()],
    ['depositedShares', getU64Decoder()],
    ['reserved', fixDecoderSize(getBytesDecoder(), 64)],
  ]);
}

export function getLendingPositionCodec(): Codec<
  LendingPositionArgs,
  LendingPosition
> {
  return combineCodec(getLendingPositionEncoder(), getLendingPositionDecoder());
}

export function decodeLendingPosition<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress>
): Account<LendingPosition, TAddress>;
export function decodeLendingPosition<TAddress extends string = string>(
  encodedAccount: MaybeEncodedAccount<TAddress>
): MaybeAccount<LendingPosition, TAddress>;
export function decodeLendingPosition<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress> | MaybeEncodedAccount<TAddress>
):
  | Account<LendingPosition, TAddress>
  | MaybeAccount<LendingPosition, TAddress> {
  return decodeAccount(
    encodedAccount as MaybeEncodedAccount<TAddress>,
    getLendingPositionDecoder()
  );
}

export async function fetchLendingPosition<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<Account<LendingPosition, TAddress>> {
  const maybeAccount = await fetchMaybeLendingPosition(rpc, address, config);
  assertAccountExists(maybeAccount);
  return maybeAccount;
}

export async function fetchMaybeLendingPosition<
  TAddress extends string = string,
>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<MaybeAccount<LendingPosition, TAddress>> {
  const maybeAccount = await fetchEncodedAccount(rpc, address, config);
  return decodeLendingPosition(maybeAccount);
}

export async function fetchAllLendingPosition(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<Account<LendingPosition>[]> {
  const maybeAccounts = await fetchAllMaybeLendingPosition(
    rpc,
    addresses,
    config
  );
  assertAccountsExist(maybeAccounts);
  return maybeAccounts;
}

export async function fetchAllMaybeLendingPosition(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<MaybeAccount<LendingPosition>[]> {
  const maybeAccounts = await fetchEncodedAccounts(rpc, addresses, config);
  return maybeAccounts.map((maybeAccount) =>
    decodeLendingPosition(maybeAccount)
  );
}

export function getLendingPositionSize(): number {
  return 155;
}
