export {type Transport, LSPClient, LSPClientConfig, lspSupport} from "./client.js"
export {type LSPFeature} from "./feature.js"
// FIXME find a better naming convention
export {lspCompletion} from "./completion.js"
export {lspHoverTooltips} from "./hover.js"
export {lspFormatDocument, lspFormatting} from "./formatting.js"
export {lspRenameSymbol, lspRename} from "./rename.js"
export {lspSignatureHelp, lspShowSignatureHelp} from "./signature.js"
