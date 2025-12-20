import { Address, getU32Encoder, ProgramDerivedAddress } from "@solana/kit";
import { getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";

import { DEFAULT_PUSH_ORACLE_PROGRAM_ID } from "./consts.ts";
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

export async function getLendingVaultV2Address(mint: Address, id: number): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["vault", getAddressEncoder().encode(mint), getU32Encoder().encode(id)],
  });
}

export async function getLendingPositionAddress(
  authority: Address,
  mintOrVault: Address,
): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["lending_position", getAddressEncoder().encode(authority), getAddressEncoder().encode(mintOrVault)],
  });
}

export async function getTunaLpPositionAddress(positionMint: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["tuna_position", getAddressEncoder().encode(positionMint)],
  });
}

export async function getTunaSpotPositionAddress(authority: Address, pool: Address): Promise<ProgramDerivedAddress> {
  return await getProgramDerivedAddress({
    programAddress: TUNA_PROGRAM_ADDRESS,
    seeds: ["tuna_spot_position", getAddressEncoder().encode(authority), getAddressEncoder().encode(pool)],
  });
}

export async function getPythPriceUpdateAccountAddress(
  shardId: number,
  priceFeedId: Buffer | string,
): Promise<ProgramDerivedAddress> {
  if (typeof priceFeedId == "string") {
    if (priceFeedId.startsWith("0x")) {
      priceFeedId = Buffer.from(priceFeedId.slice(2), "hex");
    } else {
      priceFeedId = Buffer.from(priceFeedId, "hex");
    }
  }

  if (priceFeedId.length != 32) {
    throw new Error("Feed ID should be 32 bytes long");
  }
  const shardBuffer = Buffer.alloc(2);
  shardBuffer.writeUint16LE(shardId, 0);

  return await getProgramDerivedAddress({
    programAddress: DEFAULT_PUSH_ORACLE_PROGRAM_ID,
    seeds: [shardBuffer, priceFeedId],
  });
}
