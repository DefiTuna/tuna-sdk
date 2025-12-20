import { mulDiv } from "./math";

export function sharesToFunds(shares: bigint, totalFunds: bigint, totalShares: bigint, roundUp = false) {
  if (totalShares > 0n) {
    return mulDiv(shares, totalFunds, totalShares, roundUp);
  } else {
    return shares;
  }
}

export function fundsToShares(funds: bigint, totalFunds: bigint, totalShares: bigint, roundUp = false) {
  if (totalFunds > 0n) {
    return mulDiv(funds, totalShares, totalFunds, roundUp);
  } else {
    return funds;
  }
}
