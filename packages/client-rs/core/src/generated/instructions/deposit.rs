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
pub struct Deposit {
      
              
          pub authority: solana_program::pubkey::Pubkey,
          
              
          pub mint: solana_program::pubkey::Pubkey,
          
              
          pub tuna_config: solana_program::pubkey::Pubkey,
          
              
          pub lending_position: solana_program::pubkey::Pubkey,
          
              
          pub vault: solana_program::pubkey::Pubkey,
          
              
          pub vault_ata: solana_program::pubkey::Pubkey,
          
              
          pub authority_ata: solana_program::pubkey::Pubkey,
          
              
          pub token_program: solana_program::pubkey::Pubkey,
          
              
          pub associated_token_program: solana_program::pubkey::Pubkey,
      }

impl Deposit {
  pub fn instruction(&self, args: DepositInstructionArgs) -> solana_program::instruction::Instruction {
    self.instruction_with_remaining_accounts(args, &[])
  }
  #[allow(clippy::arithmetic_side_effects)]
  #[allow(clippy::vec_init_then_push)]
  pub fn instruction_with_remaining_accounts(&self, args: DepositInstructionArgs, remaining_accounts: &[solana_program::instruction::AccountMeta]) -> solana_program::instruction::Instruction {
    let mut accounts = Vec::with_capacity(9+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            self.authority,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.mint,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.tuna_config,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.lending_position,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.vault,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.vault_ata,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            self.authority_ata,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.token_program,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            self.associated_token_program,
            false
          ));
                      accounts.extend_from_slice(remaining_accounts);
    let mut data = borsh::to_vec(&DepositInstructionData::new()).unwrap();
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
 pub struct DepositInstructionData {
            discriminator: [u8; 8],
            }

impl DepositInstructionData {
  pub fn new() -> Self {
    Self {
                        discriminator: [242, 35, 198, 137, 82, 225, 242, 182],
                                }
  }
}

impl Default for DepositInstructionData {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
 pub struct DepositInstructionArgs {
                  pub amount: u64,
      }


/// Instruction builder for `Deposit`.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` mint
          ///   2. `[]` tuna_config
                ///   3. `[writable]` lending_position
                ///   4. `[writable]` vault
                ///   5. `[writable]` vault_ata
                ///   6. `[writable]` authority_ata
                ///   7. `[optional]` token_program (default to `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`)
          ///   8. `[]` associated_token_program
#[derive(Clone, Debug, Default)]
pub struct DepositBuilder {
            authority: Option<solana_program::pubkey::Pubkey>,
                mint: Option<solana_program::pubkey::Pubkey>,
                tuna_config: Option<solana_program::pubkey::Pubkey>,
                lending_position: Option<solana_program::pubkey::Pubkey>,
                vault: Option<solana_program::pubkey::Pubkey>,
                vault_ata: Option<solana_program::pubkey::Pubkey>,
                authority_ata: Option<solana_program::pubkey::Pubkey>,
                token_program: Option<solana_program::pubkey::Pubkey>,
                associated_token_program: Option<solana_program::pubkey::Pubkey>,
                        amount: Option<u64>,
        __remaining_accounts: Vec<solana_program::instruction::AccountMeta>,
}

impl DepositBuilder {
  pub fn new() -> Self {
    Self::default()
  }
            #[inline(always)]
    pub fn authority(&mut self, authority: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.authority = Some(authority);
                    self
    }
            #[inline(always)]
    pub fn mint(&mut self, mint: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.mint = Some(mint);
                    self
    }
            #[inline(always)]
    pub fn tuna_config(&mut self, tuna_config: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.tuna_config = Some(tuna_config);
                    self
    }
            #[inline(always)]
    pub fn lending_position(&mut self, lending_position: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.lending_position = Some(lending_position);
                    self
    }
            #[inline(always)]
    pub fn vault(&mut self, vault: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.vault = Some(vault);
                    self
    }
            #[inline(always)]
    pub fn vault_ata(&mut self, vault_ata: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.vault_ata = Some(vault_ata);
                    self
    }
            #[inline(always)]
    pub fn authority_ata(&mut self, authority_ata: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.authority_ata = Some(authority_ata);
                    self
    }
            /// `[optional account, default to 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA']`
#[inline(always)]
    pub fn token_program(&mut self, token_program: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.token_program = Some(token_program);
                    self
    }
            #[inline(always)]
    pub fn associated_token_program(&mut self, associated_token_program: solana_program::pubkey::Pubkey) -> &mut Self {
                        self.associated_token_program = Some(associated_token_program);
                    self
    }
                    #[inline(always)]
      pub fn amount(&mut self, amount: u64) -> &mut Self {
        self.amount = Some(amount);
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
    let accounts = Deposit {
                              authority: self.authority.expect("authority is not set"),
                                        mint: self.mint.expect("mint is not set"),
                                        tuna_config: self.tuna_config.expect("tuna_config is not set"),
                                        lending_position: self.lending_position.expect("lending_position is not set"),
                                        vault: self.vault.expect("vault is not set"),
                                        vault_ata: self.vault_ata.expect("vault_ata is not set"),
                                        authority_ata: self.authority_ata.expect("authority_ata is not set"),
                                        token_program: self.token_program.unwrap_or(solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")),
                                        associated_token_program: self.associated_token_program.expect("associated_token_program is not set"),
                      };
          let args = DepositInstructionArgs {
                                                              amount: self.amount.clone().expect("amount is not set"),
                                    };
    
    accounts.instruction_with_remaining_accounts(args, &self.__remaining_accounts)
  }
}

