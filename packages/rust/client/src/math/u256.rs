use crate::math::U256;
use crate::TunaError as ErrorCode;
use std::borrow::BorrowMut;
use std::convert::TryInto;
use std::mem::size_of;

impl U256 {
    pub fn try_into_u64(self) -> Result<u64, ErrorCode> {
        self.try_into().map_err(|_| ErrorCode::TypeCastOverflow)
    }

    pub fn try_into_u128(self) -> Result<u128, ErrorCode> {
        self.try_into().map_err(|_| ErrorCode::TypeCastOverflow)
    }

    pub fn from_le_bytes(bytes: [u8; 32]) -> Self {
        U256::from_little_endian(&bytes)
    }

    pub fn to_le_bytes(self) -> [u8; 32] {
        let mut buf: Vec<u8> = Vec::with_capacity(size_of::<Self>());
        self.to_little_endian(buf.borrow_mut());

        let mut bytes: [u8; 32] = [0u8; 32];
        bytes.copy_from_slice(buf.as_slice());
        bytes
    }

    pub fn checked_shl(self, shl: u32) -> Option<U256> {
        if self == U256::zero() {
            return Some(Self::zero());
        }

        if shl >= 256 {
            return None;
        }

        let mask = ((U256::one() << shl) - 1) << (256 - shl);
        if self & mask != U256::zero() {
            return None;
        }

        Some(self << shl)
    }
}

#[cfg(test)]
mod test_u256 {
    use super::*;
    use std::ops::Shl;

    #[test]
    fn test_into_u128_ok() {
        let a = U256::from(2653u128);
        let b = U256::from(1232u128);
        let sum = a + b;
        let d: u128 = sum.try_into_u128().unwrap();
        assert_eq!(d, 3885u128);
    }

    #[test]
    fn test_into_u128_error() {
        let a = U256::from(u128::MAX);
        let b = U256::from(u128::MAX);
        let sum = a + b;
        let c: Result<u128, ErrorCode> = sum.try_into_u128();
        assert!(c.is_err());
    }

    #[test]
    fn test_as_u128_ok() {
        let a = U256::from(2653u128);
        let b = U256::from(1232u128);
        let sum = a + b;
        let d: u128 = sum.as_u128();
        assert_eq!(d, 3885u128);
    }

    #[test]
    #[should_panic(expected = "Integer overflow when casting to u128")]
    fn test_as_u128_panic() {
        let a = U256::from(u128::MAX);
        let b = U256::from(u128::MAX);
        let sum = a + b;
        let _: u128 = sum.as_u128();
    }

    #[test]
    fn test_into_u64_ok() {
        let a = U256::from(2653u64);
        let b = U256::from(1232u64);
        let sum = a + b;
        let d: u64 = sum.try_into_u64().unwrap();
        assert_eq!(d, 3885u64);
    }

    #[test]
    fn test_into_u64_error() {
        let a = U256::from(u64::MAX);
        let b = U256::from(u64::MAX);
        let sum = a + b;
        let c: Result<u64, ErrorCode> = sum.try_into_u64();
        assert!(c.is_err());
    }

    #[test]
    fn test_as_u64_ok() {
        let a = U256::from(2653u64);
        let b = U256::from(1232u64);
        let sum = a + b;
        let d: u64 = sum.as_u64();
        assert_eq!(d, 3885u64);
    }

    #[test]
    #[should_panic(expected = "Integer overflow when casting to u64")]
    fn test_as_u64_panic() {
        let a = U256::from(u64::MAX);
        let b = U256::from(u64::MAX);
        let sum = a + b;
        let _: u64 = sum.as_u64(); // panic overflow
    }

    #[test]
    fn test_checked_shl() {
        assert_eq!(U256::zero().checked_shl(256), Some(U256::zero()));
        assert_eq!(U256::one().checked_shl(1), Some(U256::from(2)));
        assert_eq!(U256::one().checked_shl(255), Some(U256::one().shl(255)));
        assert_eq!(U256::one().checked_shl(256), None);
        assert_eq!(U256::from(3).checked_shl(255), None);
        assert_eq!(U256::from(4).checked_shl(254), None);
        assert_eq!(U256::zero().checked_shl(256).unwrap(), U256::zero());
    }
}
