import assert from "assert";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createTunaConfigInstruction,
  fetchTunaConfig,
  getSetAdminAuthorityInstruction,
  getSetDefaultMaxPercentageOfLeftoversInstruction,
  getSetDefaultMaxSwapSlippageInstruction,
  getSetDefaultOraclePriceDeviationThresholdInstruction,
  getSetFeeRecipientInstruction,
  getSetLiquidatorAuthorityInstruction,
  getSetOwnerAuthorityInstruction,
  getTunaConfigAddress,
} from "../src";

import { ALICE_KEYPAIR, FEE_RECIPIENT_KEYPAIR, LIQUIDATOR_KEYPAIR, TUNA_ADMIN_KEYPAIR } from "./helpers/addresses.ts";
import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";

describe("Tuna Config", () => {
  beforeAll(async () => {});

  it("Verify global tuna config", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();
    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);

    expect(tunaConfig.data.version).toEqual(1);
    expect(tunaConfig.data.ownerAuthority).toEqual(signer.address);
    expect(tunaConfig.data.adminAuthority).toEqual(TUNA_ADMIN_KEYPAIR.address);
    expect(tunaConfig.data.liquidatorAuthority).toEqual(LIQUIDATOR_KEYPAIR.address);
    expect(tunaConfig.data.feeRecipient).toEqual(FEE_RECIPIENT_KEYPAIR.address);
  });

  it("Can't create the global tuna config again", async () => {
    const ix = await createTunaConfigInstruction(
      signer,
      signer.address,
      TUNA_ADMIN_KEYPAIR.address,
      LIQUIDATOR_KEYPAIR.address,
      FEE_RECIPIENT_KEYPAIR.address,
    );

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x0");
      return true;
    });
  });

  it("Cannot set owner address if not owner authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    const ix = getSetOwnerAuthorityInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      ownerAuthority: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });

  it("Cannot set admin address if not owner authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    const ix = getSetAdminAuthorityInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      adminAuthority: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });

  it("Cannot set liquidator address if not admin authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    const ix = getSetLiquidatorAuthorityInstruction({
      authority: signer,
      liquidatorAuthority: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });

  it("Cannot set fee recipient if not owner authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    const ix = getSetFeeRecipientInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      feeRecipient: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });

    await assert.rejects(sendTransaction([ix]), err => {
      expect((err as Error).toString()).contain("custom program error: 0x7d3");
      return true;
    });
  });

  it("Set owner authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();
    let ix = getSetOwnerAuthorityInstruction({
      authority: signer,
      ownerAuthority: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.ownerAuthority).toEqual(TUNA_ADMIN_KEYPAIR.address);

    // Restore
    ix = getSetOwnerAuthorityInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      ownerAuthority: signer.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);
  });

  it("Set admin authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    let ix = getSetAdminAuthorityInstruction({
      authority: signer,
      adminAuthority: ALICE_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.adminAuthority).toEqual(ALICE_KEYPAIR.address);

    // Restore
    ix = getSetAdminAuthorityInstruction({
      authority: signer,
      adminAuthority: TUNA_ADMIN_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);
  });

  it("Set liquidator authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    let ix = getSetLiquidatorAuthorityInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      liquidatorAuthority: ALICE_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.liquidatorAuthority).toEqual(ALICE_KEYPAIR.address);

    // Restore
    ix = getSetLiquidatorAuthorityInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      liquidatorAuthority: LIQUIDATOR_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);
  });

  it("Set fee recipient authority", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();

    let ix = getSetFeeRecipientInstruction({
      authority: signer,
      feeRecipient: ALICE_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.feeRecipient).toEqual(ALICE_KEYPAIR.address);

    // Restore
    ix = getSetFeeRecipientInstruction({
      authority: signer,
      feeRecipient: FEE_RECIPIENT_KEYPAIR.address,
      tunaConfig: tunaConfigAddress[0],
    });
    await sendTransaction([ix]);
  });

  it("Set max percentage of leftovers", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();
    const tunaConfigBefore = await fetchTunaConfig(rpc, tunaConfigAddress[0]);

    let ix = getSetDefaultMaxPercentageOfLeftoversInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      maxPercentageOfLeftovers: 1111,
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.maxPercentageOfLeftovers).toEqual(1111);

    // Restore
    ix = getSetDefaultMaxPercentageOfLeftoversInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      maxPercentageOfLeftovers: tunaConfigBefore.data.maxPercentageOfLeftovers,
    });
    await sendTransaction([ix]);
  });

  it("Set max swap slippage", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();
    const tunaConfigBefore = await fetchTunaConfig(rpc, tunaConfigAddress[0]);

    let ix = getSetDefaultMaxSwapSlippageInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      maxSwapSlippage: 1111,
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.maxSwapSlippage).toEqual(1111);

    // Restore
    ix = getSetDefaultMaxSwapSlippageInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      maxSwapSlippage: tunaConfigBefore.data.maxSwapSlippage,
    });
    await sendTransaction([ix]);
  });

  it("Set oracle price deviation threshold", async () => {
    const tunaConfigAddress = await getTunaConfigAddress();
    const tunaConfigBefore = await fetchTunaConfig(rpc, tunaConfigAddress[0]);

    let ix = getSetDefaultOraclePriceDeviationThresholdInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      oraclePriceDeviationThreshold: 1111,
    });
    await sendTransaction([ix]);

    const tunaConfig = await fetchTunaConfig(rpc, tunaConfigAddress[0]);
    expect(tunaConfig.data.oraclePriceDeviationThreshold).toEqual(1111);

    // Restore
    ix = getSetDefaultOraclePriceDeviationThresholdInstruction({
      authority: TUNA_ADMIN_KEYPAIR,
      tunaConfig: tunaConfigAddress[0],
      oraclePriceDeviationThreshold: tunaConfigBefore.data.oraclePriceDeviationThreshold,
    });
    await sendTransaction([ix]);
  });
});
