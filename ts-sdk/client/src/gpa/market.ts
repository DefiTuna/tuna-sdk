import { Account, getBase58Decoder, GetProgramAccountsApi, GetProgramAccountsMemcmpFilter, Rpc } from "@solana/kit";

import { getMarketDecoder, Market, MARKET_DISCRIMINATOR, TUNA_PROGRAM_ADDRESS } from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type MarketFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

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
