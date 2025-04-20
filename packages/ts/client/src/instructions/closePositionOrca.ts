import {
  type Account,
  Address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  IInstruction,
  Rpc,
  TransactionSigner,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { getPositionAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  getClosePositionOrcaInstruction,
  getCreateMaybeAtaInstructions,
  getTunaConfigAddress,
  getTunaPositionAddress,
} from "../index.ts";

export async function closePositionOrcaInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  authority: TransactionSigner,
  positionMint: Address,
  whirlpool: Account<Whirlpool, Address>,
): Promise<IInstruction[]> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;
  const instructions: IInstruction[] = [];

  //
  // Add create user's token account instructions if needed.
  //

  const createUserAtaAInstructions = await getCreateMaybeAtaInstructions(
    rpc,
    authority,
    mintA,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createUserAtaAInstructions.init);

  const createUserAtaBInstructions = await getCreateMaybeAtaInstructions(
    rpc,
    authority,
    mintB,
    authority.address,
    TOKEN_PROGRAM_ADDRESS,
  );
  instructions.push(...createUserAtaBInstructions.init);

  //
  // Add close position instruction.
  //

  const ix = await closePositionOrcaInstruction(authority, positionMint, whirlpool);
  instructions.push(ix);

  //
  // Close WSOL accounts if needed.
  //

  instructions.push(...createUserAtaAInstructions.cleanup);
  instructions.push(...createUserAtaBInstructions.cleanup);

  return instructions;
}

export async function closePositionOrcaInstruction(
  authority: TransactionSigner,
  positionMint: Address,
  whirlpool: Account<Whirlpool, Address>,
): Promise<IInstruction> {
  const mintA = whirlpool.data.tokenMintA;
  const mintB = whirlpool.data.tokenMintB;

  const tunaConfig = (await getTunaConfigAddress())[0];

  const orcaPositionAddress = (await getPositionAddress(positionMint))[0];

  const tunaPositionAddress = (await getTunaPositionAddress(positionMint))[0];
  const tunaPositionAta = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: positionMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaA = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionOwnerAtaB = (
    await findAssociatedTokenPda({
      owner: authority.address,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaA = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintA,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  const tunaPositionAtaB = (
    await findAssociatedTokenPda({
      owner: tunaPositionAddress,
      mint: mintB,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    })
  )[0];

  return getClosePositionOrcaInstruction({
    authority,
    tunaConfig,
    tunaPositionMint: positionMint,
    tunaPositionAta,
    tunaPositionAtaA,
    tunaPositionAtaB,
    tunaPositionOwnerAtaA,
    tunaPositionOwnerAtaB,
    orcaPosition: orcaPositionAddress,
    tunaPosition: tunaPositionAddress,
    whirlpool: whirlpool.address,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
  });
}
