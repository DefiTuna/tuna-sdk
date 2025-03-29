import {
  fetchMarket,
  fetchTunaPosition,
  getClosePositionOrcaInstruction,
  getLendingVaultAddress,
  getMarketAddress,
  getRemoveLiquidityOrcaInstruction,
  getTunaConfigAddress,
  getTunaPositionAddress,
  Market as _Market,
  Market,
  TunaConfig as _TunaConfig,
  TunaPosition,
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
import { SOL_USDC_WHIRLPOOL } from "examples/constants";
import { AtaInstructions } from "examples/types";
import { accountExists, getPythOraclePriceFeed, loadKeypair } from "examples/utils/common";
import { deriveTickArrayPda, deriveTickArrayPdasForSwap } from "examples/utils/orca";
import { createAndSendTransaction, findOrCreateAta, findOrCreateAtaWithAuth } from "examples/utils/solana";

configDotenv({ path: "./.env" });

const RPC_URL = process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
const WSS_URL = process.env.WSS_URL || "wss://api.mainnet-beta.solana.com/";

const rpc = createSolanaRpc(RPC_URL);
const rpcSubscriptions = createSolanaRpcSubscriptions(WSS_URL);

/**
 * Removes liquidity from a position in an Orca *Liquidity Pool* and closes it, managing funds via Tuna's smart contract.
 * Uses the SOL/USDC *Whirlpool* with preset withdrawal amounts and swap options for this example; these can be adjusted or passed through the function’s input.
 * Note: Combines opening and removing liquidity, though these actions can be performed separately, and liquidity can be removed multiple times
 * based on the available liquidity in the *Orca Position*.
 * @param tunaPositionMint - The {@link Address address} of the *Tuna Position Mint* identifying the position to manage.
 * @returns {Promise<void>} A promise that resolves when the transaction is confirmed.
 * @throws {Error} If the transaction fails to send or confirm.
 */
export async function orcaRemoveLiquidityAndClose(tunaPositionMint: Address): Promise<void> {
  /**
   * The Program Derived {@link Address Address} of the pool from Orca's Whirlpools to create the position in.
   * For this example we use the SOL/USDC Pool.
   */
  const whirlpoolPda: Address = SOL_USDC_WHIRLPOOL;
  /**
   * The {@link _KeyPairSigner Keypair} signing the transaction and the owner of the {@link TunaPosition Tuna Position}.
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
   * The {@link _TunaConfig Tuna Config} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const tunaConfigPda: Address = (await getTunaConfigAddress())[0];
  /**
   * The {@link _Market Market} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
   */
  const marketPda: Address = (await getMarketAddress(whirlpoolPda))[0];
  /**
   * The {@link TunaPosition TunaPosition} Program Derived {@link Address Address} for Tuna operations, fetched from the Tuna Client.
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
   * The *Market* Account containing deserialized {@link Market data}, fetched using Tuna's Client
   */
  const marketAccount: Account<Market> = await fetchMarket(rpc, marketPda);

  /**
   * Defining Associated Token {@link Address Addresses} (*ATAs*) and their instructions, where required.
   */
  /**
   * The Associated Token {@link Address Address} for the new *Position Mint (NFT)*, owned by the {@link TunaPosition Tuna Position},
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
   * The Associated Token {@link Address Address} for the *Token A*, owned by the authority (user), using a function handling *WSOL* cases.
   */
  const authorityAtaA = await findOrCreateAtaWithAuth(rpc, ataIxs, authority, whirlpoolAccount.data.tokenMintA);
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the authority (user), using a function handling *WSOL* cases.
   */
  const authorityAtaB = await findOrCreateAtaWithAuth(rpc, ataIxs, authority, whirlpoolAccount.data.tokenMintB);
  /**
   * The Associated Token {@link Address Address} for the *Token A*, owned by the {@link TunaPosition Tuna Position}, acting as an intermediary in the Tuna Smart Contract.
   */
  const tunaPositionAtaA = await findOrCreateAta(
    rpc,
    ataIxs,
    authority,
    whirlpoolAccount.data.tokenMintA,
    tunaPositionPda,
  );
  /**
   * The Associated Token {@link Address Address} for the *Token B*, owned by the {@link TunaPosition Tuna Position}, acting as an intermediary in the Tuna Smart Contract.
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
   * for handling *token* transfers in the *RemoveLiquidity* instruction.
   */
  const tokenProgram = TOKEN_PROGRAM_ADDRESS;

  /**
   * Minimum removed amounts for Tokens A and B to be respected by the *RemoveLiquidity* instruction, acting as slippage limits.
   */
  const minRemovedAmount = { a: 0n, b: 0n };
  /**
   * The total amount of slippage allowed on the {@link Whirlpool Whirlpool}'s `price` during potential inner swaps due to deposit ratio rebalancing.
   */
  const maxSwapSlippage = 0;
  /**
   * The option for whether to swap and which *token* to swap to during *RemoveLiquidity*.
   * - 0 - No swap
   * - 1 - Swaps to *Token A*
   * - 2 - Swaps to *Token B*
   */
  const swapToToken = 1;
  /**
   * The percentage of *liquidity* in the *Orca Position* to remove via the *RemoveLiquidity* instruction.
   * Ranges from 0 (0%) to 1000000 (100%), where each increment of 1 equals 0.0001% (e.g., 250000 = 25%, 5000 = 0.5%, 100000 = 10%).
   * For this example since closing the Position after, set to 1000000 (100%) to remove all *liquidity*.
   */
  const withdrawPercent = 1000000;
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
   * The {@link _TickArray Tick Array} *Program Derived {@link Address Addresses}* for potential swaps in *RemoveLiquidity*.
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
   * The *Tuna Position* Account containing deserialized {@link TunaPosition data}, fetched using Tuna's Client
   */
  const tunaPositionAccount: Account<TunaPosition> = await fetchTunaPosition(rpc, tunaPositionPda);

  let removeLiquidityOrcaIx: IInstruction | undefined = undefined;

  if (tunaPositionAccount.data.state === 0) {
    /**
     * The remaining accounts for the *RemoveLiquidity* instruction in {@link IAccountMeta Account Meta} format.
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
     * Creation of instructions for removing liquidity and closing positions.
     */
    /**
     * The RemoveLiquidityOrca instruction created via the Tuna Client, handling:
     * - Withdraws *tokens* from the *Whirlpool*s vaults to decrease the {@link _OrcaPosition Position's} liquidity.
     * - Repays any potential borrowed funds from *Tuna* {@link _Vault Lending Vaults}s ATAs, proportionally to the withdraw percentage.
     * - Potential swap of tokens if user opts for it, in order to receive all in one token.
     */
    removeLiquidityOrcaIx = getRemoveLiquidityOrcaInstruction({
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
      swapToToken: swapToToken,
      withdrawPercent: withdrawPercent,
      minRemovedAmountA: minRemovedAmount.a,
      minRemovedAmountB: minRemovedAmount.b,
      maxSwapSlippage: maxSwapSlippage,
      pythOraclePriceFeedA: pythOraclePriceFeedA,
      pythOraclePriceFeedB: pythOraclePriceFeedB,
      whirlpoolProgram: whirlpoolProgram,
      tokenProgram: tokenProgram,
    });

    // @ts-expect-error
    removeLiquidityOrcaIx.accounts.push(...remainingAccounts);
  }

  /**
   * The ClosePositionOrca instruction created via the Tuna Client, handling:
   * - Closing the {@link TunaPosition Tuna Position} account in the Tuna smart contract.
   * - Closing the {@link _OrcaPosition Orca Position} account via CPI to the Whirlpools smart contract.
   * - Closing Tuna Position ATA accounts and burning of the *Position Mint NFT*.
   */
  const closePositionOrcaTx = getClosePositionOrcaInstruction({
    authority: authority,
    tunaConfig: tunaConfigPda,
    whirlpool: whirlpoolPda,
    tunaPosition: tunaPositionPda,
    orcaPosition: orcaPositionPda,
    tunaPositionMint: tunaPositionMint,
    tunaPositionAta: tunaPositionAta,
    tunaPositionAtaA: tunaPositionAtaA,
    tunaPositionAtaB: tunaPositionAtaB,
    whirlpoolProgram: WHIRLPOOL_PROGRAM_ADDRESS,
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS,
    tunaPositionOwnerAtaA: authorityAtaA,
    tunaPositionOwnerAtaB: authorityAtaB,
  });

  /**
   * The instructions array in the proper order for opening positions and adding liquidity.
   */
  const instructionsArray: IInstruction[] = [
    ...ataIxs.createAtaIxs,
    removeLiquidityOrcaIx,
    closePositionOrcaTx,
    ...ataIxs.closeWSolAtaIxs,
  ].filter(ix => ix !== null && ix !== undefined);

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

orcaRemoveLiquidityAndClose(address(tunaPositionMint)).catch(console.error);
