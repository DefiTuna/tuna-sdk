#[macro_export]
macro_rules! assert_approx_eq {
    ($a:expr, $b:expr, $tol:expr) => {
        if ($a - $b).abs() > $tol {
            panic!("assertion failed: |{} - {}| = {} > {}", $a, $b, ($a - $b).abs(), $tol);
        }
    };
}
