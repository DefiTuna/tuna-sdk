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

import { getMarketDecoder, Market, MARKET_DISCRIMINATOR, MarketMaker, TUNA_PROGRAM_ADDRESS } from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type MarketFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function marketMarketMakerFilter(marketMaker: MarketMaker): MarketFilter {
  return {
    memcmp: {
      offset: 11n,
      bytes: getBase58Decoder().decode(getI8Encoder().encode(marketMaker)),
      encoding: "base58",
    },
  } as MarketFilter;
}

export function marketAuthorityFilter(address: Address): MarketFilter {
  return {
    memcmp: {
      offset: 237n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as MarketFilter;
}

export async function fetchAllMarketWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: MarketFilter[]
): Promise<Account<Market>[]> {
  const discriminator = getBase58Decoder().decode(MARKET_DISCRIMINATOR);
  const discriminatorFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      offset: 0n,
      bytes: discriminator,
      encoding: "base58",
    },
  };
  return fetchDecodedProgramAccounts(rpc, TUNA_PROGRAM_ADDRESS, [discriminatorFilter, ...filters], getMarketDecoder());
}
