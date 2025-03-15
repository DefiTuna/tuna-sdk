import { getTickArrayAddress, Whirlpool } from "@orca-so/whirlpools-client";
import { _TICK_ARRAY_SIZE, getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import { Address } from "@solana/kit";

export const deriveTickArrayPdasForSwap = async (whirlpool: Whirlpool, whirlpoolAddress: Address) => {
  const lower = await deriveTickArrayPdasForSwapOneSide(whirlpool, whirlpoolAddress, true);
  const upper = await deriveTickArrayPdasForSwapOneSide(whirlpool, whirlpoolAddress, false);
  return [lower, upper].flat();
};

const deriveTickArrayPdasForSwapOneSide = async (whirlpool: Whirlpool, whirlpoolAddress: Address, aToB: boolean) => {
  let tickArrayStep = _TICK_ARRAY_SIZE() * whirlpool.tickSpacing;
  if (aToB) tickArrayStep = -tickArrayStep;

  const firstTickIndex = whirlpool.tickCurrentIndex;
  const secondTickIndex = whirlpool.tickCurrentIndex + tickArrayStep;
  const thirdTickIndex = whirlpool.tickCurrentIndex + tickArrayStep * 2;

  const firstStartTickIndex = getTickArrayStartTickIndex(firstTickIndex, whirlpool.tickSpacing);
  const secondStartTickIndex = getTickArrayStartTickIndex(secondTickIndex, whirlpool.tickSpacing);
  const thirdStartTickIndex = getTickArrayStartTickIndex(thirdTickIndex, whirlpool.tickSpacing);

  const [firstTickArray] = await getTickArrayAddress(whirlpoolAddress, firstStartTickIndex);
  const [secondTickArray] = await getTickArrayAddress(whirlpoolAddress, secondStartTickIndex);
  const [thirdTickArray] = await getTickArrayAddress(whirlpoolAddress, thirdStartTickIndex);

  return [firstTickArray, secondTickArray, thirdTickArray] as const;
};

export const deriveTickArrayPda = async (whirlpool: Whirlpool, whirlpoolAddress: Address, tickIndex: number) => {
  const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, whirlpool.tickSpacing);
  const [tickArrayPda] = await getTickArrayAddress(whirlpoolAddress, tickArrayStartTickIndex);
  return tickArrayPda;
};
