import {
  closePositionOrcaInstruction,
  fetchMarket,
  fetchTunaPosition,
  fetchVault,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaPositionAddress,
  Market,
  RemoveLiquidityOrcaInstructionDataArgs,
  removeLiquidityOrcaInstructions,
  TunaPosition,
  Vault,
} from "@defituna/client";
import { fetchWhirlpool, Position as _OrcaPosition, Whirlpool } from "@orca-so/whirlpools-client";
import { Account, Address, address, IInstruction, KeyPairSigner as _KeyPairSigner } from "@solana/kit";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { accountExists, loadKeypair } from "src/utils/common";
import { createAndSendTransaction, rpc } from "src/utils/rpc";

/**
 * Removes liquidity from a position in an Orca *Liquidity Pool* and closes it, managing funds via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset withdrawal amounts and swap options for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and removing liquidity, though these actions can be performed separately, and liquidity can be removed multiple times
 * based on the available liquidity in the *Orca Position*.
 * @param {Address} tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position to manage.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function removeLiquidityAndClose(tunaPositionMint: Address): Promise<void> {
  /**
   * Program Derived Addresses and Accounts, fetched from their respective Client (Tuna or Orca);
   */
  /**
   * The {@link _KeyPairSigner Keypair} signing the transaction and the owner of the {@link TunaPosition Tuna Position}.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();
  /**
   * The Program Derived {@link Address Address} of the pool from Orca's Whirlpools to create the position in.
   * For this example we use the SOL/USDC Pool.
   */
  const whirlpoolPda: Address = SOL_USDC_WHIRLPOOL;
  if (!accountExists(rpc, whirlpoolPda)) throw new Error("Whirlpool Account does not exist.");
  /**
   * The Whirlpool Account containing deserialized {@link Whirlpool data},
   * fetched using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}
   */
  const whirlpoolAccount: Account<Whirlpool> = await fetchWhirlpool(rpc, whirlpoolPda);
  /**
   * The {@link Market Market} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const marketPda: Address = (await getMarketAddress(whirlpoolPda))[0];
  /**
   * The {@link TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaPositionPda: Address = (await getTunaPositionAddress(tunaPositionMint))[0];
  /**
   * The {@link Vault Lending Vault} Program Derived {@link Address Address} for Token A for Tuna operations,
   * fetched from the Tuna Client.
   */
  const lendingVaultPdaA: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintA))[0];
  /**
   * The *Lending Vault* Account for Token A containing deserialized {@link Vault data}, fetched using Tuna's Client.
   */
  const lendingVaultAccountA: Account<Vault> = await fetchVault(rpc, lendingVaultPdaA);
  /**
   * The {@link Vault Lending Vault} Program Derived {@link Address Address} for Token B for Tuna operations,
   * fetched from the Tuna Client.
   */
  const lendingVaultPdaB: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintB))[0];
  /**
   * The *Lending Vault* Account for Token B containing deserialized {@link Vault data}, fetched using Tuna's Client.
   */
  const lendingVaultAccountB: Account<Vault> = await fetchVault(rpc, lendingVaultPdaB);
  /**
   * The *Market* Account containing deserialized {@link Market data}, fetched using Tuna's Client
   */
  const marketAccount: Account<Market> = await fetchMarket(rpc, marketPda);

  /**
   * Defining input variables.
   */
  /**
   * Minimum removed amounts for Tokens A and B to be respected by the *RemoveLiquidity* instruction, acting as slippage limits.
   */
  const minRemovedAmount = { a: 0n, b: 0n };
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price` during potential inner swaps due to deposit ratio rebalancing.
   */
  const maxSwapSlippage = 0;
  /**
   * The option for whether to swap and which *token* to swap to during *RemoveLiquidity*.
   * - 0 - No swap
   * - 1 - Swaps to *Token A*
   * - 2 - Swaps to *Token B*
   */
  const swapToToken = 1;
  /**
   * The percentage of *liquidity* in the *Orca Position* to remove via the *RemoveLiquidity* instruction.
   * Ranges from 0 (0%) to 1000000 (100%), where each increment of 1 equals 0.0001% (e.g., 250000 = 25%, 5000 = 0.5%, 100000 = 10%).
   * For this example since closing the Position after, set to 1000000 (100%) to remove all *liquidity*.
   */
  const withdrawPercent = 1000000;

  /**
   * The *Tuna Position* Account containing deserialized {@link TunaPosition data}, fetched using Tuna's Client
   */
  const tunaPositionAccount: Account<TunaPosition> = await fetchTunaPosition(rpc, tunaPositionPda);

  /**
   * Creation of instructions for removing liquidity and closing positions.
   */
  /**
   * The RemoveLiquidityOrca instruction created via the Tuna Client, handling:
   * - Withdraws *tokens* from the *Whirlpool*s vaults to decrease the {@link _OrcaPosition Position's} liquidity.
   * - Repays any potential borrowed funds from *Tuna* {@link _Vault Lending Vaults} ATAs, proportionally to the withdraw percentage.
   * - Potential swap of tokens if user opts for it, in order to receive all in one token.
   */
  const instructions: IInstruction[] = [];

  /**
   * Checks that position state is `Normal` in order to remove any remaining liquidity from it, otherwise skips removing liquidity.
   * Available states are:
   * - 0: Normal
   * - 1: Liquidated
   * - 2: ClosedByLimitOrder
   */
  if (tunaPositionAccount.data.state === 0) {
    const args: RemoveLiquidityOrcaInstructionDataArgs = {
      withdrawPercent,
      swapToToken,
      minRemovedAmountA: minRemovedAmount.a,
      minRemovedAmountB: minRemovedAmount.b,
      maxSwapSlippage,
    };

    const removeLiquidityOrcaIxs = await removeLiquidityOrcaInstructions(
      authority,
      tunaPositionAccount,
      lendingVaultAccountA,
      lendingVaultAccountB,
      whirlpoolAccount,
      args,
    );

    instructions.push(...removeLiquidityOrcaIxs);
  }

  /**
   * The ClosePositionOrca instruction created via the Tuna Client, handling:
   * - Closing the {@link TunaPosition Tuna Position} account in the Tuna smart contract.
   * - Closing the {@link _OrcaPosition Orca Position} account via CPI to the Whirlpools smart contract.
   * - Closing Tuna Position ATA accounts and burning of the *Position Mint NFT*.
   */
  const closePositionOrcaIx = await closePositionOrcaInstruction(authority, tunaPositionAccount);

  instructions.push(closePositionOrcaIx);

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(authority, instructions, marketAccount.data.addressLookupTable);
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

removeLiquidityAndClose(address(tunaPositionMint)).catch(console.error);
