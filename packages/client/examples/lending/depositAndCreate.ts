import { getCreateLendingPositionInstruction, getDepositInstruction } from "@defituna/client";
import { createSolanaRpc, createSolanaRpcSubscriptions, IInstruction } from "@solana/kit";
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  getCloseAccountInstruction,
  getCreateAssociatedTokenInstructionAsync,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { configDotenv } from "dotenv";
import { CreateAndDepositLendingPositionInstructions } from "examples/types";
import { accountExists, isWSolMint } from "examples/utils/common";
import { prepareLendingAccountsAndParameters } from "examples/utils/lending";
import { createAndSendTransaction } from "examples/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);

/**
 * Deposits into a *Lending Position*, creating the position if it doesn't exist.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function depositAndCreateLendingPosition(): Promise<void> {
  /**
   * Get common accounts and parameters necessary for both `createAndDepositLendingPosition()` and `withdrawLendingPosition()`
   */
  const {
    tokenMintAddress,
    nominalAmount,
    authority,
    tunaConfigPda,
    vaultPda,
    lendingPositionPda,
    authorityAta,
    vaultAta,
    decimalsScale,
  } = await prepareLendingAccountsAndParameters(rpc);

  /**
   * The deposit instruction interacts with the Tuna program to deposit the funds into the lending position.
   */
  const depositLendingIx = getDepositInstruction({
    amount: nominalAmount * decimalsScale,
    authority,
    authorityAta,
    tunaConfig: tunaConfigPda,
    lendingPosition: lendingPositionPda,
    vault: vaultPda,
    vaultAta,
    mint: tokenMintAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  });

  /**
   * The instructions object contains all the instructions required and optional to create and deposit into a `Lending Position`.
   */
  const instructions: CreateAndDepositLendingPositionInstructions = {
    depositLendingIx,
    createLendingPositionIx: null,
    createAtaIx: null,
    wSolAtaIxs: [],
    closeWSolAtaIx: null,
  };

  /**
   * If the `Lending Position` doesn't exist, we need to create it. We rely on the create instruction from the Tuna program.
   */
  if (!(await accountExists(rpc, lendingPositionPda))) {
    instructions.createLendingPositionIx = getCreateLendingPositionInstruction({
      authority,
      tunaConfig: tunaConfigPda,
      vault: vaultPda,
      lendingPosition: lendingPositionPda,
      poolMint: tokenMintAddress,
      systemProgram: SYSTEM_PROGRAM_ADDRESS,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    });
  }

  /**
   * If the *authority ATA* doesn't exist, we need to create it. We rely on the createATA instruction from Solana's Token program.
   * This is specially important when the token mint is WSOL, since we must always create it before transferring to and from it.
   */
  if (!(await accountExists(rpc, authorityAta))) {
    instructions.createAtaIx = await getCreateAssociatedTokenInstructionAsync({
      mint: tokenMintAddress,
      owner: authority.address,
      payer: authority,
    });
  }

  /**
   * If the token mint is WSOL (Wrapped SOL), we need to handle the deposit differently.
   * Because WSOL is essentially SOL wrapped in an SPL Token, we need to transfer the SOL to an ATA,
   * after which we can deposit it into the lending position.
   * We also add a sync instruction to ensure the ATA is up-to-date and the transferred funds are available for deposit.
   * Finally, it's important to close the ATA in case any SOL remains in it, returning it to the owner.
   */
  if (isWSolMint(tokenMintAddress)) {
    instructions.wSolAtaIxs.push(
      getTransferSolInstruction({
        source: authority,
        destination: authorityAta,
        amount: nominalAmount * decimalsScale,
      }),
      getSyncNativeInstruction({
        account: authorityAta,
      }),
    );

    instructions.closeWSolAtaIx = getCloseAccountInstruction({
      account: authorityAta,
      destination: authority.address,
      owner: authority,
    });
  }

  /**
   * The instructions array contains all the instructions required to create and deposit into a `Lending Position`.
   * We filter out any null instructions that are not required.
   */
  const instructionsArray: IInstruction[] = [
    instructions.createAtaIx,
    ...instructions.wSolAtaIxs,
    instructions.createLendingPositionIx,
    instructions.depositLendingIx,
    instructions.closeWSolAtaIx,
  ].filter(ix => ix !== null);

  /**
   * We sign and send the transaction to the network, which will create (if necessary) and deposit into the `Lending Position`.
   */
  await createAndSendTransaction(rpc, rpcSubscriptions, authority, instructionsArray);
}

depositAndCreateLendingPosition().catch(console.error);
