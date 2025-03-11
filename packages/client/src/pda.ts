import type { Address, ProgramDerivedAddress } from "@solana/kit";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";

import { TUNA_PROGRAM_ADDRESS } from "./generated";

export async function getTunaConfigAddress(): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["tuna_config"],
  });
}

export async function getMarketAddress(pool: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["market", getAddressEncoder().encode(pool)],
  });
}

export async function getLendingVaultAddress(mint: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["vault", getAddressEncoder().encode(mint)],
  });
}

export async function getLendingPositionAddress(wallet: Address, mint: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["lending_position", getAddressEncoder().encode(wallet), getAddressEncoder().encode(mint)],
  });
}

export async function getTunaPositionAddress(position_mint: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["tuna_position", getAddressEncoder().encode(position_mint)],
  });
}
