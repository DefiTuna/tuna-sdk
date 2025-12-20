import { describe, it } from "vitest";
import type { TunaSpotPosition } from "../../client/src";
import type { TunaSpotPositionFacade } from "../dist/nodejs/defituna_core_js_bindings";

// Since these tests are only for type checking, nothing actually happens at runtime.

describe("WASM exported types match Codama types", () => {
  it("TunaSpotPosition", () => {
    const fauxTunaSpotPosition = {} as TunaSpotPosition;
    fauxTunaSpotPosition satisfies TunaSpotPositionFacade;
  });
});
