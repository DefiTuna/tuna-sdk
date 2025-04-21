import { Account, type Address } from "@solana/kit";
import { getTickArrayAddress, Whirlpool } from "@orca-so/whirlpools-client";
import { _TICK_ARRAY_SIZE, getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";

export async function getTickArrayAddressFromTickIndex(whirlpool: Account<Whirlpool, Address>, tickIndex: number) {
  const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, whirlpool.data.tickSpacing);
  const [tickArrayPda] = await getTickArrayAddress(whirlpool.address, tickArrayStartTickIndex);
  return tickArrayPda;
}

export async function getSwapTickArrayAddresses(whirlpool: Account<Whirlpool, Address>, aToB: boolean) {
  let tickArrayStep = _TICK_ARRAY_SIZE() * whirlpool.data.tickSpacing;
  if (aToB) tickArrayStep = -tickArrayStep;

  const firstStartTickIndex = getTickArrayStartTickIndex(whirlpool.data.tickCurrentIndex, whirlpool.data.tickSpacing);
  const secondStartTickIndex = firstStartTickIndex + tickArrayStep;
  const thirdStartTickIndex = firstStartTickIndex + tickArrayStep * 2;

  const [firstTickArray] = await getTickArrayAddress(whirlpool.address, firstStartTickIndex);
  const [secondTickArray] = await getTickArrayAddress(whirlpool.address, secondStartTickIndex);
  const [thirdTickArray] = await getTickArrayAddress(whirlpool.address, thirdStartTickIndex);

  return [firstTickArray, secondTickArray, thirdTickArray] as const;
}
