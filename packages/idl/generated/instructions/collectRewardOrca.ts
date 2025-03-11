/**
 * This code was AUTOGENERATED using the codama library.
 * Please DO NOT EDIT THIS FILE, instead use visitors
 * to add features, then rerun codama to update it.
 *
 * @see https://github.com/codama-idl/codama
 */

import {
  combineCodec,
  fixDecoderSize,
  fixEncoderSize,
  getBytesDecoder,
  getBytesEncoder,
  getStructDecoder,
  getStructEncoder,
  getU8Decoder,
  getU8Encoder,
  transformEncoder,
  type Address,
  type Codec,
  type Decoder,
  type Encoder,
  type IAccountMeta,
  type IAccountSignerMeta,
  type IInstruction,
  type IInstructionWithAccounts,
  type IInstructionWithData,
  type ReadonlyAccount,
  type ReadonlyUint8Array,
  type TransactionSigner,
  type WritableAccount,
  type WritableSignerAccount,
} from "@solana/kit";
import { TUNA_PROGRAM_ADDRESS } from "../programs";
import { getAccountMetaFactory, type ResolvedAccount } from "../shared";

export const COLLECT_REWARD_ORCA_DISCRIMINATOR = new Uint8Array([
  99, 253, 84, 63, 250, 243, 165, 191,
]);

export function getCollectRewardOrcaDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(
    COLLECT_REWARD_ORCA_DISCRIMINATOR,
  );
}

export type CollectRewardOrcaInstruction<
  TProgram extends string = typeof TUNA_PROGRAM_ADDRESS,
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TAccountTunaConfig extends string | IAccountMeta<string> = string,
  TAccountTunaPosition extends string | IAccountMeta<string> = string,
  TAccountTunaPositionAta extends string | IAccountMeta<string> = string,
  TAccountWhirlpoolProgram extends string | IAccountMeta<string> = string,
  TAccountWhirlpool extends string | IAccountMeta<string> = string,
  TAccountOrcaPosition extends string | IAccountMeta<string> = string,
  TAccountRewardVault extends string | IAccountMeta<string> = string,
  TAccountTickArrayLower extends string | IAccountMeta<string> = string,
  TAccountTickArrayUpper extends string | IAccountMeta<string> = string,
  TAccountRewardOwnerAta extends string | IAccountMeta<string> = string,
  TAccountTokenProgram extends
    | string
    | IAccountMeta<string> = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  TRemainingAccounts extends readonly IAccountMeta<string>[] = [],
> = IInstruction<TProgram> &
  IInstructionWithData<Uint8Array> &
  IInstructionWithAccounts<
    [
      TAccountAuthority extends string
        ? WritableSignerAccount<TAccountAuthority> &
            IAccountSignerMeta<TAccountAuthority>
        : TAccountAuthority,
      TAccountTunaConfig extends string
        ? ReadonlyAccount<TAccountTunaConfig>
        : TAccountTunaConfig,
      TAccountTunaPosition extends string
        ? WritableAccount<TAccountTunaPosition>
        : TAccountTunaPosition,
      TAccountTunaPositionAta extends string
        ? ReadonlyAccount<TAccountTunaPositionAta>
        : TAccountTunaPositionAta,
      TAccountWhirlpoolProgram extends string
        ? ReadonlyAccount<TAccountWhirlpoolProgram>
        : TAccountWhirlpoolProgram,
      TAccountWhirlpool extends string
        ? ReadonlyAccount<TAccountWhirlpool>
        : TAccountWhirlpool,
      TAccountOrcaPosition extends string
        ? WritableAccount<TAccountOrcaPosition>
        : TAccountOrcaPosition,
      TAccountRewardVault extends string
        ? WritableAccount<TAccountRewardVault>
        : TAccountRewardVault,
      TAccountTickArrayLower extends string
        ? WritableAccount<TAccountTickArrayLower>
        : TAccountTickArrayLower,
      TAccountTickArrayUpper extends string
        ? WritableAccount<TAccountTickArrayUpper>
        : TAccountTickArrayUpper,
      TAccountRewardOwnerAta extends string
        ? WritableAccount<TAccountRewardOwnerAta>
        : TAccountRewardOwnerAta,
      TAccountTokenProgram extends string
        ? ReadonlyAccount<TAccountTokenProgram>
        : TAccountTokenProgram,
      ...TRemainingAccounts,
    ]
  >;

export type CollectRewardOrcaInstructionData = {
  discriminator: ReadonlyUint8Array;
  rewardIndex: number;
};

