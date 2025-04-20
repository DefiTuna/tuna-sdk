import { type Account, AccountRole, Address, IAccountMeta, IInstruction, TransactionSigner } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getOracleAddress, getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getLiquidatePositionOrcaInstruction,
  getMarketAddress,
  getSwapTickArrayAddresses,
  getTickArrayAddressFromTickIndex,
  TunaConfig,
  TunaPosition,
  Vault,
} from "../index.ts";

export async function liquidatePositionOrcaInstruction(
  authority: TransactionSigner,
  tunaConfig: Account<TunaConfig, Address>,
  tunaPosition: Account<TunaPosition, Address>,
  vaultA: Account<Vault, Address>,
  vaultB: Account<Vault, Address>,
  whirlpool: Account<Whirlpool, Address>,
  withdrawPercent: number,
): Promise<IInstruction> {
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
      owner: tunaConfig.data.liquidatorAuthority,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const liquidationFeeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.liquidatorAuthority,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const aToBTickArrays = await getSwapTickArrayAddresses(whirlpool, true);
  const bToATickArrays = await getSwapTickArrayAddresses(whirlpool, false);
  const lowerTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickLowerIndex);
  const upperTickArrayAddress = await getTickArrayAddressFromTickIndex(whirlpool, tunaPosition.data.tickUpperIndex);

  const remainingAccounts: IAccountMeta[] = [
    { address: aToBTickArrays[0], role: AccountRole.WRITABLE },
    { address: aToBTickArrays[1], role: AccountRole.WRITABLE },
    { address: aToBTickArrays[2], role: AccountRole.WRITABLE },
    { address: bToATickArrays[0], role: AccountRole.WRITABLE },
    { address: bToATickArrays[1], role: AccountRole.WRITABLE },
    { address: bToATickArrays[2], role: AccountRole.WRITABLE },
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
    tunaConfig: tunaConfig.address,
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
