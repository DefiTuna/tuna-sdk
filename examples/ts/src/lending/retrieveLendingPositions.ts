import {
  getLendingPositionDecoder,
  getLendingPositionSize,
  LendingPosition,
  TUNA_PROGRAM_ADDRESS,
} from "@defituna/client";
import {
  Address,
  address,
  createSolanaRpc,
  getAddressEncoder,
  getBase64Decoder,
  GetProgramAccountsDatasizeFilter,
  GetProgramAccountsMemcmpFilter,
  KeyPairSigner as _KeyPairSigner,
} from "@solana/kit";
import { configDotenv } from "dotenv";
import { loadKeypair } from "src/utils/common";
import { fetchDecodedProgramAccounts } from "src/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";

const rpc = createSolanaRpc(RPC_URL);

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
   * An encoder that serializes a base58-encoded address to a byte array.
   */
  const addressEncoder = getAddressEncoder();
  /**
   * A decoder that deserializes base-64 encoded strings from a byte array.
   */
  const base64Decoder = getBase64Decoder();

  /**
   * The memcmp filter, containing:
   * - bytes: the value in byte array for the `authority` field to filter with
   * - encoding: the enconding type as "base64"
   * - offset: the offset position of the `authority` field (Discriminator + version + bump)
   */
  const memcmpFilter: GetProgramAccountsMemcmpFilter = {
    memcmp: {
      bytes: base64Decoder.decode(addressEncoder.encode(userAddress ?? userKeypair.address)),
      encoding: "base64",
      offset: 11n,
    },
  };

  /**
   * The dataSize filter, containing:
   * - dataSize: the size of the LendingPosition PDA
   */
  const dataSizeFilter: GetProgramAccountsDatasizeFilter = {
    dataSize: BigInt(getLendingPositionSize()),
  };

  /**
   * The Lending Positions belonging to the user (userAddress if provided otherwise address from userKeypair).
   */
  const lendingPositionAccounts = await fetchDecodedProgramAccounts(
    rpc,
    TUNA_PROGRAM_ADDRESS,
    memcmpFilter,
    dataSizeFilter,
    getLendingPositionDecoder(),
  );

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
