//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use solana_program::pubkey::Pubkey;
use borsh::BorshSerialize;
use borsh::BorshDeserialize;

/// Accounts.
#[derive(Debug)]
pub struct UpdateMarket {
      
              
          pub authority: solana_program::pubkey::Pubkey,
          
              
          pub tuna_config: solana_program::pubkey::Pubkey,
          
              
          pub market: solana_program::pubkey::Pubkey,
      }

impl UpdateMarket {
  pub fn instruction(&self, args: UpdateMarketInstructionArgs) -> solana_program::instruction::Instruction {
    self.instruction_with_remaining_accounts(args, &[])
  }
  #[allow(clippy::vec_init_then_push)]
  pub fn instruction_with_remaining_accounts(&self, args: UpdateMarketInstructionArgs, remaining_accounts: &[solana_program::instruction::AccountMeta]) -> solana_program::instruction::Instruction {
    let mut accounts = Vec::with_capacity(3+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            self.authority,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.tuna_config,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.market,
            false
          ));
                      accounts.extend_from_slice(remaining_accounts);
    let mut data = borsh::to_vec(&UpdateMarketInstructionData::new()).unwrap();
          let mut args = borsh::to_vec(&args).unwrap();
      data.append(&mut args);
    
    solana_program::instruction::Instruction {
      program_id: crate::TUNA_ID,
      accounts,
      data,
    }
  }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
 pub struct UpdateMarketInstructionData {
            discriminator: [u8; 8],
                                                                              }

impl UpdateMarketInstructionData {
  pub fn new() -> Self {
    Self {
                        discriminator: [153, 39, 2, 197, 179, 50, 199, 217],
                                                                                                                                                                                          }
  }
}

