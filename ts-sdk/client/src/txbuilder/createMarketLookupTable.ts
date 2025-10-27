import { fetchFusionPool, FP_NFT_UPDATE_AUTH, FUSIONAMM_PROGRAM_ADDRESS } from "@crypticdot/fusionamm-client";
import { fetchWhirlpool, getOracleAddress, Whirlpool, WHIRLPOOL_PROGRAM_ADDRESS } from "@orca-so/whirlpools-client";
import {
  Account,
  Address,
  address,
  GetAccountInfoApi,
  GetMultipleAccountsApi,
  Rpc,
  Slot,
  TransactionSigner,
} from "@solana/kit";
import { fetchAddressLookupTable, getExtendLookupTableInstruction } from "@solana-program/address-lookup-table";
import { MEMO_PROGRAM_ADDRESS } from "@solana-program/memo";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

import { DEFAULT_ADDRESS, WP_NFT_UPDATE_AUTH } from "../consts.ts";
import { fetchAllVault, fetchTunaConfig, MarketMaker } from "../generated";
import { getLendingVaultAddress, getMarketAddress, getTunaConfigAddress } from "../pda.ts";
import { createAddressLookupTableInstructions, CreateAddressLookupTableResult, NATIVE_MINT } from "../utils";

async function getAddressesForMarketLookupTable(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
) {
  const tunaConfigAddress = (await getTunaConfigAddress())[0];
  const marketAddress = (await getMarketAddress(poolAddress))[0];
  const orcaOracleAddress = (await getOracleAddress(poolAddress))[0];
  const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress);

  const pool =
    marketMaker == MarketMaker.Orca ? await fetchWhirlpool(rpc, poolAddress) : await fetchFusionPool(rpc, poolAddress);
  const mintA = await fetchMint(rpc, pool.data.tokenMintA);
  const mintB = await fetchMint(rpc, pool.data.tokenMintB);

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

  const [vaultA, vaultB] = await fetchAllVault(rpc, [
    (await getLendingVaultAddress(mintA.address))[0],
    (await getLendingVaultAddress(mintB.address))[0],
  ]);
  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultA.address,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultB.address,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const addresses: Address[] = [
    SYSTEM_PROGRAM_ADDRESS,
    address("SysvarRent111111111111111111111111111111111"),
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    TOKEN_2022_PROGRAM_ADDRESS,
    NATIVE_MINT,
    MEMO_PROGRAM_ADDRESS,
    tunaConfigAddress,
    marketAddress,
    mintA.address,
    mintB.address,
    vaultA.address,
    vaultB.address,
    vaultAAta,
    vaultBAta,
    poolAddress,
    pool.data.tokenVaultA,
    pool.data.tokenVaultB,
    tunaConfig.data.feeRecipient,
    feeRecipientAtaA,
    feeRecipientAtaB,
  ];

  if (vaultA.data.pythOraclePriceUpdate != DEFAULT_ADDRESS) addresses.push(vaultA.data.pythOraclePriceUpdate);
  if (vaultB.data.pythOraclePriceUpdate != DEFAULT_ADDRESS) addresses.push(vaultB.data.pythOraclePriceUpdate);

  if (marketMaker == MarketMaker.Orca) {
    addresses.push(WHIRLPOOL_PROGRAM_ADDRESS);
    addresses.push(WP_NFT_UPDATE_AUTH);
    addresses.push(orcaOracleAddress);

    const whirlpool = pool as Account<Whirlpool>;
    for (let i = 0; i < whirlpool.data.rewardInfos.length; i++) {
      const rewardInfo = whirlpool.data.rewardInfos[i];
      if (rewardInfo.mint !== DEFAULT_ADDRESS) {
        if (!addresses.includes(rewardInfo.mint)) addresses.push(rewardInfo.mint);
        addresses.push(rewardInfo.vault);
      }
    }
  } else {
    addresses.push(FUSIONAMM_PROGRAM_ADDRESS);
    addresses.push(FP_NFT_UPDATE_AUTH);
  }

  return addresses;
}

export async function createAddressLookupTableForMarketInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
  authority: TransactionSigner,
  recentSlot: Slot,
): Promise<CreateAddressLookupTableResult> {
  const addresses = await getAddressesForMarketLookupTable(rpc, poolAddress, marketMaker);
  return createAddressLookupTableInstructions(authority, addresses, recentSlot);
}

export async function extendAddressLookupTableForMarketInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
  authority: TransactionSigner,
  lookupTableAddress: Address,
): Promise<CreateAddressLookupTableResult> {
  const marketAddresses = await getAddressesForMarketLookupTable(rpc, poolAddress, marketMaker);

  const lookupTable = await fetchAddressLookupTable(rpc, lookupTableAddress);
  const existingAddresses = lookupTable.data.addresses;

  const addresses = marketAddresses.filter(addr => !existingAddresses.includes(addr));

  const extendInstruction = getExtendLookupTableInstruction({
    address: lookupTableAddress,
    addresses,
    authority,
    payer: authority,
  });

  return { instructions: [extendInstruction], lookupTableAddress, addresses };
}
