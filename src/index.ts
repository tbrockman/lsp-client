export {Transport, LSPClient, LSPClientConfig, WorkspaceMapping} from "./client"
export {LSPPlugin} from "./plugin"
export {Workspace, WorkspaceFile} from "./workspace"
export {serverCompletion, serverCompletionSource} from "./completion"
export {hoverTooltips} from "./hover"
export {formatDocument, formatKeymap} from "./formatting"
export {renameSymbol, renameKeymap} from "./rename"
export {signatureHelp, nextSignature, prevSignature, showSignatureHelp, signatureKeymap} from "./signature"
export {jumpToDefinition, jumpToDeclaration, jumpToTypeDefinition, jumpToImplementation, jumpToDefinitionKeymap} from "./definition"
export {findReferences, closeReferencePanel, findReferencesKeymap} from "./references"

import {Extension} from "@codemirror/state"
import {keymap} from "@codemirror/view"
import {LSPClient} from "./client"
import {LSPPlugin} from "./plugin"
import {serverCompletion} from "./completion"
import {hoverTooltips} from "./hover"
import {formatKeymap} from "./formatting"
import {renameKeymap} from "./rename"
import {signatureHelp} from "./signature"
import {jumpToDefinitionKeymap} from "./definition"
import {findReferencesKeymap} from "./references"

/// Returns an extension that enables the [LSP
/// plugin](#lsp-client.LSPPlugin) and all other features provided by
/// this package. You can also pick and choose individual extensions
/// from the exports. In that case, make sure to also include
/// [`LSPPlugin.create`](#lsp-client.LSPPlugin^create) in your
/// extensions, or the others will not work.
export function languageServerSupport(client: LSPClient, uri: string, languageID?: string): Extension {
  return [
    LSPPlugin.create(client, uri, languageID),
    serverCompletion(),
    hoverTooltips(),
    keymap.of([...formatKeymap, ...renameKeymap, ...jumpToDefinitionKeymap, ...findReferencesKeymap]),
    signatureHelp()
  ]
}