impl Default for UpdateMarketInstructionData {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
 pub struct UpdateMarketInstructionArgs {
                  pub address_lookup_table: Pubkey,
                pub max_leverage: u32,
                pub protocol_fee: u16,
                pub protocol_fee_on_collateral: u16,
                pub liquidation_fee: u32,
                pub liquidation_ratio: u32,
                pub limit_order_execution_fee: u32,
                pub oracle_price_deviation_threshold: u32,
                pub disabled: bool,
                pub borrow_limit_a: u64,
                pub borrow_limit_b: u64,
                pub max_swap_slippage: u32,
      }


/// Instruction builder for `UpdateMarket`.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` tuna_config
                ///   2. `[writable]` market
#[derive(Clone, Debug, Default)]
pub struct UpdateMarketBuilder {
            authority: Option<solana_program::pubkey::Pubkey>,
                tuna_config: Option<solana_program::pubkey::Pubkey>,
                market: Option<solana_program::pubkey::Pubkey>,
                        address_lookup_table: Option<Pubkey>,
                max_leverage: Option<u32>,
                protocol_fee: Option<u16>,
                protocol_fee_on_collateral: Option<u16>,
                liquidation_fee: Option<u32>,
                liquidation_ratio: Option<u32>,
                limit_order_execution_fee: Option<u32>,
                oracle_price_deviation_threshold: Option<u32>,
                disabled: Option<bool>,
                borrow_limit_a: Option<u64>,
                borrow_limit_b: Option<u64>,
                max_swap_slippage: Option<u32>,
        __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl UpdateMarketBuilder {
  pub fn new() -> Self {
    Self::default()
  }
            #[inline(always)]
    pub fn authority(&mut self, authority: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.authority = Some(authority);
                    self
    }
            #[inline(always)]
    pub fn tuna_config(&mut self, tuna_config: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_config = Some(tuna_config);
                    self
    }
            #[inline(always)]
    pub fn market(&mut self, market: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.market = Some(market);
                    self
    }
                    #[inline(always)]
      pub fn address_lookup_table(&mut self, address_lookup_table: Pubkey) -> &mut Self {
        self.address_lookup_table = Some(address_lookup_table);
        self
      }
                #[inline(always)]
      pub fn max_leverage(&mut self, max_leverage: u32) -> &mut Self {
        self.max_leverage = Some(max_leverage);
        self
      }
                #[inline(always)]
      pub fn protocol_fee(&mut self, protocol_fee: u16) -> &mut Self {
        self.protocol_fee = Some(protocol_fee);
        self
      }
                #[inline(always)]
      pub fn protocol_fee_on_collateral(&mut self, protocol_fee_on_collateral: u16) -> &mut Self {
        self.protocol_fee_on_collateral = Some(protocol_fee_on_collateral);
        self
      }
                #[inline(always)]
      pub fn liquidation_fee(&mut self, liquidation_fee: u32) -> &mut Self {
        self.liquidation_fee = Some(liquidation_fee);
        self
      }
                #[inline(always)]
      pub fn liquidation_ratio(&mut self, liquidation_ratio: u32) -> &mut Self {
        self.liquidation_ratio = Some(liquidation_ratio);
        self
      }
                #[inline(always)]
      pub fn limit_order_execution_fee(&mut self, limit_order_execution_fee: u32) -> &mut Self {
        self.limit_order_execution_fee = Some(limit_order_execution_fee);
        self
      }
                #[inline(always)]
      pub fn oracle_price_deviation_threshold(&mut self, oracle_price_deviation_threshold: u32) -> &mut Self {
        self.oracle_price_deviation_threshold = Some(oracle_price_deviation_threshold);
        self
      }
                #[inline(always)]
      pub fn disabled(&mut self, disabled: bool) -> &mut Self {
        self.disabled = Some(disabled);
        self
      }
                #[inline(always)]
      pub fn borrow_limit_a(&mut self, borrow_limit_a: u64) -> &mut Self {
        self.borrow_limit_a = Some(borrow_limit_a);
        self
      }
                #[inline(always)]
      pub fn borrow_limit_b(&mut self, borrow_limit_b: u64) -> &mut Self {
        self.borrow_limit_b = Some(borrow_limit_b);
        self
      }
                #[inline(always)]
      pub fn max_swap_slippage(&mut self, max_swap_slippage: u32) -> &mut Self {
        self.max_swap_slippage = Some(max_swap_slippage);
        self
      }
        /// Add an additional account to the instruction.
  #[inline(always)]
  pub fn add_remaining_account(&mut self, account: solana_program::instruction::AccountMeta) -> &mut Self {
    self.__remaining_accounts.push(account);
    self
  }
  /// Add additional accounts to the instruction.
  #[inline(always)]
  pub fn add_remaining_accounts(&mut self, accounts: &[solana_program::instruction::AccountMeta]) -> &mut Self {
    self.__remaining_accounts.extend_from_slice(accounts);
    self
  }
  #[allow(clippy::clone_on_copy)]
  pub fn instruction(&self) -> solana_program::instruction::Instruction {
    let accounts = UpdateMarket {
                              authority: self.authority.expect("authority is not set"),
                                        tuna_config: self.tuna_config.expect("tuna_config is not set"),
                                        market: self.market.expect("market is not set"),
                      };
          let args = UpdateMarketInstructionArgs {
                                                              address_lookup_table: self.address_lookup_table.clone().expect("address_lookup_table is not set"),
                                                                  max_leverage: self.max_leverage.clone().expect("max_leverage is not set"),
                                                                  protocol_fee: self.protocol_fee.clone().expect("protocol_fee is not set"),
                                                                  protocol_fee_on_collateral: self.protocol_fee_on_collateral.clone().expect("protocol_fee_on_collateral is not set"),
                                                                  liquidation_fee: self.liquidation_fee.clone().expect("liquidation_fee is not set"),
                                                                  liquidation_ratio: self.liquidation_ratio.clone().expect("liquidation_ratio is not set"),
                                                                  limit_order_execution_fee: self.limit_order_execution_fee.clone().expect("limit_order_execution_fee is not set"),
                                                                  oracle_price_deviation_threshold: self.oracle_price_deviation_threshold.clone().expect("oracle_price_deviation_threshold is not set"),
                                                                  disabled: self.disabled.clone().expect("disabled is not set"),
                                                                  borrow_limit_a: self.borrow_limit_a.clone().expect("borrow_limit_a is not set"),
                                                                  borrow_limit_b: self.borrow_limit_b.clone().expect("borrow_limit_b is not set"),
                                                                  max_swap_slippage: self.max_swap_slippage.clone().expect("max_swap_slippage is not set"),
                                    };
    
    accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
  }
}

