import {
  Account,
  Address,
  getAddressEncoder,
  getBase58Decoder,
  GetProgramAccountsApi,
  GetProgramAccountsMemcmpFilter,
  Rpc,
} from "@solana/kit";

import {
  getLendingPositionDecoder,
  LENDING_POSITION_DISCRIMINATOR,
  TUNA_PROGRAM_ADDRESS,
  LendingPosition,
} from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type LendingPositionFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function lendingPositionAuthorityFilter(address: Address): LendingPositionFilter {
  return {
    memcmp: {
      offset: 11n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as LendingPositionFilter;
}

export function lendingPositionMintAFilter(address: Address): LendingPositionFilter {
  return {
    memcmp: {
      offset: 43n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as LendingPositionFilter;
}

export async function fetchAllLendingPositionWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: LendingPositionFilter[]
): Promise<Account<LendingPosition>[]> {
  const discriminator = getBase58Decoder().decode(LENDING_POSITION_DISCRIMINATOR);
  const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 0n,
      bytes: discriminator,
      encoding: "base58",
    },
  };
  return fetchDecodedProgramAccounts(
    rpc,
    TUNA_PROGRAM_ADDRESS,
    [discriminatorFilter, ...filters],
    getLendingPositionDecoder(),
  );
}
