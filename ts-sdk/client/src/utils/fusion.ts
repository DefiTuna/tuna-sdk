import { FusionPool, getTickArrayAddress } from "@crypticdot/fusionamm-client";
import {
  _MAX_TICK_INDEX,
  _MIN_TICK_INDEX,
  _TICK_ARRAY_SIZE,
  getInitializableTickIndex,
  getTickArrayStartTickIndex,
} from "@crypticdot/fusionamm-core";
import { Account, type Address } from "@solana/kit";

import { TunaLpPosition } from "../generated";

export class FusionUtils {
  static async getTickArrayAddressFromTickIndex(fusionPool: Account<FusionPool>, tickIndex: number) {
    const tickArrayStartTickIndex = getTickArrayStartTickIndex(tickIndex, fusionPool.data.tickSpacing);
    const [tickArrayPda] = await getTickArrayAddress(fusionPool.address, tickArrayStartTickIndex);
    return tickArrayPda;
  }

  static async getSwapTickArrayAddresses(fusionPool: Account<FusionPool>): Promise<Address[]> {
    const tickArrayStep = _TICK_ARRAY_SIZE() * fusionPool.data.tickSpacing;
    const currentArrayStartTickIndex = getTickArrayStartTickIndex(
      fusionPool.data.tickCurrentIndex,
      fusionPool.data.tickSpacing,
    );

    return Promise.all(
      [-2, -1, 0, 1, 2].map(
        async i => (await getTickArrayAddress(fusionPool.address, currentArrayStartTickIndex + i * tickArrayStep))[0],
      ),
    );
  }

  static async getTickArraysForRebalancedPosition(
    fusionPool: Account<FusionPool>,
    tunaPosition: Account<TunaLpPosition>,
  ) {
    // Calculate the new position's range.
    const positionRange = tunaPosition.data.tickUpperIndex - tunaPosition.data.tickLowerIndex;
    let newTickLowerIndex = Math.max(
      getInitializableTickIndex(
        fusionPool.data.tickCurrentIndex - Math.trunc(positionRange / 2),
        fusionPool.data.tickSpacing,
      ),
      _MIN_TICK_INDEX(),
    );
    const newTickUpperIndex = Math.min(newTickLowerIndex + positionRange, _MAX_TICK_INDEX());
    if (newTickUpperIndex == _MAX_TICK_INDEX()) newTickLowerIndex = _MAX_TICK_INDEX() - positionRange;

    const lowerTickArrayStartIndex = getTickArrayStartTickIndex(newTickLowerIndex, fusionPool.data.tickSpacing);
    const [lowerTickArrayAddress] = await getTickArrayAddress(fusionPool.address, lowerTickArrayStartIndex);

    const upperTickArrayStartIndex = getTickArrayStartTickIndex(newTickUpperIndex, fusionPool.data.tickSpacing);
    const [upperTickArrayAddress] = await getTickArrayAddress(fusionPool.address, upperTickArrayStartIndex);

    return { lowerTickArrayAddress, lowerTickArrayStartIndex, upperTickArrayAddress, upperTickArrayStartIndex };
  }
}
