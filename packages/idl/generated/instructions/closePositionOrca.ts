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
} from '@solana/kit';
import { TUNA_PROGRAM_ADDRESS } from '../programs';
import { getAccountMetaFactory, type ResolvedAccount } from '../shared';

export const CLOSE_POSITION_ORCA_DISCRIMINATOR = new Uint8Array([
  253, 98, 90, 239, 191, 36, 161, 26,
]);

export function getClosePositionOrcaDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(
    CLOSE_POSITION_ORCA_DISCRIMINATOR
  );
}

export type ClosePositionOrcaInstruction<
  TProgram extends string = typeof TUNA_PROGRAM_ADDRESS,
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TAccountTunaConfig extends string | IAccountMeta<string> = string,
  TAccountTunaPosition extends string | IAccountMeta<string> = string,
  TAccountTunaPositionMint extends string | IAccountMeta<string> = string,
  TAccountTunaPositionAta extends string | IAccountMeta<string> = string,
  TAccountTunaPositionAtaA extends string | IAccountMeta<string> = string,
  TAccountTunaPositionAtaB extends string | IAccountMeta<string> = string,
  TAccountTunaPositionOwnerAtaA extends string | IAccountMeta<string> = string,
  TAccountTunaPositionOwnerAtaB extends string | IAccountMeta<string> = string,
  TAccountWhirlpoolProgram extends string | IAccountMeta<string> = string,
  TAccountWhirlpool extends string | IAccountMeta<string> = string,
  TAccountOrcaPosition extends string | IAccountMeta<string> = string,
  TAccountTokenProgram extends
    | string
    | IAccountMeta<string> = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TAccountToken2022Program extends string | IAccountMeta<string> = string,
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
      TAccountTunaPositionMint extends string
        ? WritableAccount<TAccountTunaPositionMint>
        : TAccountTunaPositionMint,
      TAccountTunaPositionAta extends string
        ? WritableAccount<TAccountTunaPositionAta>
        : TAccountTunaPositionAta,
      TAccountTunaPositionAtaA extends string
        ? WritableAccount<TAccountTunaPositionAtaA>
        : TAccountTunaPositionAtaA,
      TAccountTunaPositionAtaB extends string
        ? WritableAccount<TAccountTunaPositionAtaB>
        : TAccountTunaPositionAtaB,
      TAccountTunaPositionOwnerAtaA extends string
        ? WritableAccount<TAccountTunaPositionOwnerAtaA>
        : TAccountTunaPositionOwnerAtaA,
      TAccountTunaPositionOwnerAtaB extends string
        ? WritableAccount<TAccountTunaPositionOwnerAtaB>
        : TAccountTunaPositionOwnerAtaB,
      TAccountWhirlpoolProgram extends string
        ? ReadonlyAccount<TAccountWhirlpoolProgram>
        : TAccountWhirlpoolProgram,
      TAccountWhirlpool extends string
        ? ReadonlyAccount<TAccountWhirlpool>
        : TAccountWhirlpool,
      TAccountOrcaPosition extends string
        ? WritableAccount<TAccountOrcaPosition>
        : TAccountOrcaPosition,
      TAccountTokenProgram extends string
        ? ReadonlyAccount<TAccountTokenProgram>
        : TAccountTokenProgram,
      TAccountToken2022Program extends string
        ? ReadonlyAccount<TAccountToken2022Program>
        : TAccountToken2022Program,
      ...TRemainingAccounts,
    ]
  >;

export type ClosePositionOrcaInstructionData = {
  discriminator: ReadonlyUint8Array;
};

export type ClosePositionOrcaInstructionDataArgs = {};

export function getClosePositionOrcaInstructionDataEncoder(): Encoder<ClosePositionOrcaInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([['discriminator', fixEncoderSize(getBytesEncoder(), 8)]]),
    (value) => ({ ...value, discriminator: CLOSE_POSITION_ORCA_DISCRIMINATOR })
  );
}

export function getClosePositionOrcaInstructionDataDecoder(): Decoder<ClosePositionOrcaInstructionData> {
  return getStructDecoder([
    ['discriminator', fixDecoderSize(getBytesDecoder(), 8)],
  ]);
}

export function getClosePositionOrcaInstructionDataCodec(): Codec<
  ClosePositionOrcaInstructionDataArgs,
  ClosePositionOrcaInstructionData
> {
  return combineCodec(
    getClosePositionOrcaInstructionDataEncoder(),
    getClosePositionOrcaInstructionDataDecoder()
  );
}

