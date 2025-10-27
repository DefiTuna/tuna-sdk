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
  getTunaSpotPositionDecoder,
  TUNA_PROGRAM_ADDRESS,
  TUNA_SPOT_POSITION_DISCRIMINATOR,
  TunaSpotPosition,
} from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type TunaSpotPositionFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function tunaSpotPositionAuthorityFilter(address: Address): TunaSpotPositionFilter {
  return {
    memcmp: {
      offset: 11n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaSpotPositionFilter;
}

export function tunaSpotPositionPoolFilter(address: Address): TunaSpotPositionFilter {
  return {
    memcmp: {
      offset: 43n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaSpotPositionFilter;
}

export function tunaSpotPositionMintAFilter(address: Address): TunaSpotPositionFilter {
  return {
    memcmp: {
      offset: 75n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaSpotPositionFilter;
}

export function tunaSpotPositionMintBFilter(address: Address): TunaSpotPositionFilter {
  return {
    memcmp: {
      offset: 107n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaSpotPositionFilter;
}

export async function fetchAllTunaSpotPositionWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: TunaSpotPositionFilter[]
): Promise<Account<TunaSpotPosition>[]> {
  const discriminator = getBase58Decoder().decode(TUNA_SPOT_POSITION_DISCRIMINATOR);
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
    getTunaSpotPositionDecoder(),
  );
}
