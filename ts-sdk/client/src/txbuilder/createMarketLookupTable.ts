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
  Mint,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

import { DEFAULT_ADDRESS, WP_NFT_UPDATE_AUTH } from "../consts.ts";
import { fetchAllVault, fetchTunaConfig, MarketMaker, TunaConfig } from "../generated";
import { getLendingVaultAddress, getMarketAddress, getTunaConfigAddress, getTunaPriceUpdateAddress } from "../pda.ts";
import { createAddressLookupTableInstructions, CreateAddressLookupTableResult, NATIVE_MINT } from "../utils";

export async function getAddressesForMarketLookupTable(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
  isolatedVaults: boolean,
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
    (await getLendingVaultAddress(mintA.address, isolatedVaults ? marketAddress : undefined))[0],
    (await getLendingVaultAddress(mintB.address, isolatedVaults ? marketAddress : undefined))[0],
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

  const tunaPriceUpdateA = (await getTunaPriceUpdateAddress(mintA.address))[0];
  const tunaPriceUpdateB = (await getTunaPriceUpdateAddress(mintB.address))[0];

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
    tunaPriceUpdateA,
    tunaPriceUpdateB,
  ];

  if (mintA.address != NATIVE_MINT) addresses.push(mintA.address);
  if (mintB.address != NATIVE_MINT) addresses.push(mintB.address);

  if (vaultA.data.oraclePriceUpdate != DEFAULT_ADDRESS && vaultA.data.oraclePriceUpdate != tunaPriceUpdateA) {
    addresses.push(vaultA.data.oraclePriceUpdate);
  }
  if (vaultB.data.oraclePriceUpdate != DEFAULT_ADDRESS && vaultB.data.oraclePriceUpdate != tunaPriceUpdateB) {
    addresses.push(vaultB.data.oraclePriceUpdate);
  }

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

export async function getAddressesForFusionMarketLookupTable(
  fusionPoolAddress: Address,
  fusionPoolTokenVaultA: Address,
  fusionPoolTokenVaultB: Address,
  tunaConfig: Account<TunaConfig>,
  mintA: Account<Mint>,
  mintB: Account<Mint>,
  vaultAAddress: Address,
  vaultBAddress: Address,
  oraclePriceUpdateA = DEFAULT_ADDRESS,
  oraclePriceUpdateB = DEFAULT_ADDRESS,
) {
  const marketAddress = (await getMarketAddress(fusionPoolAddress))[0];

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

  const vaultAAta = (
    await findAssociatedTokenPda({
      owner: vaultAAddress,
      mint: mintA.address,
      tokenProgram: mintA.programAddress,
    })
  )[0];

  const vaultBAta = (
    await findAssociatedTokenPda({
      owner: vaultBAddress,
      mint: mintB.address,
      tokenProgram: mintB.programAddress,
    })
  )[0];

  const tunaPriceUpdateA = (await getTunaPriceUpdateAddress(mintA.address))[0];
  const tunaPriceUpdateB = (await getTunaPriceUpdateAddress(mintB.address))[0];

  const addresses: Address[] = [
    SYSTEM_PROGRAM_ADDRESS,
    address("SysvarRent111111111111111111111111111111111"),
    ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    TOKEN_PROGRAM_ADDRESS,
    TOKEN_2022_PROGRAM_ADDRESS,
    NATIVE_MINT,
    MEMO_PROGRAM_ADDRESS,
    tunaConfig.address,
    marketAddress,
    vaultAAddress,
    vaultBAddress,
    vaultAAta,
    vaultBAta,
    fusionPoolAddress,
    fusionPoolTokenVaultA,
    fusionPoolTokenVaultB,
    tunaConfig.data.feeRecipient,
    feeRecipientAtaA,
    feeRecipientAtaB,
    tunaPriceUpdateA,
    tunaPriceUpdateB,
    FUSIONAMM_PROGRAM_ADDRESS,
    FP_NFT_UPDATE_AUTH,
  ];

  if (mintA.address != NATIVE_MINT) addresses.push(mintA.address);
  if (mintB.address != NATIVE_MINT) addresses.push(mintB.address);

  if (oraclePriceUpdateA != DEFAULT_ADDRESS && oraclePriceUpdateA != tunaPriceUpdateA) {
    addresses.push(oraclePriceUpdateA);
  }

  if (oraclePriceUpdateB != DEFAULT_ADDRESS && oraclePriceUpdateB != tunaPriceUpdateB) {
    addresses.push(oraclePriceUpdateB);
  }

  return addresses;
}

export async function createAddressLookupTableForMarketInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
  isolatedVaults: boolean,
  authority: TransactionSigner,
  recentSlot: Slot,
): Promise<CreateAddressLookupTableResult> {
  const addresses = await getAddressesForMarketLookupTable(rpc, poolAddress, marketMaker, isolatedVaults);
  return createAddressLookupTableInstructions(authority, addresses, recentSlot);
}

export async function extendAddressLookupTableForMarketInstructions(
  rpc: Rpc<GetAccountInfoApi & GetMultipleAccountsApi>,
  poolAddress: Address,
  marketMaker: MarketMaker,
  isolatedVaults: boolean,
  authority: TransactionSigner,
  lookupTableAddress: Address,
): Promise<CreateAddressLookupTableResult> {
  const marketAddresses = await getAddressesForMarketLookupTable(rpc, poolAddress, marketMaker, isolatedVaults);

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