  /// `update_market` CPI accounts.
  pub struct UpdateMarketCpiAccounts<'a, 'b> {
          
                    
              pub authority: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub market: &'b solana_program::account_info::AccountInfo<'a>,
            }

/// `update_market` CPI instruction.
pub struct UpdateMarketCpi<'a, 'b> {
  /// The program to invoke.
  pub __program: &'b solana_program::account_info::AccountInfo<'a>,
      
              
          pub authority: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub market: &'b solana_program::account_info::AccountInfo<'a>,
            /// The arguments for the instruction.
    pub __args: UpdateMarketInstructionArgs,
  }

impl<'a, 'b> UpdateMarketCpi<'a, 'b> {
  pub fn new(
    program: &'b solana_program::account_info::AccountInfo<'a>,
          accounts: UpdateMarketCpiAccounts<'a, 'b>,
              args: UpdateMarketInstructionArgs,
      ) -> Self {
    Self {
      __program: program,
              authority: accounts.authority,
              tuna_config: accounts.tuna_config,
              market: accounts.market,
                    __args: args,
          }
  }
  #[inline(always)]
  pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
    self.invoke_signed_with_remaining_accounts(&[], &[])
  }
  #[inline(always)]
  pub fn invoke_with_remaining_accounts(&self, remaining_accounts: &[(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)]) -> solana_program::entrypoint::ProgramResult {
    self.invoke_signed_with_remaining_accounts(&[], remaining_accounts)
  }
  #[inline(always)]
  pub fn invoke_signed(&self, signers_seeds: &[&[&[u8]]]) -> solana_program::entrypoint::ProgramResult {
    self.invoke_signed_with_remaining_accounts(signers_seeds, &[])
  }
  #[allow(clippy::clone_on_copy)]
  #[allow(clippy::vec_init_then_push)]
  pub fn invoke_signed_with_remaining_accounts(
    &self,
    signers_seeds: &[&[&[u8]]],
    remaining_accounts: &[(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)]
  ) -> solana_program::entrypoint::ProgramResult {
    let mut accounts = Vec::with_capacity(3+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            *self.authority.key,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.tuna_config.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.market.key,
            false
          ));
                      remaining_accounts.iter().for_each(|remaining_account| {
      accounts.push(solana_program::instruction::AccountMeta {
          pubkey: *remaining_account.0.key,
          is_signer: remaining_account.1,
          is_writable: remaining_account.2,
      })
    });
    let mut data = borsh::to_vec(&UpdateMarketInstructionData::new()).unwrap();
          let mut args = borsh::to_vec(&self.__args).unwrap();
      data.append(&mut args);
    
    let instruction = solana_program::instruction::Instruction {
      program_id: crate::TUNA_ID,
      accounts,
      data,
    };
    let mut account_infos = Vec::with_capacity(4 + remaining_accounts.len());
    account_infos.push(self.__program.clone());
                  account_infos.push(self.authority.clone());
                        account_infos.push(self.tuna_config.clone());
                        account_infos.push(self.market.clone());
              remaining_accounts.iter().for_each(|remaining_account| account_infos.push(remaining_account.0.clone()));

    if signers_seeds.is_empty() {
      solana_program::program::invoke(&instruction, &account_infos)
    } else {
      solana_program::program::invoke_signed(&instruction, &account_infos, signers_seeds)
    }
  }
}

