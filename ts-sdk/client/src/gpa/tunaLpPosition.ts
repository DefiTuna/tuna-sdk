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
  getTunaLpPositionDecoder,
  MarketMaker,
  TUNA_LP_POSITION_DISCRIMINATOR,
  TUNA_PROGRAM_ADDRESS,
  TunaLpPosition,
} from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type TunaLpPositionFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function tunaLpPositionAuthorityFilter(address: Address): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 11n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export function tunaLpPositionPoolFilter(address: Address): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 43n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export function tunaLpPositionMintAFilter(address: Address): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 75n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export function tunaLpPositionMintBFilter(address: Address): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 107n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export function tunaLpPositionMintFilter(address: Address): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 139n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export function tunaLpPositionMarketMakerFilter(marketMaker: MarketMaker): TunaLpPositionFilter {
  return {
    memcmp: {
      offset: 277n,
      bytes: getBase58Decoder().decode(getI8Encoder().encode(marketMaker)),
      encoding: "base58",
    },
  } as TunaLpPositionFilter;
}

export async function fetchAllTunaLpPositionWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: TunaLpPositionFilter[]
): Promise<Account<TunaLpPosition>[]> {
  const discriminator = getBase58Decoder().decode(TUNA_LP_POSITION_DISCRIMINATOR);
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
    getTunaLpPositionDecoder(),
  );
}
