import {
  createFromRoot,
  updateAccountsVisitor,
  updateDefinedTypesVisitor,
  updateInstructionsVisitor,
} from "codama";
import { renderVisitor } from "@codama/renderers-js";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { readFileSync } from "fs";

function readIdl() {
  return readFileSync("../../target/idl/tuna.json", "utf8");
}

const idl = JSON.parse(readIdl());
const codama = createFromRoot(rootNodeFromAnchor(idl));

// Delete Orca accounts
codama.update(
  updateAccountsVisitor({
    whirlpool: {
      delete: true,
    },
    fusion_pool: {
      delete: true,
    },
  }),
);

// Keep internal protocol operations out of the public SDK.
codama.update(
  updateInstructionsVisitor({
    socialize_bad_debt: {
      delete: true,
    },
  }),
);

// Delete Orca types
codama.update(
  updateDefinedTypesVisitor({
    position_reward_info: {
      delete: true,
    },
    whirlpool_reward_info: {
      delete: true,
    },
    tick: {
      delete: true,
    },
  }),
);

console.log("Generating TypeScript client");
const tsVisitor = renderVisitor("./src/generated");
codama.accept(tsVisitor);