export type CollectRewardOrcaInstructionDataArgs = { rewardIndex: number };

export function getCollectRewardOrcaInstructionDataEncoder(): Encoder<CollectRewardOrcaInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ["discriminator", fixEncoderSize(getBytesEncoder(), 8)],
      ["rewardIndex", getU8Encoder()],
    ]),
    (value) => ({ ...value, discriminator: COLLECT_REWARD_ORCA_DISCRIMINATOR }),
  );
}

export function getCollectRewardOrcaInstructionDataDecoder(): Decoder<CollectRewardOrcaInstructionData> {
  return getStructDecoder([
    ["discriminator", fixDecoderSize(getBytesDecoder(), 8)],
    ["rewardIndex", getU8Decoder()],
  ]);
}

export function getCollectRewardOrcaInstructionDataCodec(): Codec<
  CollectRewardOrcaInstructionDataArgs,
  CollectRewardOrcaInstructionData
> {
  return combineCodec(
    getCollectRewardOrcaInstructionDataEncoder(),
    getCollectRewardOrcaInstructionDataDecoder(),
  );
}

export type CollectRewardOrcaInput<
  TAccountAuthority extends string = string,
  TAccountTunaConfig extends string = string,
  TAccountTunaPosition extends string = string,
  TAccountTunaPositionAta extends string = string,
  TAccountWhirlpoolProgram extends string = string,
  TAccountWhirlpool extends string = string,
  TAccountOrcaPosition extends string = string,
  TAccountRewardVault extends string = string,
  TAccountTickArrayLower extends string = string,
  TAccountTickArrayUpper extends string = string,
  TAccountRewardOwnerAta extends string = string,
  TAccountTokenProgram extends string = string,
> = {
  /**
   *
   * TUNA accounts
   *
   */
  authority: TransactionSigner<TAccountAuthority>;
  tunaConfig: Address<TAccountTunaConfig>;
  tunaPosition: Address<TAccountTunaPosition>;
  tunaPositionAta: Address<TAccountTunaPositionAta>;
  /**
   *
   * ORCA accounts
   *
   */
  whirlpoolProgram: Address<TAccountWhirlpoolProgram>;
  whirlpool: Address<TAccountWhirlpool>;
  orcaPosition: Address<TAccountOrcaPosition>;
  rewardVault: Address<TAccountRewardVault>;
  tickArrayLower: Address<TAccountTickArrayLower>;
  tickArrayUpper: Address<TAccountTickArrayUpper>;
  rewardOwnerAta: Address<TAccountRewardOwnerAta>;
  /**
   *
   * Other accounts
   *
   */
  tokenProgram?: Address<TAccountTokenProgram>;
  rewardIndex: CollectRewardOrcaInstructionDataArgs["rewardIndex"];
};

export function getCollectRewardOrcaInstruction<
  TAccountAuthority extends string,
  TAccountTunaConfig extends string,
  TAccountTunaPosition extends string,
  TAccountTunaPositionAta extends string,
  TAccountWhirlpoolProgram extends string,
  TAccountWhirlpool extends string,
  TAccountOrcaPosition extends string,
  TAccountRewardVault extends string,
  TAccountTickArrayLower extends string,
  TAccountTickArrayUpper extends string,
  TAccountRewardOwnerAta extends string,
  TAccountTokenProgram extends string,
  TProgramAddress extends Address = typeof TUNA_PROGRAM_ADDRESS,
>(
  input: CollectRewardOrcaInput<
    TAccountAuthority,
    TAccountTunaConfig,
    TAccountTunaPosition,
    TAccountTunaPositionAta,
    TAccountWhirlpoolProgram,
    TAccountWhirlpool,
    TAccountOrcaPosition,
    TAccountRewardVault,
    TAccountTickArrayLower,
    TAccountTickArrayUpper,
    TAccountRewardOwnerAta,
    TAccountTokenProgram
  >,
  config?: { programAddress?: TProgramAddress },
): CollectRewardOrcaInstruction<
  TProgramAddress,
  TAccountAuthority,
  TAccountTunaConfig,
  TAccountTunaPosition,
  TAccountTunaPositionAta,
  TAccountWhirlpoolProgram,
  TAccountWhirlpool,
  TAccountOrcaPosition,
  TAccountRewardVault,
  TAccountTickArrayLower,
  TAccountTickArrayUpper,
  TAccountRewardOwnerAta,
  TAccountTokenProgram
