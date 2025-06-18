import type { Address, GetProgramAccountsMemcmpFilter, ReadonlyUint8Array } from "@solana/kit";
import {
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  getAddressDecoder,
  getBase58Encoder,
} from "@solana/kit";
import { afterEach, assert, beforeEach, describe, it, vi } from "vitest";
import { fetchDecodedProgramAccounts } from "../src/gpa/utils";
import {
  fetchAllLendingPositionWithFilter,
  fetchAllTunaPositionWithFilter,
  getLendingPositionEncoder,
  getTunaPositionEncoder,
  LendingPositionArgs,
  lendingPositionAuthorityFilter,
  lendingPositionMintFilter,
  TunaPositionArgs,
  tunaPositionAuthorityFilter,
  tunaPositionMarketMakerFilter,
  tunaPositionMintAFilter,
  tunaPositionMintBFilter,
  tunaPositionMintFilter,
  tunaPositionPoolFilter,
  TunaPositionState,
} from "../src";

describe("Get program account memcmp filters", () => {
  const mockRpc = createSolanaRpcFromTransport(createDefaultRpcTransport({ url: "" }));
  const addresses: Address[] = [...Array(25).keys()].map(i => {
    const bytes = Array.from({ length: 32 }, () => i);
    return getAddressDecoder().decode(new Uint8Array(bytes));
  });

  beforeEach(() => {
    vi.mock("../src/gpa/utils", () => ({
      fetchDecodedProgramAccounts: vi.fn().mockResolvedValue([]),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function assertFilters(data: ReadonlyUint8Array) {
    const mockFetch = vi.mocked(fetchDecodedProgramAccounts);
    const filters = mockFetch.mock.calls[0][2] as GetProgramAccountsMemcmpFilter[];
    for (const filter of filters) {
      const offset = Number(filter.memcmp.offset);
      const actual = getBase58Encoder().encode(filter.memcmp.bytes);
      const expected = data.subarray(offset, offset + actual.length);
      assert.deepStrictEqual(actual, expected);
    }
  }

  it("LendingPosition", async () => {
    const positionStruct: LendingPositionArgs = {
      version: 1,
      bump: new Uint8Array(),
      authority: addresses[0],
      poolMint: addresses[1],
      depositedFunds: 3442662,
      depositedShares: 28643,
      reserved: new Uint8Array(),
    };
    await fetchAllLendingPositionWithFilter(
      mockRpc,
      lendingPositionAuthorityFilter(positionStruct.authority),
      lendingPositionMintFilter(positionStruct.poolMint),
    );
    const data = getLendingPositionEncoder().encode(positionStruct);
    assertFilters(data);
  });

  it("TunaPosition", async () => {
    const positionStruct: TunaPositionArgs = {
      version: 1,
      bump: new Uint8Array(),
      authority: addresses[0],
      pool: addresses[1],
      mintA: addresses[2],
      mintB: addresses[3],
      positionMint: addresses[4],
      compoundedYieldA: 56388,
      compoundedYieldB: 63462,
      flags: 4,
      leftoversA: 36,
      leftoversB: 88,
      liquidity: 7243345656,
      loanFundsA: 9531733,
      loanFundsB: 39840566,
      loanSharesA: 124574676,
      loanSharesB: 372268,
      marketMaker: 1,
      state: TunaPositionState.Liquidated,
      swapToTokenOnLimitOrder: 6,
      tickEntryIndex: 4253,
      tickLowerIndex: 3112,
      tickUpperIndex: 8010,
      tickStopLossIndex: 2301,
      tickTakeProfitIndex: 1023,
      rebalanceThresholdTicks: 0,
      reserved: new Uint8Array(),
    };
    await fetchAllTunaPositionWithFilter(
      mockRpc,
      tunaPositionAuthorityFilter(positionStruct.authority),
      tunaPositionPoolFilter(positionStruct.pool),
      tunaPositionMintAFilter(positionStruct.mintA),
      tunaPositionMintBFilter(positionStruct.mintB),
      tunaPositionMintFilter(positionStruct.positionMint),
      tunaPositionMarketMakerFilter(positionStruct.marketMaker),
    );
    const data = getTunaPositionEncoder().encode(positionStruct);
    assertFilters(data);
  });
});
