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
} from '@solana/kit';
import {
  getWhirlpoolRewardInfoDecoder,
  getWhirlpoolRewardInfoEncoder,
  type WhirlpoolRewardInfo,
  type WhirlpoolRewardInfoArgs,
} from '../types';

export const WHIRLPOOL_DISCRIMINATOR = new Uint8Array([
  63, 149, 209, 12, 225, 128, 99, 9,
]);

export function getWhirlpoolDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(WHIRLPOOL_DISCRIMINATOR);
}

export type Whirlpool = {
  discriminator: ReadonlyUint8Array;
  whirlpoolsConfig: Address;
  whirlpoolBump: ReadonlyUint8Array;
  tickSpacing: number;
  tickSpacingSeed: ReadonlyUint8Array;
  feeRate: number;
  protocolFeeRate: number;
  liquidity: bigint;
  sqrtPrice: bigint;
  tickCurrentIndex: number;
  protocolFeeOwedA: bigint;
  protocolFeeOwedB: bigint;
  tokenMintA: Address;
  tokenVaultA: Address;
  feeGrowthGlobalA: bigint;
  tokenMintB: Address;
  tokenVaultB: Address;
  feeGrowthGlobalB: bigint;
  rewardLastUpdatedTimestamp: bigint;
  rewardInfos: Array<WhirlpoolRewardInfo>;
};

export type WhirlpoolArgs = {
  whirlpoolsConfig: Address;
  whirlpoolBump: ReadonlyUint8Array;
  tickSpacing: number;
  tickSpacingSeed: ReadonlyUint8Array;
  feeRate: number;
  protocolFeeRate: number;
  liquidity: number | bigint;
  sqrtPrice: number | bigint;
  tickCurrentIndex: number;
  protocolFeeOwedA: number | bigint;
  protocolFeeOwedB: number | bigint;
  tokenMintA: Address;
  tokenVaultA: Address;
  feeGrowthGlobalA: number | bigint;
  tokenMintB: Address;
  tokenVaultB: Address;
  feeGrowthGlobalB: number | bigint;
  rewardLastUpdatedTimestamp: number | bigint;
  rewardInfos: Array<WhirlpoolRewardInfoArgs>;
};

export function getWhirlpoolEncoder(): Encoder<WhirlpoolArgs> {
  return transformEncoder(
    getStructEncoder([
      ['discriminator', fixEncoderSize(getBytesEncoder(), 8)],
      ['whirlpoolsConfig', getAddressEncoder()],
      ['whirlpoolBump', fixEncoderSize(getBytesEncoder(), 1)],
      ['tickSpacing', getU16Encoder()],
      ['tickSpacingSeed', fixEncoderSize(getBytesEncoder(), 2)],
      ['feeRate', getU16Encoder()],
      ['protocolFeeRate', getU16Encoder()],
      ['liquidity', getU128Encoder()],
      ['sqrtPrice', getU128Encoder()],
      ['tickCurrentIndex', getI32Encoder()],
      ['protocolFeeOwedA', getU64Encoder()],
      ['protocolFeeOwedB', getU64Encoder()],
      ['tokenMintA', getAddressEncoder()],
      ['tokenVaultA', getAddressEncoder()],
      ['feeGrowthGlobalA', getU128Encoder()],
      ['tokenMintB', getAddressEncoder()],
      ['tokenVaultB', getAddressEncoder()],
      ['feeGrowthGlobalB', getU128Encoder()],
      ['rewardLastUpdatedTimestamp', getU64Encoder()],
      [
        'rewardInfos',
        getArrayEncoder(getWhirlpoolRewardInfoEncoder(), { size: 3 }),
      ],
    ]),
    (value) => ({ ...value, discriminator: WHIRLPOOL_DISCRIMINATOR })
  );
}

export function getWhirlpoolDecoder(): Decoder<Whirlpool> {
  return getStructDecoder([
    ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
    ['whirlpoolsConfig', getAddressDecoder()],
    ['whirlpoolBump', fixDecoderSize(getBytesDecoder(), 1)],
    ['tickSpacing', getU16Decoder()],
    ['tickSpacingSeed', fixDecoderSize(getBytesDecoder(), 2)],
    ['feeRate', getU16Decoder()],
    ['protocolFeeRate', getU16Decoder()],
    ['liquidity', getU128Decoder()],
    ['sqrtPrice', getU128Decoder()],
    ['tickCurrentIndex', getI32Decoder()],
    ['protocolFeeOwedA', getU64Decoder()],
    ['protocolFeeOwedB', getU64Decoder()],
    ['tokenMintA', getAddressDecoder()],
    ['tokenVaultA', getAddressDecoder()],
    ['feeGrowthGlobalA', getU128Decoder()],
    ['tokenMintB', getAddressDecoder()],
    ['tokenVaultB', getAddressDecoder()],
    ['feeGrowthGlobalB', getU128Decoder()],
    ['rewardLastUpdatedTimestamp', getU64Decoder()],
    [
      'rewardInfos',
      getArrayDecoder(getWhirlpoolRewardInfoDecoder(), { size: 3 }),
    ],
  ]);
}

export function getWhirlpoolCodec(): Codec<WhirlpoolArgs, Whirlpool> {
  return combineCodec(getWhirlpoolEncoder(), getWhirlpoolDecoder());
}

export function decodeWhirlpool<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress>
): Account<Whirlpool, TAddress>;
export function decodeWhirlpool<TAddress extends string = string>(
  encodedAccount: MaybeEncodedAccount<TAddress>
): MaybeAccount<Whirlpool, TAddress>;
export function decodeWhirlpool<TAddress extends string = string>(
  encodedAccount: EncodedAccount<TAddress> | MaybeEncodedAccount<TAddress>
): Account<Whirlpool, TAddress> | MaybeAccount<Whirlpool, TAddress> {
  return decodeAccount(
    encodedAccount as MaybeEncodedAccount<TAddress>,
    getWhirlpoolDecoder()
  );
}

export async function fetchWhirlpool<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<Account<Whirlpool, TAddress>> {
  const maybeAccount = await fetchMaybeWhirlpool(rpc, address, config);
  assertAccountExists(maybeAccount);
  return maybeAccount;
}

export async function fetchMaybeWhirlpool<TAddress extends string = string>(
  rpc: Parameters<typeof fetchEncodedAccount>[0],
  address: Address<TAddress>,
  config?: FetchAccountConfig
): Promise<MaybeAccount<Whirlpool, TAddress>> {
  const maybeAccount = await fetchEncodedAccount(rpc, address, config);
  return decodeWhirlpool(maybeAccount);
}

export async function fetchAllWhirlpool(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<Account<Whirlpool>[]> {
  const maybeAccounts = await fetchAllMaybeWhirlpool(rpc, addresses, config);
  assertAccountsExist(maybeAccounts);
  return maybeAccounts;
}

export async function fetchAllMaybeWhirlpool(
  rpc: Parameters<typeof fetchEncodedAccounts>[0],
  addresses: Array<Address>,
  config?: FetchAccountsConfig
): Promise<MaybeAccount<Whirlpool>[]> {
  const maybeAccounts = await fetchEncodedAccounts(rpc, addresses, config);
  return maybeAccounts.map((maybeAccount) => decodeWhirlpool(maybeAccount));
}

export function getWhirlpoolSize(): number {
  return 653;
}
