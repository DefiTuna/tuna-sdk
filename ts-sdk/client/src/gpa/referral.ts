import {
  Account,
  Address,
  getAddressEncoder,
  getBase58Decoder,
  GetProgramAccountsApi,
  GetProgramAccountsMemcmpFilter,
  getU32Encoder,
  Rpc,
} from "@solana/kit";

import { getReferralDecoder, Referral, REFERRAL_DISCRIMINATOR, TUNA_PROGRAM_ADDRESS } from "../generated";

import { fetchDecodedProgramAccounts } from "./utils.ts";

type ReferralFilter = GetProgramAccountsMemcmpFilter & {
  readonly __kind: unique symbol;
};

export function referralAuthorityFilter(address: Address): ReferralFilter {
  return {
    memcmp: {
      offset: 8n,
      bytes: getBase58Decoder().decode(getAddressEncoder().encode(address)),
      encoding: "base58",
    },
  } as ReferralFilter;
}

export function referralIdFilter(referralId: number): ReferralFilter {
  return {
    memcmp: {
      offset: 48n,
      bytes: getBase58Decoder().decode(getU32Encoder().encode(referralId)),
      encoding: "base58",
    },
  } as ReferralFilter;
}

export async function fetchAllReferralsWithFilter(
  rpc: Rpc<GetProgramAccountsApi>,
  ...filters: ReferralFilter[]
): Promise<Account<Referral>[]> {
  const discriminator = getBase58Decoder().decode(REFERRAL_DISCRIMINATOR);
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
    getReferralDecoder(),
  );
}
