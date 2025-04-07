use solana_sdk::instruction::Instruction;

#[derive(Clone)]
pub struct SolanaTransactionSimulation {
  pub compute_unit_limit: u32,
}

pub struct Amounts<T> {
  pub a: T,
  pub b: T,
}

#[derive(Clone)]
pub struct ATAInstructions {
  pub create_ata_ixs: Vec<Instruction>,
  pub wsol_ata_ixs: Vec<Instruction>,
  pub close_wsol_ata_ixs: Vec<Instruction>,
}
