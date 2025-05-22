export {Transport, LSPClient, LSPClientConfig} from "./client"
export {serverCompletion} from "./completion"
export {hoverTooltips} from "./hover"
export {formatDocument, formatKeymap} from "./formatting"
export {renameSymbol, renameKeymap} from "./rename"
export {signatureHelp, nextSignature, prevSignature, showSignatureHelp} from "./signature"
export {LSPPlugin} from "./plugin"

import {Extension} from "@codemirror/state"
import {keymap} from "@codemirror/view"
import {LSPClient} from "./client"
import {LSPPlugin} from "./plugin"
import {serverCompletion} from "./completion"
import {hoverTooltips} from "./hover"
import {formatKeymap} from "./formatting"
import {renameKeymap} from "./rename"
import {signatureHelp} from "./signature"

/// Returns an extension that enables the [LSP
/// plugin](#lsp-client.LSPPlugin) and all other features provided by
/// this package. You also pick and choose individual extensions from
/// the exports. In that case, make sure to also include
/// `LSPPlugin.create` in your extensions, or the others will not
/// work.
export function languageServerSupport(client: LSPClient, uri: string, languageID?: string): Extension {
  return [
    LSPPlugin.create(client, uri, languageID),
    serverCompletion(),
    hoverTooltips(),
    keymap.of([...formatKeymap, ...renameKeymap]),
    signatureHelp()
  ]
}
