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
  getAddressDecoder,
  getAddressEncoder,
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
  type ReadonlyUint8Array,
  type TransactionSigner,
  type WritableAccount,
  type WritableSignerAccount,
} from "@solana/kit";
import { TUNA_PROGRAM_ADDRESS } from "../programs";
import { getAccountMetaFactory, type ResolvedAccount } from "../shared";

export const SET_OWNER_AUTHORITY_DISCRIMINATOR = new Uint8Array([
  128, 171, 210, 21, 103, 179, 80, 117,
]);

export function getSetOwnerAuthorityDiscriminatorBytes() {
  return fixEncoderSize(getBytesEncoder(), 8).encode(
    SET_OWNER_AUTHORITY_DISCRIMINATOR,
  );
}

export type SetOwnerAuthorityInstruction<
  TProgram extends string = typeof TUNA_PROGRAM_ADDRESS,
  TAccountAuthority extends string | IAccountMeta<string> = string,
  TAccountTunaConfig extends string | IAccountMeta<string> = string,
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
        ? WritableAccount<TAccountTunaConfig>
        : TAccountTunaConfig,
      ...TRemainingAccounts,
    ]
  >;

export type SetOwnerAuthorityInstructionData = {
  discriminator: ReadonlyUint8Array;
  ownerAuthority: Address;
};

export type SetOwnerAuthorityInstructionDataArgs = { ownerAuthority: Address };

export function getSetOwnerAuthorityInstructionDataEncoder(): Encoder<SetOwnerAuthorityInstructionDataArgs> {
  return transformEncoder(
    getStructEncoder([
      ["discriminator", fixEncoderSize(getBytesEncoder(), 8)],
      ["ownerAuthority", getAddressEncoder()],
    ]),
    (value) => ({ ...value, discriminator: SET_OWNER_AUTHORITY_DISCRIMINATOR }),
  );
}

export function getSetOwnerAuthorityInstructionDataDecoder(): Decoder<SetOwnerAuthorityInstructionData> {
  return getStructDecoder([
    ["discriminator", fixDecoderSize(getBytesDecoder(), 8)],
    ["ownerAuthority", getAddressDecoder()],
  ]);
}

export function getSetOwnerAuthorityInstructionDataCodec(): Codec<
  SetOwnerAuthorityInstructionDataArgs,
  SetOwnerAuthorityInstructionData
> {
  return combineCodec(
    getSetOwnerAuthorityInstructionDataEncoder(),
    getSetOwnerAuthorityInstructionDataDecoder(),
  );
}

export type SetOwnerAuthorityInput<
  TAccountAuthority extends string = string,
  TAccountTunaConfig extends string = string,
> = {
  authority: TransactionSigner<TAccountAuthority>;
  tunaConfig: Address<TAccountTunaConfig>;
  ownerAuthority: SetOwnerAuthorityInstructionDataArgs["ownerAuthority"];
};

export function getSetOwnerAuthorityInstruction<
  TAccountAuthority extends string,
  TAccountTunaConfig extends string,
  TProgramAddress extends Address = typeof TUNA_PROGRAM_ADDRESS,
>(
  input: SetOwnerAuthorityInput<TAccountAuthority, TAccountTunaConfig>,
  config?: { programAddress?: TProgramAddress },
): SetOwnerAuthorityInstruction<
  TProgramAddress,
  TAccountAuthority,
  TAccountTunaConfig
> {
  // Program address.
  const programAddress = config?.programAddress ?? TUNA_PROGRAM_ADDRESS;

  // Original accounts.
  const originalAccounts = {
    authority: { value: input.authority ?? null, isWritable: true },
    tunaConfig: { value: input.tunaConfig ?? null, isWritable: true },
  };
  const accounts = originalAccounts as Record<
    keyof typeof originalAccounts,
    ResolvedAccount
  >;

  // Original args.
  const args = { ...input };

  const getAccountMeta = getAccountMetaFactory(programAddress, "programId");
  const instruction = {
    accounts: [
      getAccountMeta(accounts.authority),
      getAccountMeta(accounts.tunaConfig),
    ],
    programAddress,
    data: getSetOwnerAuthorityInstructionDataEncoder().encode(
      args as SetOwnerAuthorityInstructionDataArgs,
    ),
  } as SetOwnerAuthorityInstruction<
    TProgramAddress,
    TAccountAuthority,
    TAccountTunaConfig
  >;

  return instruction;
}

export type ParsedSetOwnerAuthorityInstruction<
  TProgram extends string = typeof TUNA_PROGRAM_ADDRESS,
  TAccountMetas extends readonly IAccountMeta[] = readonly IAccountMeta[],
> = {
  programAddress: Address<TProgram>;
  accounts: {
    authority: TAccountMetas[0];
    tunaConfig: TAccountMetas[1];
  };
  data: SetOwnerAuthorityInstructionData;
};

export function parseSetOwnerAuthorityInstruction<
  TProgram extends string,
  TAccountMetas extends readonly IAccountMeta[],
>(
  instruction: IInstruction<TProgram> &
    IInstructionWithAccounts<TAccountMetas> &
    IInstructionWithData<Uint8Array>,
): ParsedSetOwnerAuthorityInstruction<TProgram, TAccountMetas> {
  if (instruction.accounts.length < 2) {
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
    },
    data: getSetOwnerAuthorityInstructionDataDecoder().decode(instruction.data),
  };
}
