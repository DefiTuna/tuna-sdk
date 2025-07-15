import {
  createFromRoot,
  updateAccountsVisitor,
  updateDefinedTypesVisitor,
} from "codama";
import { renderRustVisitor } from "@codama/renderers";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { readFileSync } from "fs";

function readIdl() {
  return readFileSync("../../target/idl/tuna.json", "utf8");
}

const idl = JSON.parse(readIdl());
const codama = createFromRoot(rootNodeFromAnchor(idl));

// Delete Orca and fusion accounts
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

console.log("Generating rust visitor");
const rustVisitor = renderRustVisitor("./src/generated");
codama.accept(rustVisitor);
