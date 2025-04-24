import { type Account, AccountRole, Address, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getOracleAddress, getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getCreateAtaInstructions,
  getLiquidatePositionOrcaInstruction,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  getTunaConfigAddress,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function liquidatePositionOrcaInstructions(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  withdrawPercent: number,
): Promise<IInstruction[]> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const instructions: IInstruction[] = [];

  //
  // Add create liquidator's token account instructions if needed.
  //

  const createLiquidatorAtaAInstructions = await getCreateAtaInstructions(
    authority,
    mintA,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createLiquidatorAtaAInstructions.init);

  const createLiquidatorAtaBInstructions = await getCreateAtaInstructions(
    authority,
    mintB,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createLiquidatorAtaBInstructions.init);

  //
  // Finally add liquidity decrease instruction.
  //

  const ix = await liquidatePositionOrcaInstruction(
    authority,
    tunaPosition,
    vaultA,
    vaultB,
    whirlpool,
    withdrawPercent,
  );
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  instructions.push(...createLiquidatorAtaAInstructions.cleanup);
  instructions.push(...createLiquidatorAtaBInstructions.cleanup);

  return instructions;
}

export async function liquidatePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  withdrawPercent: number,
): Promise<IInstruction> {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const positionMint = tunaPosition.data.positionMint;

  const marketAddress = (await getMarketAddress(whirlpool.address))[0];
  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];
  const orcaOracleAddress = (await getOracleAddress(whirlpool.address))[0];

  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPosition.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const liquidationFeeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const liquidationFeeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const swapTickArrays = await getSwapTickArrayAddresses(whirlpool);

  const lowerTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickLowerIndex);
  const upperTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickUpperIndex);

  const remainingAccounts: IAccountMeta[] = [
    { address: swapTickArrays[0], role: AccountRole.WRITABLE },
    { address: swapTickArrays[1], role: AccountRole.WRITABLE },
    { address: swapTickArrays[2], role: AccountRole.WRITABLE },
    { address: swapTickArrays[3], role: AccountRole.WRITABLE },
    { address: swapTickArrays[4], role: AccountRole.WRITABLE },
    { address: lowerTickArrayAddress, role: AccountRole.WRITABLE },
    { address: upperTickArrayAddress, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpool.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: orcaOracleAddress, role: AccountRole.WRITABLE },
  ];

  const ix = getLiquidatePositionOrcaInstruction({
    market: marketAddress,
    mintA,
    mintB,
    pythOraclePriceFeedA: vaultA.data.pythOraclePriceUpdate,
    pythOraclePriceFeedB: vaultB.data.pythOraclePriceUpdate,
    vaultA: vaultA.address,
    vaultAAta,
    vaultB: vaultB.address,
    vaultBAta,
    authority,
    tunaConfig: tunaConfigAddress,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPosition.address,
    liquidationFeeRecipientAtaA,
    liquidationFeeRecipientAtaB,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    withdrawPercent,
  });

  // @ts-expect-error don't worry about the error
  ix.accounts.push(...remainingAccounts);

  return ix;
}