/// Instruction builder for `UpdateMarket` via CPI.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` tuna_config
                ///   2. `[writable]` market
#[derive(Clone, Debug)]
pub struct UpdateMarketCpiBuilder<'a, 'b> {
  instruction: Box<UpdateMarketCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> UpdateMarketCpiBuilder<'a, 'b> {
  pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
    let instruction = Box::new(UpdateMarketCpiBuilderInstruction {
      __program: program,
              authority: None,
              tuna_config: None,
              market: None,
                                            address_lookup_table: None,
                                max_leverage: None,
                                protocol_fee: None,
                                protocol_fee_on_collateral: None,
                                liquidation_fee: None,
                                liquidation_ratio: None,
                                limit_order_execution_fee: None,
                                oracle_price_deviation_threshold: None,
                                disabled: None,
                                borrow_limit_a: None,
                                borrow_limit_b: None,
                                max_swap_slippage: None,
                    __remaining_accounts: Vec::new(),
    });
    Self { instruction }
  }
      #[inline(always)]
    pub fn authority(&mut self, authority: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.authority = Some(authority);
                    self
    }
      #[inline(always)]
    pub fn tuna_config(&mut self, tuna_config: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_config = Some(tuna_config);
                    self
    }
      #[inline(always)]
    pub fn market(&mut self, market: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.market = Some(market);
                    self
    }
                    #[inline(always)]
      pub fn address_lookup_table(&mut self, address_lookup_table: Pubkey) -> &mut Self {
        self.instruction.address_lookup_table = Some(address_lookup_table);
        self
      }
                #[inline(always)]
      pub fn max_leverage(&mut self, max_leverage: u32) -> &mut Self {
        self.instruction.max_leverage = Some(max_leverage);
        self
      }
                #[inline(always)]
      pub fn protocol_fee(&mut self, protocol_fee: u16) -> &mut Self {
        self.instruction.protocol_fee = Some(protocol_fee);
        self
      }
                #[inline(always)]
      pub fn protocol_fee_on_collateral(&mut self, protocol_fee_on_collateral: u16) -> &mut Self {
        self.instruction.protocol_fee_on_collateral = Some(protocol_fee_on_collateral);
        self
      }
                #[inline(always)]
      pub fn liquidation_fee(&mut self, liquidation_fee: u32) -> &mut Self {
        self.instruction.liquidation_fee = Some(liquidation_fee);
        self
      }
                #[inline(always)]
      pub fn liquidation_ratio(&mut self, liquidation_ratio: u32) -> &mut Self {
        self.instruction.liquidation_ratio = Some(liquidation_ratio);
        self
      }
                #[inline(always)]
      pub fn limit_order_execution_fee(&mut self, limit_order_execution_fee: u32) -> &mut Self {
        self.instruction.limit_order_execution_fee = Some(limit_order_execution_fee);
        self
      }
                #[inline(always)]
      pub fn oracle_price_deviation_threshold(&mut self, oracle_price_deviation_threshold: u32) -> &mut Self {
        self.instruction.oracle_price_deviation_threshold = Some(oracle_price_deviation_threshold);
        self
      }
                #[inline(always)]
      pub fn disabled(&mut self, disabled: bool) -> &mut Self {
        self.instruction.disabled = Some(disabled);
        self
      }
                #[inline(always)]
      pub fn borrow_limit_a(&mut self, borrow_limit_a: u64) -> &mut Self {
        self.instruction.borrow_limit_a = Some(borrow_limit_a);
        self
      }
                #[inline(always)]
      pub fn borrow_limit_b(&mut self, borrow_limit_b: u64) -> &mut Self {
        self.instruction.borrow_limit_b = Some(borrow_limit_b);
        self
      }
                #[inline(always)]
      pub fn max_swap_slippage(&mut self, max_swap_slippage: u32) -> &mut Self {
        self.instruction.max_swap_slippage = Some(max_swap_slippage);
        self
      }
        /// Add an additional account to the instruction.
  #[inline(always)]
  pub fn add_remaining_account(&mut self, account: &'b solana_program::account_info::AccountInfo<'a>, is_writable: bool, is_signer: bool) -> &mut Self {
    self.instruction.__remaining_accounts.push((account, is_writable, is_signer));
    self
  }
  /// Add additional accounts to the instruction.
  ///
  /// Each account is represented by a tuple of the `AccountInfo`, a `bool` indicating whether the account is writable or not,
  /// and a `bool` indicating whether the account is a signer or not.
  #[inline(always)]
  pub fn add_remaining_accounts(&mut self, accounts: &[(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)]) -> &mut Self {
    self.instruction.__remaining_accounts.extend_from_slice(accounts);
    self
  }
  #[inline(always)]
  pub fn invoke(&self) -> solana_program::entrypoint::ProgramResult {
    self.invoke_signed(&[])
  }
  #[allow(clippy::clone_on_copy)]
  #[allow(clippy::vec_init_then_push)]
  pub fn invoke_signed(&self, signers_seeds: &[&[&[u8]]]) -> solana_program::entrypoint::ProgramResult {
          let args = UpdateMarketInstructionArgs {
                                                              address_lookup_table: self.instruction.address_lookup_table.clone().expect("address_lookup_table is not set"),
                                                                  max_leverage: self.instruction.max_leverage.clone().expect("max_leverage is not set"),
                                                                  protocol_fee: self.instruction.protocol_fee.clone().expect("protocol_fee is not set"),
                                                                  protocol_fee_on_collateral: self.instruction.protocol_fee_on_collateral.clone().expect("protocol_fee_on_collateral is not set"),
                                                                  liquidation_fee: self.instruction.liquidation_fee.clone().expect("liquidation_fee is not set"),
                                                                  liquidation_ratio: self.instruction.liquidation_ratio.clone().expect("liquidation_ratio is not set"),
                                                                  limit_order_execution_fee: self.instruction.limit_order_execution_fee.clone().expect("limit_order_execution_fee is not set"),
                                                                  oracle_price_deviation_threshold: self.instruction.oracle_price_deviation_threshold.clone().expect("oracle_price_deviation_threshold is not set"),
                                                                  disabled: self.instruction.disabled.clone().expect("disabled is not set"),
                                                                  borrow_limit_a: self.instruction.borrow_limit_a.clone().expect("borrow_limit_a is not set"),
                                                                  borrow_limit_b: self.instruction.borrow_limit_b.clone().expect("borrow_limit_b is not set"),
                                                                  max_swap_slippage: self.instruction.max_swap_slippage.clone().expect("max_swap_slippage is not set"),
                                    };
        let instruction = UpdateMarketCpi {
        __program: self.instruction.__program,
                  
          authority: self.instruction.authority.expect("authority is not set"),
                  
          tuna_config: self.instruction.tuna_config.expect("tuna_config is not set"),
                  
          market: self.instruction.market.expect("market is not set"),
                          __args: args,
            };
    instruction.invoke_signed_with_remaining_accounts(signers_seeds, &self.instruction.__remaining_accounts)
  }
}

#[derive(Clone, Debug)]
struct UpdateMarketCpiBuilderInstruction<'a, 'b> {
  __program: &'b solana_program::account_info::AccountInfo<'a>,
            authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_config: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                market: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                        address_lookup_table: Option<Pubkey>,
                max_leverage: Option<u32>,
                protocol_fee: Option<u16>,
                protocol_fee_on_collateral: Option<u16>,
                liquidation_fee: Option<u32>,
                liquidation_ratio: Option<u32>,
                limit_order_execution_fee: Option<u32>,
                oracle_price_deviation_threshold: Option<u32>,
                disabled: Option<bool>,
                borrow_limit_a: Option<u64>,
                borrow_limit_b: Option<u64>,
                max_swap_slippage: Option<u32>,
        /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
  __remaining_accounts: Vec<(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)>,
}

