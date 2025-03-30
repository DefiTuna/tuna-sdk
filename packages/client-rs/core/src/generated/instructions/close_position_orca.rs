//! This code was AUTOGENERATED using the codama library.
//! Please DO NOT EDIT THIS FILE, instead use visitors
//! to add features, then rerun codama to update it.
//!
//! <https://github.com/codama-idl/codama>
//!

use borsh::BorshSerialize;
use borsh::BorshDeserialize;

/// Accounts.
#[derive(Debug)]
pub struct ClosePositionOrca {
            /// 
/// TUNA accounts
/// 

    
              
          pub authority: solana_program::pubkey::Pubkey,
          
              
          pub tuna_config: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_mint: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_ata: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_ata_a: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_ata_b: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_owner_ata_a: solana_program::pubkey::Pubkey,
          
              
          pub tuna_position_owner_ata_b: solana_program::pubkey::Pubkey,
                /// 
/// ORCA accounts
/// 

    
              
          pub whirlpool_program: solana_program::pubkey::Pubkey,
          
              
          pub whirlpool: solana_program::pubkey::Pubkey,
          
              
          pub orca_position: solana_program::pubkey::Pubkey,
                /// 
/// Other accounts
/// 

    
              
          pub token_program: solana_program::pubkey::Pubkey,
          
              
          pub token2022_program: solana_program::pubkey::Pubkey,
      }

impl ClosePositionOrca {
  pub fn instruction(&self) -> solana_program::instruction::Instruction {
    self.instruction_with_remaining_accounts(&[])
  }
  #[allow(clippy::arithmetic_side_effects)]
  #[allow(clippy::vec_init_then_push)]
  pub fn instruction_with_remaining_accounts(&self, remaining_accounts: &[solana_program::instruction::AccountMeta]) -> solana_program::instruction::Instruction {
    let mut accounts = Vec::with_capacity(14+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            self.authority,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.tuna_config,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_mint,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_ata,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_ata_a,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_ata_b,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_owner_ata_a,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.tuna_position_owner_ata_b,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.whirlpool_program,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.whirlpool,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.orca_position,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token2022_program,
            false
          ));
                      accounts.extend_from_slice(remaining_accounts);
    let data = borsh::to_vec(&ClosePositionOrcaInstructionData::new()).unwrap();
    
    solana_program::instruction::Instruction {
      program_id: crate::TUNA_ID,
      accounts,
      data,
    }
  }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
 pub struct ClosePositionOrcaInstructionData {
            discriminator: [u8; 8],
      }

impl ClosePositionOrcaInstructionData {
  pub fn new() -> Self {
    Self {
                        discriminator: [253, 98, 90, 239, 191, 36, 161, 26],
                  }
  }
}

impl Default for ClosePositionOrcaInstructionData {
  fn default() -> Self {
    Self::new()
  }
}



/// Instruction builder for `ClosePositionOrca`.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` tuna_config
                ///   2. `[writable]` tuna_position
                ///   3. `[writable]` tuna_position_mint
                ///   4. `[writable]` tuna_position_ata
                ///   5. `[writable]` tuna_position_ata_a
                ///   6. `[writable]` tuna_position_ata_b
                ///   7. `[writable]` tuna_position_owner_ata_a
                ///   8. `[writable]` tuna_position_owner_ata_b
          ///   9. `[]` whirlpool_program
          ///   10. `[]` whirlpool
                ///   11. `[writable]` orca_position
                ///   12. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
          ///   13. `[]` token2022_program