  /// `deposit` CPI accounts.
  pub struct DepositCpiAccounts<'a, 'b> {
          
                    
              pub authority: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub mint: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub lending_position: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub vault: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub vault_ata: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub authority_ata: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
                
                    
              pub associated_token_program: &'b solana_program::account_info::AccountInfo<'a>,
            }

/// `deposit` CPI instruction.
pub struct DepositCpi<'a, 'b> {
  /// The program to invoke.
  pub __program: &'b solana_program::account_info::AccountInfo<'a>,
      
              
          pub authority: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub mint: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub tuna_config: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub lending_position: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub vault: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub vault_ata: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub authority_ata: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub token_program: &'b solana_program::account_info::AccountInfo<'a>,
          
              
          pub associated_token_program: &'b solana_program::account_info::AccountInfo<'a>,
            /// The arguments for the instruction.
    pub __args: DepositInstructionArgs,
  }

impl<'a, 'b> DepositCpi<'a, 'b> {
  pub fn new(
    program: &'b solana_program::account_info::AccountInfo<'a>,
          accounts: DepositCpiAccounts<'a, 'b>,
              args: DepositInstructionArgs,
      ) -> Self {
    Self {
      __program: program,
              authority: accounts.authority,
              mint: accounts.mint,
              tuna_config: accounts.tuna_config,
              lending_position: accounts.lending_position,
              vault: accounts.vault,
              vault_ata: accounts.vault_ata,
              authority_ata: accounts.authority_ata,
              token_program: accounts.token_program,
              associated_token_program: accounts.associated_token_program,
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
  #[allow(clippy::arithmetic_side_effects)]
  #[allow(clippy::clone_on_copy)]
  #[allow(clippy::vec_init_then_push)]
  pub fn invoke_signed_with_remaining_accounts(
    &self,
    signers_seeds: &[&[&[u8]]],
    remaining_accounts: &[(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)]
  ) -> solana_program::entrypoint::ProgramResult {
    let mut accounts = Vec::with_capacity(9+ remaining_accounts.len());
                            accounts.push(solana_program::instruction::AccountMeta::new(
            *self.authority.key,
            true
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.mint.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.tuna_config.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.lending_position.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.vault.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.vault_ata.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new(
            *self.authority_ata.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.token_program.key,
            false
          ));
                                          accounts.push(solana_program::instruction::AccountMeta::new_readonly(
            *self.associated_token_program.key,
            false
          ));
                      remaining_accounts.iter().for_each(|remaining_account| {
      accounts.push(solana_program::instruction::AccountMeta {
          pubkey: *remaining_account.0.key,
          is_signer: remaining_account.1,
          is_writable: remaining_account.2,
      })
    });
    let mut data = borsh::to_vec(&DepositInstructionData::new()).unwrap();
          let mut args = borsh::to_vec(&self.__args).unwrap();
      data.append(&mut args);
    
    let instruction = solana_program::instruction::Instruction {
      program_id: crate::TUNA_ID,
      accounts,
      data,
    };
    let mut account_infos = Vec::with_capacity(10 + remaining_accounts.len());
    account_infos.push(self.__program.clone());
                  account_infos.push(self.authority.clone());
                        account_infos.push(self.mint.clone());
                        account_infos.push(self.tuna_config.clone());
                        account_infos.push(self.lending_position.clone());
                        account_infos.push(self.vault.clone());
                        account_infos.push(self.vault_ata.clone());
                        account_infos.push(self.authority_ata.clone());
                        account_infos.push(self.token_program.clone());
                        account_infos.push(self.associated_token_program.clone());
              remaining_accounts.iter().for_each(|remaining_account| account_infos.push(remaining_account.0.clone()));

    if signers_seeds.is_empty() {
      solana_program::program::invoke(&instruction, &account_infos)
    } else {
      solana_program::program::invoke_signed(&instruction, &account_infos, signers_seeds)
    }
  }
}

/// Instruction builder for `Deposit` via CPI.
///
/// ### Accounts:
///
                      ///   0. `[writable, signer]` authority
          ///   1. `[]` mint
          ///   2. `[]` tuna_config
                ///   3. `[writable]` lending_position
                ///   4. `[writable]` vault
                ///   5. `[writable]` vault_ata
                ///   6. `[writable]` authority_ata
          ///   7. `[]` token_program
          ///   8. `[]` associated_token_program
#[derive(Clone, Debug)]
pub struct DepositCpiBuilder<'a, 'b> {
  instruction: Box<DepositCpiBuilderInstruction<'a, 'b>>,
}

impl<'a, 'b> DepositCpiBuilder<'a, 'b> {
  pub fn new(program: &'b solana_program::account_info::AccountInfo<'a>) -> Self {
    let instruction = Box::new(DepositCpiBuilderInstruction {
      __program: program,
              authority: None,
              mint: None,
              tuna_config: None,
              lending_position: None,
              vault: None,
              vault_ata: None,
              authority_ata: None,
              token_program: None,
              associated_token_program: None,
                                            amount: None,
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
    pub fn mint(&mut self, mint: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.mint = Some(mint);
                    self
    }
      #[inline(always)]
    pub fn tuna_config(&mut self, tuna_config: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.tuna_config = Some(tuna_config);
                    self
    }
      #[inline(always)]
    pub fn lending_position(&mut self, lending_position: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.lending_position = Some(lending_position);
                    self
    }
      #[inline(always)]
    pub fn vault(&mut self, vault: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.vault = Some(vault);
                    self
    }
      #[inline(always)]
    pub fn vault_ata(&mut self, vault_ata: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.vault_ata = Some(vault_ata);
                    self
    }
      #[inline(always)]
    pub fn authority_ata(&mut self, authority_ata: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.authority_ata = Some(authority_ata);
                    self
    }
      #[inline(always)]
    pub fn token_program(&mut self, token_program: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.token_program = Some(token_program);
                    self
    }
      #[inline(always)]
    pub fn associated_token_program(&mut self, associated_token_program: &'b solana_program::account_info::AccountInfo<'a>) -> &mut Self {
                        self.instruction.associated_token_program = Some(associated_token_program);
                    self
    }
                    #[inline(always)]
      pub fn amount(&mut self, amount: u64) -> &mut Self {
        self.instruction.amount = Some(amount);
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
          let args = DepositInstructionArgs {
                                                              amount: self.instruction.amount.clone().expect("amount is not set"),
                                    };
        let instruction = DepositCpi {
        __program: self.instruction.__program,
                  
          authority: self.instruction.authority.expect("authority is not set"),
                  
          mint: self.instruction.mint.expect("mint is not set"),
                  
          tuna_config: self.instruction.tuna_config.expect("tuna_config is not set"),
                  
          lending_position: self.instruction.lending_position.expect("lending_position is not set"),
                  
          vault: self.instruction.vault.expect("vault is not set"),
                  
          vault_ata: self.instruction.vault_ata.expect("vault_ata is not set"),
                  
          authority_ata: self.instruction.authority_ata.expect("authority_ata is not set"),
                  
          token_program: self.instruction.token_program.expect("token_program is not set"),
                  
          associated_token_program: self.instruction.associated_token_program.expect("associated_token_program is not set"),
                          __args: args,
            };
    instruction.invoke_signed_with_remaining_accounts(signers_seeds, &self.instruction.__remaining_accounts)
  }
}

#[derive(Clone, Debug)]
struct DepositCpiBuilderInstruction<'a, 'b> {
  __program: &'b solana_program::account_info::AccountInfo<'a>,
            authority: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                mint: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                tuna_config: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                lending_position: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                vault: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                vault_ata: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                authority_ata: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                associated_token_program: Option<&'b solana_program::account_info::AccountInfo<'a>>,
                        amount: Option<u64>,
        /// Additional instruction accounts `(AccountInfo, is_writable, is_signer)`.
  __remaining_accounts: Vec<(&'b solana_program::account_info::AccountInfo<'a>, bool, bool)>,
}