> {
  // Program address.
  const programAddress = config?.programAddress ?? TUNA_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    authority: { value: input.authority ?? null, isWritable: true },
    tunaConfig: { value: input.tunaConfig ?? null, isWritable: false },
    tunaPosition: { value: input.tunaPosition ?? null, isWritable: true },
    tunaPositionAta: {
      value: input.tunaPositionAta ?? null,
      isWritable: false,
    },
    whirlpoolProgram: {
      value: input.whirlpoolProgram ?? null,
      isWritable: false,
    },
    whirlpool: { value: input.whirlpool ?? null, isWritable: false },
    orcaPosition: { value: input.orcaPosition ?? null, isWritable: true },
    rewardVault: { value: input.rewardVault ?? null, isWritable: true },
    tickArrayLower: { value: input.tickArrayLower ?? null, isWritable: true },
    tickArrayUpper: { value: input.tickArrayUpper ?? null, isWritable: true },
    rewardOwnerAta: { value: input.rewardOwnerAta ?? null, isWritable: true },
    tokenProgram: { value: input.tokenProgram ?? null, isWritable: false },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Original args.
  const args = { ...input };

  // Resolve default values.
  if (!accounts.tokenProgram.value) {
    accounts.tokenProgram.value =
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" as Address<"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA">;
  }

  const getAccountMeta = getAccountMetaFactory(programAddress, "programId");
  const instruction = {
    accounts: [
      getAccountMeta(accounts.authority),
      getAccountMeta(accounts.tunaConfig),
      getAccountMeta(accounts.tunaPosition),
      getAccountMeta(accounts.tunaPositionAta),
      getAccountMeta(accounts.whirlpoolProgram),
      getAccountMeta(accounts.whirlpool),
      getAccountMeta(accounts.orcaPosition),
      getAccountMeta(accounts.rewardVault),
      getAccountMeta(accounts.tickArrayLower),
      getAccountMeta(accounts.tickArrayUpper),
      getAccountMeta(accounts.rewardOwnerAta),
      getAccountMeta(accounts.tokenProgram),
    ],
    programAddress,
    data: getCollectRewardOrcaInstructionDataEncoder().encode(
      args as CollectRewardOrcaInstructionDataArgs,
    ),
  } as CollectRewardOrcaInstruction<
    TProgramAddress,
    TAccountAuthority,
    TAccountTunaConfig,
    TAccountTunaPosition,
    TAccountTunaPositionAta,
    TAccountWhirlpoolProgram,
    TAccountWhirlpool,
    TAccountOrcaPosition,
    TAccountRewardVault,
    TAccountTickArrayLower,
    TAccountTickArrayUpper,
    TAccountRewardOwnerAta,
    TAccountTokenProgram
  >;

  return instruction;
}

export type ParsedCollectRewardOrcaInstruction<
  TProgram extends string = typeof TUNA_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    /**
     *
     * TUNA accounts
     *
     */

    authority: TAccountMetas[0];
    tunaConfig: TAccountMetas[1];
    tunaPosition: TAccountMetas[2];
    tunaPositionAta: TAccountMetas[3];
    /**
     *
     * ORCA accounts
     *
     */

    whirlpoolProgram: TAccountMetas[4];
    whirlpool: TAccountMetas[5];
    orcaPosition: TAccountMetas[6];
    rewardVault: TAccountMetas[7];
    tickArrayLower: TAccountMetas[8];
    tickArrayUpper: TAccountMetas[9];
    rewardOwnerAta: TAccountMetas[10];
    /**
     *
     * Other accounts
     *
     */

    tokenProgram: TAccountMetas[11];
  };
  data: CollectRewardOrcaInstructionData;
};

export function parseCollectRewardOrcaInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>,
): ParsedCollectRewardOrcaInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 12) {
    // TODO: Coded error.
    throw new Error("Not enough accounts");
  }
  let accountIndex = 0;
  const getNextAccount = () => {
    const accountMeta = instruction.accounts![accountIndex]!;
    accountIndex += 1;
    return accountMeta;
  };
  return {
    programAddress: instruction.programAddress,
    accounts: {
      authority: getNextAccount(),
      tunaConfig: getNextAccount(),
      tunaPosition: getNextAccount(),
      tunaPositionAta: getNextAccount(),
      whirlpoolProgram: getNextAccount(),
      whirlpool: getNextAccount(),
      orcaPosition: getNextAccount(),
      rewardVault: getNextAccount(),
      tickArrayLower: getNextAccount(),
      tickArrayUpper: getNextAccount(),
      rewardOwnerAta: getNextAccount(),
      tokenProgram: getNextAccount(),
    },
    data: getCollectRewardOrcaInstructionDataDecoder().decode(instruction.data),
  };
}
