use fixed::traits::{FromFixed, ToFixed};
pub use fixed::types::U68F60 as Fixed128;
use std::fmt::Display;

pub const FRACTION_ONE_SCALED: u128 = Fixed128::ONE.to_bits();

#[inline]
pub const fn bps_u128_to_fraction(bps: u128) -> Fixed128 {
    if bps == 1_000_000 {
        return Fixed128::ONE;
    }
    Fixed128::const_from_int(bps).unwrapped_div_int(1_000_000)
}

pub trait FixedExtra {
    fn to_bps<Dst: FromFixed>(&self) -> Option<Dst>;
    fn from_bps<Src: ToFixed>(bps: Src) -> Self;

    fn to_display(&self) -> FixedSingleDisplay;
}

impl FixedExtra for Fixed128 {
    #[inline]
    fn to_bps<Dst: FromFixed>(&self) -> Option<Dst> {
        (self * 1_000_000).round().checked_to_num()
    }

    #[inline]
    fn from_bps<Src: ToFixed>(bps: Src) -> Self {
        let bps = Fixed128::from_num(bps);
        bps / 1_000_000
    }

    #[inline]
    fn to_display(&self) -> FixedSingleDisplay {
        FixedSingleDisplay(self)
    }
}

pub struct FixedSingleDisplay<'a>(&'a Fixed128);

impl Display for FixedSingleDisplay<'_> {
    fn fmt(&self, formater: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let sf = self.0.to_bits();

        const ROUND_COMP: u128 = (1 << Fixed128::FRAC_NBITS) / (10_000 * 2);
        let sf = sf + ROUND_COMP;

        let i = sf >> Fixed128::FRAC_NBITS;

        const FRAC_MASK: u128 = (1 << Fixed128::FRAC_NBITS) - 1;
        let f_p = (sf & FRAC_MASK) as u64;
        let f_p = ((f_p >> 30) * 10_000) >> 30;
        write!(formater, "{i}.{f_p:0>4}")
    }
}
