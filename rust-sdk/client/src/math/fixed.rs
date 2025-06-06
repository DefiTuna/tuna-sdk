use crate::math::U256;
use crate::TunaError as ErrorCode;
use std::ops::Mul;

pub enum Rounding {
    Up,
    Down,
}

pub fn mul_u256(x: u128, y: u128) -> U256 {
    U256::from(x).mul(U256::from(y))
}

pub fn mul_div_64(x: u64, y: u64, d: u64, rounding: Rounding) -> Result<u64, ErrorCode> {
    let x_128 = x as u128;
    let y_128 = y as u128;
    let d_128 = d as u128;

    match rounding {
        Rounding::Up => {
            let result = (x_128 * y_128)
                .checked_add(d_128.checked_sub(1).ok_or(ErrorCode::MathUnderflow)?)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(d_128)
                .ok_or(ErrorCode::MathOverflow)?
                .try_into()
                .map_err(|_| ErrorCode::MathOverflow)?;
            Ok(result)
        }

        Rounding::Down => {
            let result: u64 = (x_128 * y_128)
                .checked_div(d_128)
                .ok_or(ErrorCode::MathOverflow)?
                .try_into()
                .map_err(|_| ErrorCode::MathOverflow)?;
            Ok(result)
        }
    }
}
