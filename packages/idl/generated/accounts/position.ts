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
  getU128Decoder,
  getU128Encoder,
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
} from '@solana/kit';
import {
  getPositionRewardInfoDecoder,
  getPositionRewardInfoEncoder,
  type PositionRewardInfo,
  type PositionRewardInfoArgs,
} from '../types';

export const POSITION_DISCRIMINATOR = new Uint8Array([
  170, 188, 143, 228, 122, 64, 247, 208,
]);

export function getPositionDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(POSITION_DISCRIMINATOR);
}

export type Position = {
  discriminator: ReadonlyUint8Array;
  whirlpool: Address;
  positionMint: Address;
  liquidity: bigint;
  tickLowerIndex: number;
  tickUpperIndex: number;
  feeGrowthCheckpointA: bigint;
  feeOwedA: bigint;
  feeGrowthCheckpointB: bigint;
  feeOwedB: bigint;
  rewardInfos: Array<PositionRewardInfo>;
};

export type PositionArgs = {
  whirlpool: Address;
  positionMint: Address;
  liquidity: number | bigint;
  tickLowerIndex: number;
  tickUpperIndex: number;
  feeGrowthCheckpointA: number | bigint;
  feeOwedA: number | bigint;
  feeGrowthCheckpointB: number | bigint;
  feeOwedB: number | bigint;
  rewardInfos: Array<PositionRewardInfoArgs>;
};

export function getPositionEncoder(): Encoder<PositionArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', fixEncoderSize(getBytesEncoder(), 8)],
      ['whirlpool', getAddressEncoder()],
      ['positionMint', getAddressEncoder()],
      ['liquidity', getU128Encoder()],
      ['tickLowerIndex', getI32Encoder()],
      ['tickUpperIndex', getI32Encoder()],
      ['feeGrowthCheckpointA', getU128Encoder()],
      ['feeOwedA', getU64Encoder()],
      ['feeGrowthCheckpointB', getU128Encoder()],
      ['feeOwedB', getU64Encoder()],
      [
        'rewardInfos',
        getArrayEncoder(getPositionRewardInfoEncoder(), { size: 3 }),
      ],
    ]),
    (value) => ({ ...value, discriminator: POSITION_DISCRIMINATOR })
  );
}

export function getPositionDecoder(): Decoder<Position> {
  return getStructDecoder([
    ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
    ['whirlpool', getAddressDecoder()],
    ['positionMint', getAddressDecoder()],
    ['liquidity', getU128Decoder()],
    ['tickLowerIndex', getI32Decoder()],
    ['tickUpperIndex', getI32Decoder()],
    ['feeGrowthCheckpointA', getU128Decoder()],
    ['feeOwedA', getU64Decoder()],
    ['feeGrowthCheckpointB', getU128Decoder()],
    ['feeOwedB', getU64Decoder()],
    [
      'rewardInfos',
      getArrayDecoder(getPositionRewardInfoDecoder(), { size: 3 }),
    ],
  ]);
}

export function getPositionCodec(): Codec<PositionArgs, Position> {
  return combineCodec(getPositionEncoder(), getPositionDecoder());
}

export function decodePosition<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress>
): Account<Position, TAddress>;
export function decodePosition<TAddress extends string = string>(
  encodedAccount: MaybeEncodedAccount<TAddress>
): MaybeAccount<Position, TAddress>;
export function decodePosition<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress> | MaybeEncodedAccount<TAddress>
): Account<Position, TAddress> | MaybeAccount<Position, TAddress> {
  return decodeAccount(
    encodedAccount as MaybeEncodedAccount<TAddress>,
    getPositionDecoder()
  );
}

export async function fetchPosition<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<Account<Position, TAddress>> {
  const maybeAccount = await fetchMaybePosition(rpc, address, config);
  assertAccountExists(maybeAccount);
  return maybeAccount;
}

export async function fetchMaybePosition<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<MaybeAccount<Position, TAddress>> {
  const maybeAccount = await fetchEncodedAccount(rpc, address, config);
  return decodePosition(maybeAccount);
}

export async function fetchAllPosition(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<Account<Position>[]> {
  const maybeAccounts = await fetchAllMaybePosition(rpc, addresses, config);
  assertAccountsExist(maybeAccounts);
  return maybeAccounts;
}

export async function fetchAllMaybePosition(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<MaybeAccount<Position>[]> {
  const maybeAccounts = await fetchEncodedAccounts(rpc, addresses, config);
  return maybeAccounts.map((maybeAccount) => decodePosition(maybeAccount));
}

export function getPositionSize(): number {
  return 216;
}
