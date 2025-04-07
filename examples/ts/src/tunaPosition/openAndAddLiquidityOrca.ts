import {
  fetchMarket,
  fetchTunaConfig,
  getAddLiquidityOrcaInstruction,
  getLendingVaultAddress,
  getMarketAddress,
  getOpenPositionOrcaInstruction,
  getTunaConfigAddress,
  getTunaPositionAddress,
  Market,
  NO_STOP_LOSS as _NO_STOP_LOSS,
  NO_TAKE_PROFIT,
  TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD as _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD,
  TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE as _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE,
  TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A as _TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A,
  TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B,
  TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A as _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A,
  TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B as _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B,
  TunaConfig,
  TunaPosition as _TunaPosition,
  Vault as _Vault,
  WP_NFT_UPDATE_AUTH,
} from "@defituna/client";
import {
  fetchWhirlpool,
  getOracleAddress,
  getPositionAddress as getOrcaPositionAddress,
  Position as _OrcaPosition,
  Tick as _Tick,
  TickArray as _TickArray,
  Whirlpool,
  WHIRLPOOL_PROGRAM_ADDRESS,
} from "@orca-so/whirlpools-client";
import { sqrtPriceToPrice } from "@orca-so/whirlpools-core";
import {
  Account,
  AccountRole,
  Address,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  generateKeyPairSigner,
  IAccountMeta,
  IInstruction,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { TOKEN_2022_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { configDotenv } from "dotenv";
import { SOL_USDC_WHIRLPOOL } from "src/constants";
import { AtaInstructions } from "src/types";
import { accountExists, getMintDecimals, getPythOraclePriceFeed, loadKeypair } from "src/utils/common";
import { deriveTickArrayPda, deriveTickArrayPdasForSwap } from "src/utils/orca";
import { createAndSendTransaction, findOrCreateAta, findOrCreateAtaWithAuth } from "src/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);

/**
 * Opens a position in an Orca *Liquidity Pool* and adds liquidity using borrowed funds from Tuna *Lending Pools*.
 * Uses the SOL/USDC *Whirlpool* with preset amounts and leverage for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and adding liquidity, though these actions can be performed separately and liquidity can be added multiple times later.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function openPositionAndAddLiquidity(): Promise<void> {
  /** Defining variables required to open an Orca *Position* and add liquidity with borrowed funds from Tuna's *Lending Pools*. */
  /**
   * The nominal amounts of *Token A* (SOL in this example) and *Token B* (USDC in this example) to deposit for liquidity,
   * as a flat value (e.g., 1 SOL) excluding decimals.
   */
  const nominalCollateral = { a: 0.01, b: 0.1 };
  /**
   * Multiplier for borrowed funds applied to the total provided amount (min 1, max 5; e.g., 2 doubles the borrowed amount).
   */
  const leverage = 2;
  /**
   * Ratio for borrowing funds, freely chosen by the user, unbound by the *position*’s liquidity range.
   */
  const borrowRatio = { a: 0.6, b: 0.4 };

  /**
   * The Program Derived {@link Address Address} of the pool from Orca's Whirlpools to create the position in.
   * For this example we use the SOL/USDC Pool.
   */
  const whirlpoolPda: Address = SOL_USDC_WHIRLPOOL;

  /**
   * The {@link KeyPairSigner Keypair} signing the transaction and the owner of the {@link _TunaPosition Tuna Position}.
   * This is defaulted to the Solana config keypair (~/.config/solana/id.json).
   */
  const authority = await loadKeypair();
  /**
   * A newly generated {@link KeyPairSigner Keypair} for the new *Position Mint*, which will be
   * created with the position and it's used to identify it.
   */
  const newPositionMintKeypair = await generateKeyPairSigner();

  if (!accountExists(rpc, whirlpoolPda)) throw new Error("Whirlpool Account does not exist.");

  /**
   * The Whirlpool Account containing deserialized {@link Whirlpool data},
   * fetched using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}
   */
  const whirlpoolAccount: Account<Whirlpool> = await fetchWhirlpool(rpc, whirlpoolPda);

  /**
   * Deriving collateral and borrow amounts for adding liquidity
   */
  /**
   * Fetches token decimals for Tokens A and B, using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const decimals = {
    a: await getMintDecimals(rpc, whirlpoolAccount.data.tokenMintA),
    b: await getMintDecimals(rpc, whirlpoolAccount.data.tokenMintB),
  };
  /**
   * The decimal scale to adjust nominal amounts for Tokens A and B based on their decimals.
   */
  const decimalsScale = {
    a: Math.pow(10, decimals.a),
    b: Math.pow(10, decimals.b),
  };
  /**
   * The collateral amounts of tokens A and B (adjusted for decimals) provided by the user to use for increasing liquidity.
   */
  const collateral = {
    a: nominalCollateral.a * decimalsScale.a,
    b: nominalCollateral.b * decimalsScale.b,
  };

  /**
   * The current *Whirlpool* price, derived from the sqrtPrice using {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const currentPrice = sqrtPriceToPrice(whirlpoolAccount.data.sqrtPrice, decimals.a, decimals.b);
  /**
   * The total nominal collateral amount (excluding decimals) represented in *Token B* units.
   */
  const totalNominalCollateralAmount = nominalCollateral.a * currentPrice + nominalCollateral.b;
  /**
   * Safety checks
   */
  if (borrowRatio.a < 0 || borrowRatio.b < 0) throw new Error("Borrow ratios must be greater than or equal to 0");
  if (borrowRatio.a + borrowRatio.b !== 1) throw new Error("Borrow ratios must be balanced (sum equal to 1)");
  if (leverage < 1) throw new Error("Leverage must be greater than or equal to 1");

  /**
   * The nominal amounts of Tokens A and B to borrow from Tuna's *Lending Pools*,
   * as a flat value (e.g., 1 SOL) excluding decimals.
   */
  const nominalBorrow = {
    a: (totalNominalCollateralAmount * (leverage - 1) * borrowRatio.a) / currentPrice,
    b: totalNominalCollateralAmount * (leverage - 1) * borrowRatio.b,
  };
  /**
   * The amounts of tokens A and B (adjusted for decimals) borrowed from Tuna's *Lending Pools* to use for increasing liquidity.
   */
  const borrow = {
    a: nominalBorrow.a * decimalsScale.a,
    b: nominalBorrow.b * decimalsScale.b,
  };

  /**
   * Program Derived Addresses, fetched from their respective Client (Tuna or Orca);
   */
  /**
   * The {@link TunaConfig Tuna Config} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaConfigPda: Address = (await getTunaConfigAddress())[0];
  /**
   * The {@link Market Market} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const marketPda: Address = (await getMarketAddress(whirlpoolPda))[0];
  /**
   * The {@link _TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaPositionPda: Address = (await getTunaPositionAddress(newPositionMintKeypair.address))[0];
  /**
   * The {@link _OrcaPosition OrcaPosition} Program Derived {@link Address Address}, for the Orca *Whirlpool*,
   * fetched via {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const orcaPositionPda: Address = (await getOrcaPositionAddress(newPositionMintKeypair.address))[0];
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
      mint: newPositionMintKeypair.address,
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
   * The Associated Token {@link Address Address} for the *Token A*, owned by the authority (user), using a function handling *WSOL* cases.
   */
  const authorityAtaA = await findOrCreateAtaWithAuth(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintA,
    collateral.a,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the authority (user), using a function handling *WSOL* cases.
   */
  const authorityAtaB = await findOrCreateAtaWithAuth(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintB,
    collateral.b,
  );
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
   * The {@link WP_NFT_UPDATE_AUTH Metadata Update Authority} constant {@link Address address} defined by Orca’s *Whirlpool* smart contract.
   * Note: This value is fixed by Orca and not determined by the Tuna Client.
   */
  const metadataUpdateAuth = WP_NFT_UPDATE_AUTH;
  /**
   * The {@link ASSOCIATED_TOKEN_PROGRAM_ADDRESS Associated Token Program} {@link Address address}
   * for *Associated Token* Account creation and closure.
   */
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ADDRESS;
  /**
   * The {@link TOKEN_2022_PROGRAM_ADDRESS Token 2022 Program} {@link Address address}
   * for handling minting the *Position Token* in the AddLiquidity instruction.
   */
  const token2022Program = TOKEN_2022_PROGRAM_ADDRESS;
  /**
   * The {@link WHIRLPOOL_PROGRAM_ADDRESS Whirlpool Program} {@link Address address}
   * for *Whirlpool*-specific operations (opening the {@link _OrcaPosition Orca Position} and adding liquidity).
   */
  const whirlpoolProgram = WHIRLPOOL_PROGRAM_ADDRESS;
  /**
   * The {@link SYSTEM_PROGRAM_ADDRESS System Program} {@link Address address}, required for account initialization.
   */
  const systemProgram = SYSTEM_PROGRAM_ADDRESS;
  /**
   * The {@link TOKEN_PROGRAM_ADDRESS Token Program} {@link Address address}
   * for handling *token* transfers in the *AddLiquidity* instruction.
   */
  const tokenProgram = TOKEN_PROGRAM_ADDRESS;

  /**
   * The lower {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}’s range, identifying the lowest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickLowerIndex = -20748;
  /**
   * The upper {@link _Tick Tick} index for the {@link _OrcaPosition Orca Position}'s range, identifying the highest Tick at which the Position is active in the {@link Whirlpool Whirlpool}.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickUpperIndex = -20148;

  /**
   * The {@link _Tick Tick} index for an optional *Stop-Loss* limit order below the {@link _OrcaPosition Orca Position}’s range in the {@link Whirlpool Whirlpool}.
   * Use {@link _NO_STOP_LOSS NO_STOP_LOSS} (lowest viable index) to disable *Stop-Loss*.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickStopLossIndex = -20748;
  /**
   * The {@link _Tick Tick} index for an optional *Take-Profit* limit order above the {@link _OrcaPosition Orca Position}’s range in the {@link Whirlpool Whirlpool}.
   * Use {@link NO_TAKE_PROFIT NO_TAKE_PROFIT} (highest viable index) to disable *Take-Profit*.
   * Note: Must be divisible by the {@link Whirlpool Whirlpool}'s `tickSpacing`.
   */
  const tickTakeProfitIndex = NO_TAKE_PROFIT;

  /**
   * Minimum added amounts for Tokens A and B to be respected by the *AddLiquidity* instruction, acting as slippage limits.
   */
  const minAddedAmount = { a: 0n, b: 0n };
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price`, in case of inner swaps due to rebalancing of deposit ratio.
   */
  const maxSwapSlippage = 0;

  /**
   * The {@link _TunaPosition Tuna Position} option controlling token swaps on stop-loss, represented in bits 0-1.
   * - `00` (0) - No swap
   * - `01` (1) - Swaps to *Token A* (use {@link _TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_A})
   * - `10` (2) - Swaps to *Token B* (use {@link TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B})
   */
  const stopLossSwapToToken = TUNA_POSITION_FLAGS_STOP_LOSS_SWAP_TO_TOKEN_B;
  /**
   * The {@link _TunaPosition Tuna Position} option controlling token swaps on take-profit, represented in bits 2-3.
   * - `00` (0) - No swap
   * - `01` (4) - Swaps to *Token A* (use {@link _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_A})
   * - `10` (8) - Swaps to *Token B* (use {@link _TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B TUNA_POSITION_FLAGS_TAKE_PROFIT_SWAP_TO_TOKEN_B})
   */
  const takeProfitSwapToToken = 0;
  /**
   * The {@link _TunaPosition Tuna Position} option controlling auto-compounding behavior, represented in bits 4-5.
   * - `00` (0) - No auto compounding
   * - `01` (16) - Auto-compounds yield (use {@link _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD})
   * - `10` (32) - Auto-compounds yield with leverage (use {@link _TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE TUNA_POSITION_FLAGS_AUTO_COMPOUND_YIELD_WITH_LEVERAGE})
   */
  const autoCompoundYield = 0;

  /**
   * The 6-bit mapping of the {@link _TunaPosition Tuna Position} options, combining stop-loss swap, take-profit swap, and auto-compounding settings.
   * In this, selecting only "Swaps to Token B on Stop-Loss" results in 0b000010 (decimal 2).
   * For no options selected, set each to `0` or use `flags = 0`.
   * Bit positions (each field supports one value: `00`, `01`, or `10`):
   * Bits 0..1: Stop-loss swap (e.g., 0, 1, 2)
   * Bits 2..3: Take-profit swap (e.g., 0, 4, 8)
   * Bits 4..5: Auto-compounding (e.g., 0, 16, 32)
   * Computed by bitwise OR-ing the options: `stopLossSwapToToken | takeProfitSwapToToken | autoCompoundYield`.
   */
  const flags = stopLossSwapToToken | takeProfitSwapToToken | autoCompoundYield;

  /**
   * The *remainingAccounts* required for *Adding Liquidity* instruction.
   */
  /**
   * The {@link _TickArray Tick Array} *Program Derived {@link Address Addresses}* for potential swaps in *Add Liquidity*.
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
  const tickLowerArrayPda = await deriveTickArrayPda(whirlpoolAccount.data, whirlpoolPda, tickLowerIndex);
  /**
   * The {@link _TickArray Tick Array} containing the  upper {@link Tick Tick} of the {@link _OrcaPosition Orca Position} range
   */
  const tickUpperArrayPda = await deriveTickArrayPda(whirlpoolAccount.data, whirlpoolPda, tickUpperIndex);
  /**
   * The Oracle Program Derived {@link Address Address}, for the Orca *Whirlpool*,
   * fetched via {@link https://github.com/orca-so/whirlpools/tree/main/ts-sdk/client Orca's Whirlpool Client}.
   */
  const oraclePda: Address = (await getOracleAddress(whirlpoolPda))[0];

  /**
   * The remaining accounts for the *AddLiquidity* instruction in {@link IAccountMeta Account Meta} format.
   * The order of the accounts must be respected.
   */
  const remainingAccounts: IAccountMeta[] = [
    ...tickArraysForSwapMeta,
    { address: tickLowerArrayPda, role: AccountRole.WRITABLE },
    { address: tickUpperArrayPda, role: AccountRole.WRITABLE },
    { address: whirlpoolAccount.data.tokenVaultA, role: AccountRole.WRITABLE },
    { address: whirlpoolAccount.data.tokenVaultB, role: AccountRole.WRITABLE },
    { address: oraclePda, role: AccountRole.WRITABLE },
  ];

  /**
   * Creation of instructions for Position Accounts creation and adding liquidity.
   */
  /**
   * The OpenPositionOrca instruction created via the Tuna Client, handling:
   * - Creation of the {@link _TunaPosition Tuna Position} account with its settings in the Tuna smart contract.
   * - Creation of the {@link _OrcaPosition Orca Position} account with its settings via CPI to the Whirlpools smart contract.
   * - Minting of the *Position Mint NFT*.
   */
  const openPositionOrcaIx = getOpenPositionOrcaInstruction({
    authority: authority,
    whirlpool: whirlpoolPda,
    market: marketPda,
    tunaPosition: tunaPositionPda,
    orcaPosition: orcaPositionPda,
    tunaPositionAta: tunaPositionAta,
    tunaPositionMint: newPositionMintKeypair,
    tickLowerIndex: tickLowerIndex,
    tickUpperIndex: tickUpperIndex,
    tickStopLossIndex: tickStopLossIndex,
    tickTakeProfitIndex: tickTakeProfitIndex,
    metadataUpdateAuth: metadataUpdateAuth,
    associatedTokenProgram: associatedTokenProgram,
    token2022Program: token2022Program,
    whirlpoolProgram: whirlpoolProgram,
    systemProgram: systemProgram,
    flags: flags,
  });

  /**
   * The AddLiquidityOrca instruction created via the Tuna Client, handling:
   * - Potential borrowing of funds from *Tuna* {@link _Vault Lending Vaults} ATAs.
   * - Potential swap of tokens if deposit ratio is different from the {@link _OrcaPosition Position's} range-to-price ratio.
   * - Depositing *tokens* to the *Whirlpool*s vaults to increase the {@link _OrcaPosition Position's} liquidity.
   */
  const addLiquidityOrcaIx = getAddLiquidityOrcaInstruction({
    authority: authority,
    tunaConfig: tunaConfigPda,
    whirlpool: whirlpoolPda,
    market: marketPda,
    mintA: whirlpoolAccount.data.tokenMintA,
    mintB: whirlpoolAccount.data.tokenMintB,
    vaultA: lendingVaultPdaA,
    vaultB: lendingVaultPdaB,
    vaultAAta: lendingVaultAtaA,
    vaultBAta: lendingVaultAtaB,
    orcaPosition: orcaPositionPda,
    tunaPositionAta: tunaPositionAta,
    tunaPosition: tunaPositionPda,
    tunaPositionOwnerAtaA: authorityAtaA,
    tunaPositionOwnerAtaB: authorityAtaB,
    tunaPositionAtaA: tunaPositionAtaA,
    tunaPositionAtaB: tunaPositionAtaB,
    feeRecipientAtaA: feeRecipientAtaA,
    feeRecipientAtaB: feeRecipientAtaB,
    collateralA: Math.floor(collateral.a),
    collateralB: Math.floor(collateral.b),
    borrowA: Math.floor(borrow.a),
    borrowB: Math.floor(borrow.b),
    minAddedAmountA: minAddedAmount.a,
    minAddedAmountB: minAddedAmount.b,
    maxSwapSlippage: maxSwapSlippage,
    pythOraclePriceFeedA: pythOraclePriceFeedA,
    pythOraclePriceFeedB: pythOraclePriceFeedB,
    whirlpoolProgram: whirlpoolProgram,
    tokenProgram: tokenProgram,
  });

  /**
   * Adding the *remainingAccounts* to the *AddLiquidityOrca* instruction’s accounts array.
   * This is the proper method for passing remaining accounts to an instruction.
   */
  // @ts-expect-error
  addLiquidityOrcaIx.accounts.push(...remainingAccounts);

  /**
   * The instructions array in the proper order for opening positions and adding liquidity.
   */
  const instructionsArray: IInstruction[] = [
    ...ataIxs.createAtaIxs,
    openPositionOrcaIx,
    addLiquidityOrcaIx,
    ...ataIxs.closeWSolAtaIxs,
  ].filter(ix => ix !== null);

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

openPositionAndAddLiquidity().catch(console.error);
