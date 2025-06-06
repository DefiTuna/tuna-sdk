use crate::math::Fixed128;

/// Returns a borrow rate according to the provided utilization of a market. The returned value will be equal to:
///   * ONE / 4 at utilization 0%
///   * ONE     at utilization 90%
///   * ONE * 4 at utilization 100%
///
/// [utilization] Current utilization (Fixed128::ONE is equal to 100%);
pub fn sample(utilization: Fixed128) -> Fixed128 {
    let target_utilization = Fixed128::ONE * 9 / 10;
    let k = Fixed128::ONE * 4;

    if utilization > Fixed128::ONE {
        k
    } else if utilization > target_utilization {
        (utilization - target_utilization) * (k - Fixed128::ONE) / (Fixed128::ONE - target_utilization) + Fixed128::ONE
    } else {
        Fixed128::ONE - (target_utilization - utilization) * (Fixed128::ONE - Fixed128::ONE / k) / target_utilization
    }
}
