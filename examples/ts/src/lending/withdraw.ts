import { getWithdrawInstruction } from "@defituna/client";
import { createSolanaRpc, createSolanaRpcSubscriptions, IInstruction } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  getCloseAccountInstruction,
  getCreateAssociatedTokenInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { configDotenv } from "dotenv";
import { accountExists, isWSolMint } from "src/utils/common";
import { prepareLendingAccountsAndParameters } from "src/utils/lending";
import { createAndSendTransaction } from "src/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);

export async function withdrawLendingPosition(): Promise<void> {
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
   * The withdraw instruction interacts with the Tuna program to withdraw the funds into the lending position.
   * Here we have a choice to pass either funds or shares. For simplicity reasons we will use funds, we also provide
   * an example and detailed explanation on how to calculcate `funds -> shares` and `shares -> funds`.
   */
  const withdrawLendingPoolIx = getWithdrawInstruction({
    authority,
    authorityAta,
    tunaConfig: tunaConfigPda,
    lendingPosition: lendingPositionPda,
    vault: vaultPda,
    vaultAta,
    mint: tokenMintAddress,
    funds: nominalAmount * decimalsScale,
    shares: 0n,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  });

  /**
   * The instructions object contains all the instructions required and optional to withdraw from a `Lending Position`.
   */
  const instructions = {
    withdrawLendingPoolIx,
    createAtaIx: null as IInstruction | null,
    closeWSolAtaIx: null as IInstruction | null,
  };

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
   * If the token mint is WSOL (Wrapped SOL), we need to ensure any remaining SOL is returned to the owner, by closing the ATA.
   */
  if (isWSolMint(tokenMintAddress)) {
    instructions.closeWSolAtaIx = getCloseAccountInstruction({
      account: authorityAta,
      destination: authority.address,
      owner: authority,
    });
  }

  /**
   * The instructions array contains all the instructions required to withdraw from a `Lending Position`.
   * We filter out any null instructions that are not required.
   */
  const instructionsArray: IInstruction[] = [
    instructions.withdrawLendingPoolIx,
    instructions.createAtaIx,
    instructions.closeWSolAtaIx,
  ].filter(ix => ix !== null);

  /**
   * We sign and send the transaction to the network, which will withdraw from the `Lending Position`.
   */
  await createAndSendTransaction(rpc, rpcSubscriptions, authority, instructionsArray);
}

withdrawLendingPosition().catch(console.error);
