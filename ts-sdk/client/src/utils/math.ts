export function mulDiv(x: bigint, y: bigint, d: bigint, roundUp = false) {
  if (!roundUp) {
    return (x * y) / d;
  } else {
    return (x * y + (d - 1n)) / d;
  }
}
