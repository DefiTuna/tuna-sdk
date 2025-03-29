const { createFromRoot } = require("codama");
const { renderRustVisitor } = require("@codama/renderers");
const { bottomUpTransformerVisitor } = require("@codama/visitors-core");
const { isNode, definedTypeNode, definedTypeLinkNode, camelCase } = require("@codama/nodes");
const { rootNodeFromAnchor } = require("@codama/nodes-from-anchor");
const { readFileSync } = require("fs");

const idl = JSON.parse(readFileSync("./../../idl/tuna.json", "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));

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

const rustVisitor = renderRustVisitor("./src/generated");
codama.accept(rustVisitor);
