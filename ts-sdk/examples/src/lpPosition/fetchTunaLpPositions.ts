import {
  fetchAllTunaLpPositionWithFilter,
  TunaLpPosition,
  tunaLpPositionAuthorityFilter,
} from "@crypticdot/defituna-client";
import { Address, address } from "@solana/kit";

import { loadKeypair, rpc } from "../utils/common";

/**
 * Retrieves all {@link TunaLpPosition Tuna Positions} belonging to the user.
 * @param {Address} [userAddress] - The optional {@link Address address} of the user to get positions for.
 * If left undefine the function uses address of the keypair defined in the Solana config.
 * @returns {Promise<TunaLpPosition[]>} - A promise with an array of {@link TunaLpPosition Tuna Positions} belonging to the user.
 */
export async function retrieveUserTunaPositions(userAddress?: Address): Promise<TunaLpPosition[]> {
  /**
   * The {@link _KeyPairSigner Keypair} owner of the {@link TunaLpPosition Tuna Positions} to be retrieved
   * in case `userAddress` param is `undefined`.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const userKeypair = await loadKeypair();

  /**
   * The Authority address filter
   */
  const filter = tunaLpPositionAuthorityFilter(userAddress ?? userKeypair.address);

  /**
   * The Tuna Positions belonging to the user (userAddress if provided otherwise address from userKeypair).
   */
  const tunaPositionAccounts = await fetchAllTunaLpPositionWithFilter(rpc, filter);

  if (tunaPositionAccounts.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No positions found for user address", userAddress);
  } else {
    tunaPositionAccounts.forEach((positionAccount, index) => {
      // eslint-disable-next-line no-console
      console.log(`Position ${index}:`);
      // eslint-disable-next-line no-console
      console.log({
        address: positionAccount.address,
        data: positionAccount.data,
      });
    });
  }

  /**
   * Returns only address and data.
   */
  return tunaPositionAccounts.map(({ address, data }) => ({ address, ...data }));
}

const userAddress = process.argv[2];

retrieveUserTunaPositions(userAddress ? address(userAddress) : undefined);
