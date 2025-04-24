use orca_whirlpools_client::get_tick_array_address;
use orca_whirlpools_core::{get_tick_array_start_tick_index, TICK_ARRAY_SIZE};
use solana_program::pubkey::Pubkey;

pub fn get_swap_tick_arrays(tick_current_index: i32, tick_spacing: u16, whirlpool_address: &Pubkey) -> [Pubkey; 5] {
    let mut tick_array_addresses = [Pubkey::default(); 5];

    let current_tick_array_start_tick_index = get_tick_array_start_tick_index(tick_current_index, tick_spacing);
    for offset in 0..5 {
        let start_index = current_tick_array_start_tick_index + (offset - 2) * tick_spacing as i32 * TICK_ARRAY_SIZE as i32;
        let pda = get_tick_array_address(whirlpool_address, start_index).unwrap().0;
        tick_array_addresses[offset as usize] = pda;
    }

    tick_array_addresses
}