export type ClosePositionOrcaInput<
  TAccountAuthority extends string = string,
  TAccountTunaConfig extends string = string,
  TAccountTunaPosition extends string = string,
  TAccountTunaPositionMint extends string = string,
  TAccountTunaPositionAta extends string = string,
  TAccountTunaPositionAtaA extends string = string,
  TAccountTunaPositionAtaB extends string = string,
  TAccountTunaPositionOwnerAtaA extends string = string,
  TAccountTunaPositionOwnerAtaB extends string = string,
  TAccountWhirlpoolProgram extends string = string,
  TAccountWhirlpool extends string = string,
  TAccountOrcaPosition extends string = string,
  TAccountTokenProgram extends string = string,
  TAccountToken2022Program extends string = string,
> = {
  /**
   *
   * TUNA accounts
   *
   */
  authority: TransactionSigner<TAccountAuthority>;
  tunaConfig: Address<TAccountTunaConfig>;
  tunaPosition: Address<TAccountTunaPosition>;
  tunaPositionMint: Address<TAccountTunaPositionMint>;
  tunaPositionAta: Address<TAccountTunaPositionAta>;
  tunaPositionAtaA: Address<TAccountTunaPositionAtaA>;
  tunaPositionAtaB: Address<TAccountTunaPositionAtaB>;
  tunaPositionOwnerAtaA: Address<TAccountTunaPositionOwnerAtaA>;
  tunaPositionOwnerAtaB: Address<TAccountTunaPositionOwnerAtaB>;
  /**
   *
   * ORCA accounts
   *
   */
  whirlpoolProgram: Address<TAccountWhirlpoolProgram>;
  whirlpool: Address<TAccountWhirlpool>;
  orcaPosition: Address<TAccountOrcaPosition>;
  /**
   *
   * Other accounts
   *
   */
  tokenProgram?: Address<TAccountTokenProgram>;
  token2022Program: Address<TAccountToken2022Program>;
};

export function getClosePositionOrcaInstruction<
  TAccountAuthority extends string,
  TAccountTunaConfig extends string,
  TAccountTunaPosition extends string,
  TAccountTunaPositionMint extends string,
  TAccountTunaPositionAta extends string,
  TAccountTunaPositionAtaA extends string,
  TAccountTunaPositionAtaB extends string,
  TAccountTunaPositionOwnerAtaA extends string,
  TAccountTunaPositionOwnerAtaB extends string,
  TAccountWhirlpoolProgram extends string,
  TAccountWhirlpool extends string,
  TAccountOrcaPosition extends string,
  TAccountTokenProgram extends string,
  TAccountToken2022Program extends string,
  TProgramAddress extends Address = typeof TUNA_PROGRAM_ADDRESS,
>(
  input: ClosePositionOrcaInput<
    TAccountAuthority,
    TAccountTunaConfig,
    TAccountTunaPosition,
    TAccountTunaPositionMint,
    TAccountTunaPositionAta,
    TAccountTunaPositionAtaA,
    TAccountTunaPositionAtaB,
    TAccountTunaPositionOwnerAtaA,
    TAccountTunaPositionOwnerAtaB,
    TAccountWhirlpoolProgram,
    TAccountWhirlpool,
    TAccountOrcaPosition,
    TAccountTokenProgram,
    TAccountToken2022Program
  >,
  config?: { programAddress?: TProgramAddress }
): ClosePositionOrcaInstruction<
  TProgramAddress,
  TAccountAuthority,
  TAccountTunaConfig,
  TAccountTunaPosition,
  TAccountTunaPositionMint,
  TAccountTunaPositionAta,
  TAccountTunaPositionAtaA,
  TAccountTunaPositionAtaB,
  TAccountTunaPositionOwnerAtaA,
  TAccountTunaPositionOwnerAtaB,
  TAccountWhirlpoolProgram,
  TAccountWhirlpool,
  TAccountOrcaPosition,
  TAccountTokenProgram,
  TAccountToken2022Program
