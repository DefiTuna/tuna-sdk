/// Returns a borrow rate multiplier according to the provided utilization of a market. The returned value will be equal to:
///   * 0.25 at utilization 0%
///   * 1.0  at utilization 90%
///   * 4.0  at utilization 100%
/// # Parameters
/// - `utilization` Current utilization (1.0 is equal to 100%)
/// # Returns
/// Borrow rate multiplier.
pub fn sample(utilization: f64) -> f64 {
    let target_utilization = 0.9;
    let k = 4.0;

    if utilization > 1.0 {
        k
    } else if utilization <= 0.0 {
        1.0 / k
    } else if utilization > target_utilization {
        (utilization - target_utilization) * (k - 1.0) / (1.0 - target_utilization) + 1.0
    } else {
        1.0 - (target_utilization - utilization) * (1.0 - 1.0 / k) / target_utilization
    }
}
