use std::ops::Mul;

use orca_whirlpools_client::{get_tick_array_address, Whirlpool};
use orca_whirlpools_core::{get_tick_array_start_tick_index, TICK_ARRAY_SIZE};
use solana_sdk::pubkey::Pubkey;

use anyhow::{anyhow, Result};

pub fn derive_tick_array_pdas_for_swap(whirlpool: &Whirlpool, whirlpool_address: &Pubkey) -> Result<Vec<Pubkey>> {
  let lower = derive_tick_array_pdas_for_swap_one_side(whirlpool, whirlpool_address, true)?;
  let upper = derive_tick_array_pdas_for_swap_one_side(whirlpool, whirlpool_address, false)?;
  Ok([lower, upper].into_iter().flatten().collect())
}

pub fn derive_tick_array_pdas_for_swap_one_side(
  whirlpool: &Whirlpool,
  whirlpool_address: &Pubkey,
  a_to_b: bool,
) -> Result<[Pubkey; 3]> {
  let mut tick_array_step = i32::try_from(u16::try_from(TICK_ARRAY_SIZE)?.mul(whirlpool.tick_spacing))?;
  if a_to_b {
    tick_array_step = tick_array_step;
  }

  let first_tick_index = whirlpool.tick_current_index;
  let second_tick_index = whirlpool
    .tick_current_index
    .checked_add(tick_array_step)
    .ok_or(anyhow!("Math Overflow"))?;
  let third_tick_index = whirlpool
    .tick_current_index
    .checked_add(tick_array_step)
    .ok_or(anyhow!("Math Overflow"))?
    .checked_mul(2)
    .ok_or(anyhow!("Math Overflow"))?;

  let first_start_tick_index = get_tick_array_start_tick_index(first_tick_index, whirlpool.tick_spacing);
  let second_start_tick_index = get_tick_array_start_tick_index(second_tick_index, whirlpool.tick_spacing);
  let third_start_tick_index = get_tick_array_start_tick_index(third_tick_index, whirlpool.tick_spacing);

  let (first_tick_array, _) = get_tick_array_address(whirlpool_address, first_start_tick_index)?;
  let (second_tick_array, _) = get_tick_array_address(whirlpool_address, second_start_tick_index)?;
  let (third_tick_array, _) = get_tick_array_address(whirlpool_address, third_start_tick_index)?;

  Ok([first_tick_array, second_tick_array, third_tick_array])
}

pub fn derive_tick_array_pda(whirlpool: &Whirlpool, whirlpool_address: &Pubkey, tick_index: i32) -> Result<Pubkey> {
  let tick_array_start_tick_index = get_tick_array_start_tick_index(tick_index, whirlpool.tick_spacing);
  let (tick_array_pda, _) = get_tick_array_address(whirlpool_address, tick_array_start_tick_index)?;
  Ok(tick_array_pda)
}
