import { Account, type Address } from "@solana/kit";
import { getTickArrayAddress, Whirlpool } from "@orca-so/whirlpools-client";
import { _TICK_ARRAY_SIZE, getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";

export async function getTickArrayAddressFromTickIndex(whirlpool: Account<Whirlpool, Address>, tickIndex: number) {
  const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, whirlpool.data.tickSpacing);
  const [tickArrayPda] = await getTickArrayAddress(whirlpool.address, tickArrayStartTickIndex);
  return tickArrayPda;
}

export async function getSwapTickArrayAddresses(whirlpool: Account<Whirlpool, Address>): Promise<Address[]> {
  const tickArrayStep = _TICK_ARRAY_SIZE() * whirlpool.data.tickSpacing;
  const currentArrayStartTickIndex = getTickArrayStartTickIndex(
    whirlpool.data.tickCurrentIndex,
    whirlpool.data.tickSpacing,
  );

  return Promise.all(
    [-2, -1, 0, 1, 2].map(
      async i => (await getTickArrayAddress(whirlpool.address, currentArrayStartTickIndex + i * tickArrayStep))[0],
    ),
  );
}
