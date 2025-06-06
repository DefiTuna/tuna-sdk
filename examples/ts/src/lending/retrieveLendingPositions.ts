import {
  fetchAllLendingPositionWithFilter,
  LendingPosition,
  lendingPositionAuthorityFilter,
} from "@crypticdot/defituna-client";
import { Address, address, KeyPairSigner as _KeyPairSigner } from "@solana/kit";
import { loadKeypair } from "src/utils/common";
import { rpc } from "src/utils/rpc";

/**
 * Retrieves all {@link LendingPosition Lending Positions} belonging to the user.
 * @param {Address} [userAddress] - The optional {@link Address address} of the user to get positions for.
 * If left undefine the function uses address of the keypair defined in the Solana config.
 * @returns {Promise<LendingPosition[]>} - A promise with an array of {@link LendingPosition Lending Positions} belonging to the user.
 */
export async function retrieveUserLendingPositions(userAddress?: Address): Promise<LendingPosition[]> {
  /**
   * The {@link _KeyPairSigner Keypair} owner of the {@link LendingPosition Lending Positions} to be retrieved
   * in case `userAddress` param is `undefined`.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const userKeypair = await loadKeypair();

  /**
   * The Authority address filter
   */
  const filter = lendingPositionAuthorityFilter(userAddress ?? userKeypair.address);

  /**
   * The Lending Positions belonging to the user (userAddress if provided otherwise address from userKeypair).
   */
  const lendingPositionAccounts = await fetchAllLendingPositionWithFilter(rpc, filter);

  if (lendingPositionAccounts.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No positions found for user address", userAddress);
  } else {
    lendingPositionAccounts.forEach((positionAccount, index) => {
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
  return lendingPositionAccounts.map(({ address, data }) => ({ address, ...data }));
}

const userAddress = process.argv[2];

retrieveUserLendingPositions(userAddress ? address(userAddress) : undefined);