> {
  // Program address.
  const programAddress = config?.programAddress ?? TUNA_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    authority: { value: input.authority ?? null, isWritable: true },
    tunaConfig: { value: input.tunaConfig ?? null, isWritable: false },
    tunaPosition: { value: input.tunaPosition ?? null, isWritable: true },
    tunaPositionMint: {
      value: input.tunaPositionMint ?? null,
      isWritable: true,
    },
    tunaPositionAta: { value: input.tunaPositionAta ?? null, isWritable: true },
    tunaPositionAtaA: {
      value: input.tunaPositionAtaA ?? null,
      isWritable: true,
    },
    tunaPositionAtaB: {
      value: input.tunaPositionAtaB ?? null,
      isWritable: true,
    },
    tunaPositionOwnerAtaA: {
      value: input.tunaPositionOwnerAtaA ?? null,
      isWritable: true,
    },
    tunaPositionOwnerAtaB: {
      value: input.tunaPositionOwnerAtaB ?? null,
      isWritable: true,
    },
    whirlpoolProgram: {
      value: input.whirlpoolProgram ?? null,
      isWritable: false,
    },
    whirlpool: { value: input.whirlpool ?? null, isWritable: false },
    orcaPosition: { value: input.orcaPosition ?? null, isWritable: true },
    tokenProgram: { value: input.tokenProgram ?? null, isWritable: false },
    token2022Program: {
      value: input.token2022Program ?? null,
      isWritable: false,
    },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Resolve default values.
  if (!accounts.tokenProgram.value) {
    accounts.tokenProgram.value =
      'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address<'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'>;
  }

  const getAccountMeta = getAccountMetaFactory(programAddress, 'programId');
  const instruction = {
    accounts: [
      getAccountMeta(accounts.authority),
      getAccountMeta(accounts.tunaConfig),
      getAccountMeta(accounts.tunaPosition),
      getAccountMeta(accounts.tunaPositionMint),
      getAccountMeta(accounts.tunaPositionAta),
      getAccountMeta(accounts.tunaPositionAtaA),
      getAccountMeta(accounts.tunaPositionAtaB),
      getAccountMeta(accounts.tunaPositionOwnerAtaA),
      getAccountMeta(accounts.tunaPositionOwnerAtaB),
      getAccountMeta(accounts.whirlpoolProgram),
      getAccountMeta(accounts.whirlpool),
      getAccountMeta(accounts.orcaPosition),
      getAccountMeta(accounts.tokenProgram),
      getAccountMeta(accounts.token2022Program),
    ],
    programAddress,
    data: getClosePositionOrcaInstructionDataEncoder().encode({}),
  } as ClosePositionOrcaInstruction<
    TProgramAddress,
    TAccountAuthority,
    TAccountTunaConfig,
    TAccountTunaPosition,
    TAccountTunaPositionMint,
    TAccountTunaPositionAta,
    TAccountTunaPositionAtaA,
    TAccountTunaPositionAtaB,
    TAccountTunaPositionOwnerAtaA,
    TAccountTunaPositionOwnerAtaB,
    TAccountWhirlpoolProgram,
    TAccountWhirlpool,
    TAccountOrcaPosition,
    TAccountTokenProgram,
    TAccountToken2022Program
  >;

  return instruction;
}

export type ParsedClosePositionOrcaInstruction<
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
    tunaPositionMint: TAccountMetas[3];
    tunaPositionAta: TAccountMetas[4];
    tunaPositionAtaA: TAccountMetas[5];
    tunaPositionAtaB: TAccountMetas[6];
    tunaPositionOwnerAtaA: TAccountMetas[7];
    tunaPositionOwnerAtaB: TAccountMetas[8];
    /**
     *
     * ORCA accounts
     *
     */

    whirlpoolProgram: TAccountMetas[9];
    whirlpool: TAccountMetas[10];
    orcaPosition: TAccountMetas[11];
    /**
     *
     * Other accounts
     *
     */

    tokenProgram: TAccountMetas[12];
    token2022Program: TAccountMetas[13];
  };
  data: ClosePositionOrcaInstructionData;
};

export function parseClosePositionOrcaInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>
): ParsedClosePositionOrcaInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 14) {
    // TODO: Coded error.
    throw new Error('Not enough accounts');
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
      tunaPositionMint: getNextAccount(),
      tunaPositionAta: getNextAccount(),
      tunaPositionAtaA: getNextAccount(),
      tunaPositionAtaB: getNextAccount(),
      tunaPositionOwnerAtaA: getNextAccount(),
      tunaPositionOwnerAtaB: getNextAccount(),
      whirlpoolProgram: getNextAccount(),
      whirlpool: getNextAccount(),
      orcaPosition: getNextAccount(),
      tokenProgram: getNextAccount(),
      token2022Program: getNextAccount(),
    },
    data: getClosePositionOrcaInstructionDataDecoder().decode(instruction.data),
  };
}