#[derive(Clone, Debug, Default)]
pub struct ClosePositionOrcaBuilder {
            authority: Option<solana_program::pubkey::Pubkey>,
                tuna_config: Option<solana_program::pubkey::Pubkey>,
                tuna_position: Option<solana_program::pubkey::Pubkey>,
                tuna_position_mint: Option<solana_program::pubkey::Pubkey>,
                tuna_position_ata: Option<solana_program::pubkey::Pubkey>,
                tuna_position_ata_a: Option<solana_program::pubkey::Pubkey>,
                tuna_position_ata_b: Option<solana_program::pubkey::Pubkey>,
                tuna_position_owner_ata_a: Option<solana_program::pubkey::Pubkey>,
                tuna_position_owner_ata_b: Option<solana_program::pubkey::Pubkey>,
                whirlpool_program: Option<solana_program::pubkey::Pubkey>,
                whirlpool: Option<solana_program::pubkey::Pubkey>,
                orca_position: Option<solana_program::pubkey::Pubkey>,
                token_program: Option<solana_program::pubkey::Pubkey>,
                token2022_program: Option<solana_program::pubkey::Pubkey>,
                __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl ClosePositionOrcaBuilder {
  pub fn new() -> Self {
    Self::default()
  }
            /// 
/// TUNA accounts
/// 
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
    pub fn tuna_position(&mut self, tuna_position: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position = Some(tuna_position);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_mint(&mut self, tuna_position_mint: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_mint = Some(tuna_position_mint);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_ata(&mut self, tuna_position_ata: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_ata = Some(tuna_position_ata);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_ata_a(&mut self, tuna_position_ata_a: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_ata_a = Some(tuna_position_ata_a);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_ata_b(&mut self, tuna_position_ata_b: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_ata_b = Some(tuna_position_ata_b);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_owner_ata_a(&mut self, tuna_position_owner_ata_a: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_owner_ata_a = Some(tuna_position_owner_ata_a);
                    self
    }
            #[inline(always)]
    pub fn tuna_position_owner_ata_b(&mut self, tuna_position_owner_ata_b: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_position_owner_ata_b = Some(tuna_position_owner_ata_b);
                    self
    }
            /// 
/// ORCA accounts
/// 
#[inline(always)]
    pub fn whirlpool_program(&mut self, whirlpool_program: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.whirlpool_program = Some(whirlpool_program);
                    self
    }
            #[inline(always)]
    pub fn whirlpool(&mut self, whirlpool: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.whirlpool = Some(whirlpool);
                    self
    }
            #[inline(always)]
    pub fn orca_position(&mut self, orca_position: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.orca_position = Some(orca_position);
                    self
    }
            /// `[optional account, default to 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']`
/// 
/// Other accounts
/// 
#[inline(always)]
    pub fn token_program(&mut self, token_program: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.token_program = Some(token_program);
                    self
    }
            #[inline(always)]
    pub fn token2022_program(&mut self, token2022_program: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.token2022_program = Some(token2022_program);
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
    let accounts = ClosePositionOrca {
                              authority: self.authority.expect("authority is not set"),
                                        tuna_config: self.tuna_config.expect("tuna_config is not set"),
                                        tuna_position: self.tuna_position.expect("tuna_position is not set"),
                                        tuna_position_mint: self.tuna_position_mint.expect("tuna_position_mint is not set"),
                                        tuna_position_ata: self.tuna_position_ata.expect("tuna_position_ata is not set"),
                                        tuna_position_ata_a: self.tuna_position_ata_a.expect("tuna_position_ata_a is not set"),
                                        tuna_position_ata_b: self.tuna_position_ata_b.expect("tuna_position_ata_b is not set"),
                                        tuna_position_owner_ata_a: self.tuna_position_owner_ata_a.expect("tuna_position_owner_ata_a is not set"),
                                        tuna_position_owner_ata_b: self.tuna_position_owner_ata_b.expect("tuna_position_owner_ata_b is not set"),
                                        whirlpool_program: self.whirlpool_program.expect("whirlpool_program is not set"),
                                        whirlpool: self.whirlpool.expect("whirlpool is not set"),
                                        orca_position: self.orca_position.expect("orca_position is not set"),
                                        token_program: self.token_program.unwrap_or(solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
                                        token2022_program: self.token2022_program.expect("token2022_program is not set"),
                      };
    
    accounts.instruction_with_remaining_accounts(&self.__remaining_accounts)
  }
}

  /// `close_position_orca` CPI accounts.
  pub struct ClosePositionOrcaCpiAccounts<'a, 'b> {
                  /// 
/// TUNA accounts
/// 

      
                    
              pub authority: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_mint: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_ata: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_ata_a: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_ata_b: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_owner_ata_a: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_position_owner_ata_b: &'b solana_program::account_info::AccountInfo<'a>,
                        /// 
/// ORCA accounts
/// 

      
                    
              pub whirlpool_program: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub whirlpool: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub orca_position: &'b solana_program::account_info::AccountInfo<'a>,
                        /// 
/// Other accounts
/// 

      
                    
              pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub token2022_program: &'b solana_program::account_info::AccountInfo<'a>,
            }

/// `close_position_orca` CPI instruction.
pub struct ClosePositionOrcaCpi<'a, 'b> {
  /// The program to invoke.
  pub __program: &'b solana_program::account_info::AccountInfo<'a>,
            /// 
/// TUNA accounts
/// 

    
              
          pub authority: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_mint: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_ata: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_ata_a: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_ata_b: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_owner_ata_a: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_position_owner_ata_b: &'b solana_program::account_info::AccountInfo<'a>,
                /// 
/// ORCA accounts
/// 

    
              
          pub whirlpool_program: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub whirlpool: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub orca_position: &'b solana_program::account_info::AccountInfo<'a>,
                /// 
/// Other accounts
/// 

    
              
          pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub token2022_program: &'b solana_program::account_info::AccountInfo<'a>,
        }

impl<'a, 'b> ClosePositionOrcaCpi<'a, 'b> {
  pub fn new(
    program: &'b solana_program::account_info::AccountInfo<'a>,
          accounts: ClosePositionOrcaCpiAccounts<'a, 'b>,
          ) -> Self {
    Self {
      __program: program,
              authority: accounts.authority,
              tuna_config: accounts.tuna_config,
              tuna_position: accounts.tuna_position,
              tuna_position_mint: accounts.tuna_position_mint,
              tuna_position_ata: accounts.tuna_position_ata,
              tuna_position_ata_a: accounts.tuna_position_ata_a,
              tuna_position_ata_b: accounts.tuna_position_ata_b,
              tuna_position_owner_ata_a: accounts.tuna_position_owner_ata_a,
              tuna_position_owner_ata_b: accounts.tuna_position_owner_ata_b,
              whirlpool_program: accounts.whirlpool_program,
              whirlpool: accounts.whirlpool,
              orca_position: accounts.orca_position,
              token_program: accounts.token_program,
              token2022_program: accounts.token2022_program,
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
  #[allow(clippy::arithmetic_side_effects)]
  #[allow(clippy::clone_on_copy)]
  #[allow(clippy::vec_init_then_push)]
  pub fn invoke_signed_with_remaining_accounts(
    &self,
    signers_seeds: &[&[&[u8]]],
    remaining_accounts: &[(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)]
  ) -> solana_program::entrypoint::ProgramResult {
    let mut accounts = Vec::with_capacity(14+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            *self.authority.key,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.tuna_config.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_mint.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_ata.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_ata_a.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_ata_b.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_owner_ata_a.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.tuna_position_owner_ata_b.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.whirlpool_program.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.whirlpool.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.orca_position.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token_program.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token2022_program.key,
            false
          ));
                      remaining_accounts.iter().for_each(|remaining_account| {
      accounts.push(solana_program::instruction::AccountMeta {
          pubkey: *remaining_account.0.key,
          is_signer: remaining_account.1,
          is_writable: remaining_account.2,
      })
    });
    let data = borsh::to_vec(&ClosePositionOrcaInstructionData::new()).unwrap();
    
    let instruction = solana_program::instruction::Instruction {
      program_id: crate::TUNA_ID,
      accounts,
      data,
    };
    let mut account_infos = Vec::with_capacity(15 + remaining_accounts.len());
    account_infos.push(self.__program.clone());
                  account_infos.push(self.authority.clone());
                        account_infos.push(self.tuna_config.clone());
                        account_infos.push(self.tuna_position.clone());
                        account_infos.push(self.tuna_position_mint.clone());
                        account_infos.push(self.tuna_position_ata.clone());
                        account_infos.push(self.tuna_position_ata_a.clone());
                        account_infos.push(self.tuna_position_ata_b.clone());
                        account_infos.push(self.tuna_position_owner_ata_a.clone());
                        account_infos.push(self.tuna_position_owner_ata_b.clone());
                        account_infos.push(self.whirlpool_program.clone());
                        account_infos.push(self.whirlpool.clone());
                        account_infos.push(self.orca_position.clone());
                        account_infos.push(self.token_program.clone());
                        account_infos.push(self.token2022_program.clone());
              remaining_accounts.iter().for_each(|remaining_account| account_infos.push(remaining_account.0.clone()));

    if signers_seeds.is_empty() {
      solana_program::program::invoke(&instruction, &account_infos)
    } else {
      solana_program::program::invoke_signed(&instruction, &account_infos, signers_seeds)
    }
  }
}

/// Instruction builder for `ClosePositionOrca` via CPI.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` tuna_config
                ///   2. `[writable]` tuna_position
                ///   3. `[writable]` tuna_position_mint
                ///   4. `[writable]` tuna_position_ata
                ///   5. `[writable]` tuna_position_ata_a
                ///   6. `[writable]` tuna_position_ata_b
                ///   7. `[writable]` tuna_position_owner_ata_a
                ///   8. `[writable]` tuna_position_owner_ata_b
          ///   9. `[]` whirlpool_program
          ///   10. `[]` whirlpool
                ///   11. `[writable]` orca_position
          ///   12. `[]` token_program
          ///   13. `[]` token2022_program
#[derive(Clone, Debug)]
pub struct ClosePositionOrcaCpiBuilder<'a, 'b> {
  instruction: Box<ClosePositionOrcaCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> ClosePositionOrcaCpiBuilder<'a, 'b> {
  pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
    let instruction = Box::new(ClosePositionOrcaCpiBuilderInstruction {
      __program: program,
              authority: None,
              tuna_config: None,
              tuna_position: None,
              tuna_position_mint: None,
              tuna_position_ata: None,
              tuna_position_ata_a: None,
              tuna_position_ata_b: None,
              tuna_position_owner_ata_a: None,
              tuna_position_owner_ata_b: None,
              whirlpool_program: None,
              whirlpool: None,
              orca_position: None,
              token_program: None,
              token2022_program: None,
                                __remaining_accounts: Vec::new(),
    });
    Self { instruction }
  }
      /// 
/// TUNA accounts
/// 
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
    pub fn tuna_position(&mut self, tuna_position: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position = Some(tuna_position);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_mint(&mut self, tuna_position_mint: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_mint = Some(tuna_position_mint);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_ata(&mut self, tuna_position_ata: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_ata = Some(tuna_position_ata);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_ata_a(&mut self, tuna_position_ata_a: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_ata_a = Some(tuna_position_ata_a);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_ata_b(&mut self, tuna_position_ata_b: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_ata_b = Some(tuna_position_ata_b);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_owner_ata_a(&mut self, tuna_position_owner_ata_a: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_owner_ata_a = Some(tuna_position_owner_ata_a);
                    self
    }
      #[inline(always)]
    pub fn tuna_position_owner_ata_b(&mut self, tuna_position_owner_ata_b: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_position_owner_ata_b = Some(tuna_position_owner_ata_b);
                    self
    }
      /// 
/// ORCA accounts
/// 
#[inline(always)]
    pub fn whirlpool_program(&mut self, whirlpool_program: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.whirlpool_program = Some(whirlpool_program);
                    self
    }
      #[inline(always)]
    pub fn whirlpool(&mut self, whirlpool: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.whirlpool = Some(whirlpool);
                    self
    }
      #[inline(always)]
    pub fn orca_position(&mut self, orca_position: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.orca_position = Some(orca_position);
                    self
    }
      /// 
/// Other accounts
/// 
#[inline(always)]
    pub fn token_program(&mut self, token_program: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.token_program = Some(token_program);
                    self
    }
      #[inline(always)]
    pub fn token2022_program(&mut self, token2022_program: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.token2022_program = Some(token2022_program);
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
        let instruction = ClosePositionOrcaCpi {
        __program: self.instruction.__program,
                  
          authority: self.instruction.authority.expect("authority is not set"),
                  
          tuna_config: self.instruction.tuna_config.expect("tuna_config is not set"),
                  
          tuna_position: self.instruction.tuna_position.expect("tuna_position is not set"),
                  
          tuna_position_mint: self.instruction.tuna_position_mint.expect("tuna_position_mint is not set"),
                  
          tuna_position_ata: self.instruction.tuna_position_ata.expect("tuna_position_ata is not set"),
                  
          tuna_position_ata_a: self.instruction.tuna_position_ata_a.expect("tuna_position_ata_a is not set"),
                  
          tuna_position_ata_b: self.instruction.tuna_position_ata_b.expect("tuna_position_ata_b is not set"),
                  
          tuna_position_owner_ata_a: self.instruction.tuna_position_owner_ata_a.expect("tuna_position_owner_ata_a is not set"),
                  
          tuna_position_owner_ata_b: self.instruction.tuna_position_owner_ata_b.expect("tuna_position_owner_ata_b is not set"),
                  
          whirlpool_program: self.instruction.whirlpool_program.expect("whirlpool_program is not set"),
                  
          whirlpool: self.instruction.whirlpool.expect("whirlpool is not set"),
                  
          orca_position: self.instruction.orca_position.expect("orca_position is not set"),
                  
          token_program: self.instruction.token_program.expect("token_program is not set"),
                  
          token2022_program: self.instruction.token2022_program.expect("token2022_program is not set"),
                    };
    instruction.invoke_signed_with_remaining_accounts(signers_seeds, &self.instruction.__remaining_accounts)
  }
}

#[derive(Clone, Debug)]
struct ClosePositionOrcaCpiBuilderInstruction<'a, 'b> {
  __program: &'b solana_program::account_info::AccountInfo<'a>,
            authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_config: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_mint: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_ata: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_ata_a: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_ata_b: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_owner_ata_a: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_position_owner_ata_b: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                whirlpool_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                whirlpool: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                orca_position: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                token2022_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
  __remaining_accounts: Vec<(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)>,
}

