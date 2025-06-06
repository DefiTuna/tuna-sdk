import { getTickArrayAddress, Whirlpool } from "@orca-so/whirlpools-client";
import { _TICK_ARRAY_SIZE, getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import { Account, type Address } from "@solana/kit";

export class OrcaUtils {
  static async getTickArrayAddressFromTickIndex(whirlpool: Account<Whirlpool>, tickIndex: number) {
    const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, whirlpool.data.tickSpacing);
    const [tickArrayPda] = await getTickArrayAddress(whirlpool.address, tickArrayStartTickIndex);
    return tickArrayPda;
  }

  static async getSwapTickArrayAddresses(whirlpool: Account<Whirlpool>): Promise<Address[]> {
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
