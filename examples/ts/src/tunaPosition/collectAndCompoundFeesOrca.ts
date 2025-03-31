import {
  fetchMarket,
  fetchTunaConfig,
  getCollectAndCompoundFeesOrcaInstruction,
  getLendingVaultAddress,
  getMarketAddress,
  getTunaConfigAddress,
  getTunaPositionAddress,
  Market as _Market,
  Market,
  TunaConfig,
  TunaPosition as _TunaPosition,
  Vault as _Vault,
} from "@defituna/client";
import {
  fetchPosition as fetchOrcaPosition,
  fetchWhirlpool,
  getOracleAddress,
  getPositionAddress as getOrcaPositionAddress,
  Position as _OrcaPosition,
  Tick as _Tick,
  TickArray as _TickArray,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import {
  Account,
  AccountRole,
  Address,
  address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  IAccountMeta,
  IInstruction,
  KeyPairSigner as _KeyPairSigner,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { configDotenv } from "dotenv";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { AtaInstructions } from "src/types";
import { accountExists, getPythOraclePriceFeed, loadKeypair } from "src/utils/common";
import { deriveTickArrayPda, deriveTickArrayPdasForSwap } from "src/utils/orca";
import { createAndSendTransaction, findOrCreateAta } from "src/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);
/**
 * Collects fees from an *Orca Position* and compounds them back into the position via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset compounding settings for this example; these can be adjusted or passed through the function’s input.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position from which to collect and compound fees.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function collectAndCompoundFeesOrca(tunaPositionMint: Address): Promise<void> {
  /**
   * The Program Derived {@link Address Address} of the pool from Orca's Whirlpools to create the position in.
   * For this example we use the SOL/USDC Pool.
   */
  const whirlpoolPda: Address = SOL_USDC_WHIRLPOOL;
  /**
   * The {@link _KeyPairSigner Keypair} signing the transaction and the owner of the {@link _TunaPosition Tuna Position}.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();

  if (!accountExists(rpc, whirlpoolPda)) throw new Error("Whirlpool Account does not exist.");

  /**
   * The Whirlpool Account containing deserialized {@link Whirlpool data},
   * fetched using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}
   */
  const whirlpoolAccount: Account<Whirlpool> = await fetchWhirlpool(rpc, whirlpoolPda);

  /**
   * Program Derived Addresses, fetched from their respective Client (Tuna or Orca);
   */
  /**
   * The {@link TunaConfig Tuna Config} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaConfigPda: Address = (await getTunaConfigAddress())[0];
  /**
   * The {@link _Market Market} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const marketPda: Address = (await getMarketAddress(whirlpoolPda))[0];
  /**
   * The {@link _TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaPositionPda: Address = (await getTunaPositionAddress(tunaPositionMint))[0];
  /**
   * The {@link _OrcaPosition OrcaPosition} Program Derived {@link Address Address}, for the Orca *Whirlpool*,
   * fetched via {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const orcaPositionPda: Address = (await getOrcaPositionAddress(tunaPositionMint))[0];
  /**
   * The {@link _Vault Lending Vault} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const lendingVaultPdaA: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintA))[0];
  /**
   * The {@link _Vault Lending Vault} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const lendingVaultPdaB: Address = (await getLendingVaultAddress(whirlpoolAccount.data.tokenMintB))[0];

  /**
   * The *Tuna Config* Account containing deserialized {@link TunaConfig data}, fetched using Tuna's Client
   */
  const tunaConfigAccount: Account<TunaConfig> = await fetchTunaConfig(rpc, tunaConfigPda);
  /**
   * The *Market* Account containing deserialized {@link Market data}, fetched using Tuna's Client
   */
  const marketAccount: Account<Market> = await fetchMarket(rpc, marketPda);

  /**
   * Defining Associated Token {@link Address Addresses} (*ATAs*) and their instructions, where required.
   */
  /**
   * The Associated Token {@link Address Address} for the new *Position Mint (NFT)*, owned by the {@link _TunaPosition Tuna Position},
   * created with the {@link TOKEN_2022_PROGRAM_ADDRESS Token 2022 Program}.
   */
  const tunaPositionAta: Address = (
    await findAssociatedTokenPda({
      mint: tunaPositionMint,
      owner: tunaPositionPda,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    })
  )[0];

  /**
   * The ATA instructions object containing ATA creation and closure isntructions
   */
  const ataIxs: AtaInstructions = {
    createAtaIxs: [],
    closeWSolAtaIxs: [],
  };

  /**
   * The Associated Token {@link Address Address} for the *Token A*, owned by the {@link _TunaPosition Tuna Position}, acting as an intermediary in the Tuna Smart Contract.
   */
  const tunaPositionAtaA = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintA,
    tunaPositionPda,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the {@link _TunaPosition Tuna Position}, acting as an intermediary in the Tuna Smart Contract.
   */
  const tunaPositionAtaB = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintB,
    tunaPositionPda,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token A*, owned by the *Lending Vault*, for borrowing funds.
   */
  const lendingVaultAtaA = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintA,
    lendingVaultPdaA,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the *Lending Vault*, for borrowing funds.
   */
  const lendingVaultAtaB = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintB,
    lendingVaultPdaB,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token A*, owned by the *Fee Recipient* defined in the {@link TunaConfig Tuna Config} Account,
   * for receiving protocol fees.
   */
  const feeRecipientAtaA = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintA,
    tunaConfigAccount.data.feeRecipient,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the *Fee Recipient* defined in the {@link TunaConfig Tuna Config} Account,
   * for receiving protocol fees.
   */
  const feeRecipientAtaB = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintB,
    tunaConfigAccount.data.feeRecipient,
  );
  /**
   * Wheter to maintain the *leverage multiplier* by borrowing additional *tokens* from Tuna *Lending Vaults* to match the compounded fees.
   * For example, with fees of 0.005 *Token A* and 2.5 *Token B* and a leverage of 2, an equal amount is borrowed to keep the leverage consistent.
   * `true` for opting into keeping the *leverage multiplier* the same, and `false` otherwise.
   */
  const useLeverage = true;

  /**
   * Defining additional accounts and input variables.
   */
  /**
   * The on-chain Pyth Oracle account's {@link Address address} for *Token A*, storing a verified price update from a Pyth price feed.
   * See {@link https://docs.pyth.network/price-feeds PriceFeedsDocs} for more info.
   */
  const pythOraclePriceFeedA = await getPythOraclePriceFeed(rpc, lendingVaultPdaA);
  /**
   * The on-chain Pyth Oracle account's {@link Address address} for *Token B*, storing a verified price update from a Pyth price feed.
   * See {@link https://docs.pyth.network/price-feeds PriceFeedsDocs} for more info.
   */
  const pythOraclePriceFeedB = await getPythOraclePriceFeed(rpc, lendingVaultPdaB);
  /**
   * The {@link WHIRLPOOL_PROGRAM_ADDRESS Whirlpool Program} {@link Address address}
   * for *Whirlpool*-specific operations (opening the {@link _OrcaPosition Orca Position} and adding liquidity).
   */
  const whirlpoolProgram = WHIRLPOOL_PROGRAM_ADDRESS;
  /**
   * The {@link TOKEN_PROGRAM_ADDRESS Token Program} {@link Address address}
   * for handling *token* transfers in the *AddLiquidity* instruction.
   */
  const tokenProgram = TOKEN_PROGRAM_ADDRESS;

  /**
   * The *remainingAccounts* required for *Removing Liquidity* instruction.
   */
  /**
   * The Orca Position Account containing deserialized {@link _OrcaPosition data},
   * fetched using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}
   */
  const orcaPosition = await fetchOrcaPosition(rpc, orcaPositionPda);
  /**
   * The lower {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}’s range, identifying the lowest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Found in the *Orca Position* data.
   */
  const lowerTickIndex = orcaPosition.data.tickLowerIndex;
  /**
   * The upper {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}'s range, identifying the highest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Found in the *Orca Position* data.
   */
  const upperTickIndex = orcaPosition.data.tickUpperIndex;
  /**
   * The {@link _TickArray Tick Array} *Program Derived {@link Address Addresses}* for potential swaps in *CompoundFees*.
   * Required due to price movements from swaps mutating {@link Whirlpool Whirlpool} state, necessitating *Tick Arrays*.
   * Includes three *Tick Arrays* above and three below the current price.
   */
  const tickArrayPdasForSwap = await deriveTickArrayPdasForSwap(whirlpoolAccount.data, whirlpoolPda);
  /**
   * The {@link _TickArray Tick Arrays} in {@link IAccountMeta Account Meta} format for accounts passed via *remainingAccounts*.
   */
  const tickArraysForSwapMeta = tickArrayPdasForSwap.map<IAccountMeta>(tickArrayPda => ({
    address: tickArrayPda,
    role: AccountRole.WRITABLE,
  }));
  /**
   * The {@link _TickArray Tick Array} containing the lower {@link Tick Tick} of the {@link _OrcaPosition Orca Position} range
   */
  const lowerTickArrayPda = await deriveTickArrayPda(whirlpoolAccount.data, whirlpoolPda, lowerTickIndex);
  /**
   * The {@link _TickArray Tick Array} containing the  upper {@link Tick Tick} of the {@link _OrcaPosition Orca Position} range
   */
  const upperTickArrayPda = await deriveTickArrayPda(whirlpoolAccount.data, whirlpoolPda, upperTickIndex);
  /**
   * The Oracle Program Derived {@link Address Address}, for the Orca *Whirlpool*,
   * fetched via {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const oraclePda: Address = (await getOracleAddress(whirlpoolPda))[0];

  /**
   * The remaining accounts for the *CompoundFees* instruction in {@link IAccountMeta Account Meta} format.
   * The order of the accounts must be respected.
   */
  const remainingAccounts: IAccountMeta[] = [
    ...tickArraysForSwapMeta,
    { address: lowerTickArrayPda, role: AccountRole.WRITABLE },
    { address: upperTickArrayPda, role: AccountRole.WRITABLE },
    { address: whirlpoolAccount.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpoolAccount.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: oraclePda, role: AccountRole.WRITABLE },
  ];

  /**
   * Creation of instructions for collecting fees.
   */
  /**
   * The CompoundFeesOrca instruction created via the Tuna Client, handling:
   * - Collecting the fees accrued in the *Whirlpool* through the *Orca Position* and transferring them back into the Position.
   * - Potentially maintaining the *leverage multiplier* the same, by borrowing an equal amount of *Tokens* as the compounded amount, controlled by `useLeverage`.
   */
  const compoundFeesIx = getCollectAndCompoundFeesOrcaInstruction({
    authority: authority,
    tunaConfig: tunaConfigPda,
    market: marketPda,
    whirlpool: whirlpoolPda,
    mintA: whirlpoolAccount.data.tokenMintA,
    mintB: whirlpoolAccount.data.tokenMintB,
    vaultA: lendingVaultPdaA,
    vaultB: lendingVaultPdaB,
    vaultAAta: lendingVaultAtaA,
    vaultBAta: lendingVaultAtaB,
    orcaPosition: orcaPositionPda,
    tunaPosition: tunaPositionPda,
    tunaPositionAta: tunaPositionAta,
    tunaPositionAtaA: tunaPositionAtaA,
    tunaPositionAtaB: tunaPositionAtaB,
    feeRecipientAtaA: feeRecipientAtaA,
    feeRecipientAtaB: feeRecipientAtaB,
    pythOraclePriceFeedA: pythOraclePriceFeedA,
    pythOraclePriceFeedB: pythOraclePriceFeedB,
    whirlpoolProgram: whirlpoolProgram,
    tokenProgram: tokenProgram,
    useLeverage: useLeverage,
  });

  // @ts-expect-error
  compoundFeesIx.accounts.push(...remainingAccounts);

  /**
   * The instructions array in the proper order for collecting fees.
   */
  const instructionsArray: IInstruction[] = [...ataIxs.createAtaIxs, compoundFeesIx, ...ataIxs.closeWSolAtaIxs].filter(
    ix => ix !== null,
  );

  /**
   * Signing and sending the transaction with all the instructions to the Solana network.
   */
  await createAndSendTransaction(
    rpc,
    rpcSubscriptions,
    authority,
    instructionsArray,
    marketAccount.data.addressLookupTable,
  );
}

const tunaPositionMint = process.argv[2];
if (!tunaPositionMint) {
  console.error("Please provide a the address for the tunaPositionMint as an argument.");
  process.exit(1);
}

collectAndCompoundFeesOrca(address(tunaPositionMint)).catch(console.error);
