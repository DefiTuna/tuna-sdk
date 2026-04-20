import { describe, expect, it } from "vitest";

import { createReferralInstruction, fetchReferral, getReferralAddress } from "../src";

import { rpc, sendTransaction, signer } from "./helpers/mockRpc.ts";

describe("Referrals", () => {
  it("Create Referral", async () => {
    const ix = await createReferralInstruction(signer, 3223431);
    await sendTransaction([ix]);

    const referralAddress = (await getReferralAddress(signer.address))[0];
    const referral = await fetchReferral(rpc, referralAddress);
    expect(referral.data.authority).toEqual(signer.address);
    expect(referral.data.referralId).toEqual(3223431);
  });
}, 20000);
