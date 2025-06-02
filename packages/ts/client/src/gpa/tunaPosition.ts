import {
  Account,
  Address,
  getAddressEncoder,
  getBase58Decoder,
  getI8Encoder,
  GetProgramAccountsApi,
  GetProgramAccountsMemcmpFilter,
  Rpc,
} from "@solana/kit";

import {
  getTunaPositionDecoder,
  MarketMaker,
  TUNA_POSITION_DISCRIMINATOR,
  TUNA_PROGRAM_ADDRESS,
  TunaPosition,
} from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type TunaPositionFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function tunaPositionAuthorityFilter(address: Address): TunaPositionFilter {
  return {
    memcmp: {
      offset: 11n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export function tunaPositionPoolFilter(address: Address): TunaPositionFilter {
  return {
    memcmp: {
      offset: 43n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export function tunaPositionMintAFilter(address: Address): TunaPositionFilter {
  return {
    memcmp: {
      offset: 75n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export function tunaPositionMintBFilter(address: Address): TunaPositionFilter {
  return {
    memcmp: {
      offset: 107n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export function tunaPositionMintFilter(address: Address): TunaPositionFilter {
  return {
    memcmp: {
      offset: 139n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export function tunaPositionMarketMakerFilter(marketMaker: MarketMaker): TunaPositionFilter {
  return {
    memcmp: {
      offset: 277n,
      bytes: getBase58Decoder().decode(getI8Encoder().encode(marketMaker)),
      encoding: "base58",
    },
  } as TunaPositionFilter;
}

export async function fetchAllTunaPositionWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: TunaPositionFilter[]
): Promise<Account<TunaPosition>[]> {
  const discriminator = getBase58Decoder().decode(TUNA_POSITION_DISCRIMINATOR);
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
    getTunaPositionDecoder(),
  );
}
