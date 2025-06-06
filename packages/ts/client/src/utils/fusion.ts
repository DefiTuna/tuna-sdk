import { FusionPool, getTickArrayAddress } from "@crypticdot/fusionamm-client";
import { _TICK_ARRAY_SIZE, getTickArrayStartTickIndex } from "@crypticdot/fusionamm-core";
import { Account, type Address } from "@solana/kit";

export class FusionUtils {
  static async getTickArrayAddressFromTickIndex(whirlpool: Account<FusionPool>, tickIndex: number) {
    const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, whirlpool.data.tickSpacing);
    const [tickArrayPda] = await getTickArrayAddress(whirlpool.address, tickArrayStartTickIndex);
    return tickArrayPda;
  }

  static async getSwapTickArrayAddresses(whirlpool: Account<FusionPool>): Promise<Address[]> {
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
}
