import {createFromRoot} from 'codama'
import {renderRustVisitor, renderJavaScriptVisitor} from '@codama/renderers'
import {bottomUpTransformerVisitor} from '@codama/visitors-core'
import {isNode, definedTypeNode, definedTypeLinkNode, camelCase} from '@codama/nodes'
import {rootNodeFromAnchor} from '@codama/nodes-from-anchor'
import {readFileSync} from 'fs'

const idl = JSON.parse(readFileSync("./idl/tuna.json", "utf8"));
const codama = createFromRoot(rootNodeFromAnchor(idl));
const clients = (process.argv[2] || 'rust,ts').split(',');

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

if (clients.includes('rust')) {
    console.log('Generating rust visitor')
    const rustVisitor = renderRustVisitor("./packages/client-rs/src/generated");
    codama.accept(rustVisitor);
}

if (clients.includes('ts')) {
    console.log('Generating ts visitor')
    const tsVisitor = renderJavaScriptVisitor("./packages/client/src/generated");
    codama.accept(tsVisitor);    
}

console.log("All done")
