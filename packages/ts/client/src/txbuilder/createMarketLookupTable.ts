import { address, Address, GetAccountInfoApi, Rpc, Slot, TransactionSigner } from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { createAddressLookupTableInstructions, CreateAddressLookupTableResult, NATIVE_MINT } from "../utils";
import { WP_NFT_UPDATE_AUTH } from "../consts.ts";
import { getLendingVaultAddress, getMarketAddress, getTunaConfigAddress } from "../pda.ts";
import { fetchWhirlpool, getOracleAddress, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import { fetchTunaConfig } from "../generated";

async function getAddressesForMarketLookupTable(rpc: Rpc<GetAccountInfoApi>, poolAddress: Address) {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const orcaOracleAddress = (await getOracleAddress(poolAddress))[0];

  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);
  const whirlpool = await fetchWhirlpool(rpc, poolAddress);
  const mintA = await fetchMint(rpc, whirlpool.data.tokenMintA);
  const mintB = await fetchMint(rpc, whirlpool.data.tokenMintB);

  const feeRecipientAtaA = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const feeRecipientAtaB = (
    await findAssociatedTokenPda({
      owner: tunaConfig.data.feeRecipient,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const vaultAAddress = (await getLendingVaultAddress(mintA.address))[0];
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAddress = (await getLendingVaultAddress(mintB.address))[0];
  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  return [
    SYSTEM_PROGRAM_ADDRESS,
    WHIRLPOOL_PROGRAM_ADDRESS,
    address("SysvarRent111111111111111111111111111111111"),
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    TOKEN_2022_PROGRAM_ADDRESS,
    NATIVE_MINT,
    WP_NFT_UPDATE_AUTH,
    tunaConfigAddress,
    marketAddress,
    mintA.address,
    mintB.address,
    vaultAAddress,
    vaultBAddress,
    vaultAAta,
    vaultBAta,
    poolAddress,
    orcaOracleAddress,
    whirlpool.data.tokenVaultA,
    whirlpool.data.tokenVaultB,
    feeRecipientAtaA,
    feeRecipientAtaB,
  ];
}

export async function createAddressLookupTableForMarketInstructions(
  rpc: Rpc<GetAccountInfoApi>,
  poolAddress: Address,
  authority: TransactionSigner,
  recentSlot: Slot,
): Promise<CreateAddressLookupTableResult> {
  const addresses = await getAddressesForMarketLookupTable(rpc, poolAddress);
  return createAddressLookupTableInstructions(authority, addresses, recentSlot);
}
