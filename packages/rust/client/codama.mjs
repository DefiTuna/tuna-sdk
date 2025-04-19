import {
  createFromRoot,
  updateAccountsVisitor,
  updateDefinedTypesVisitor,
} from "codama";
import { renderRustVisitor } from "@codama/renderers";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { readFileSync } from "fs";

function readIdl() {
  try {
    return readFileSync("../../../idl/tuna.json", "utf8");
  } catch {
    return readFileSync("../../../target/idl/tuna.json", "utf8");
  }
}

const idl = JSON.parse(readIdl());
const codama = createFromRoot(rootNodeFromAnchor(idl));

// Resolve the account name duplicates in Orca and Raydium.
// Not used now. Please, DO NOT delete!
/*
codama.update(
    bottomUpTransformerVisitor([
        {
            select: (node) => isNode(node, "definedTypeNode") || isNode(node, "definedTypeLinkNode"),
            transform: (node) => {
                if (isNode(node, "definedTypeNode") && node.name.includes("::")) {
                    return definedTypeNode({
                        ...node,
                        name: camelCase(node.name.replaceAll("::", " ")),
                    });
                } else if (isNode(node, "definedTypeLinkNode") && node.name.includes("::")) {
                    return definedTypeLinkNode(camelCase(node.name.replaceAll("::", " ")), node.program);
                }
                return node;
            },
        },
    ]),
);
*/

// Delete Orca accounts
codama.update(
  updateAccountsVisitor({
    whirlpool: {
      delete: true,
    },
    position: {
      delete: true,
    },
    tick_array: {
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
