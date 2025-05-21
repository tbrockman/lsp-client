import type * as lsp from "vscode-languageserver-protocol"
import {EditorState, Extension} from "@codemirror/state"
import {CompletionSource, Completion, CompletionContext, snippet, autocompletion} from "@codemirror/autocomplete"
import {EditorView} from "@codemirror/view"
import {LSPClient} from "./client"
import {lspPlugin} from "./plugin"

/// Register the [language server completion
/// source](#lsp-client.serverCompletionSource) as an autocompletion
/// source.
export function serverCompletion(config: {
  /// By default, the completion source that asks the language server
  /// for completions is added as a regular source, in addition to any
  /// other sources. Set this to true to make it replace all
  /// completion sources.
  override?: boolean
} = {}): Extension {
  if (config.override) {
    return autocompletion({override: [serverCompletionSource]})
  } else {
    let data = [{autocomplete: serverCompletionSource}]
    return [autocompletion(), EditorState.languageData.of(() => data)]
  }
}

/// A completion source that requests completions from a language
/// server. Only works when [server
/// support](#lsp-server.languageServerSupport) is active in the
/// editor.
export const serverCompletionSource: CompletionSource = context => {
  const client = context.view?.plugin(lspPlugin)?.client
  if (!client) return null
  if (!context.explicit) {
    let charBefore = context.view.state.sliceDoc(context.pos - 1, context.pos)
    let triggers = client.serverCapabilities.completionProvider?.triggerCharacters
    if (!/[a-zA-Z_]/.test(charBefore) && !(triggers && triggers.indexOf(charBefore) > -1)) return null
  }
  return client.completions(context.view, context.pos, context.explicit).then(result => {
    if (!result) return null
    if (Array.isArray(result)) result = {items: result} as lsp.CompletionList
    let {from, to} = completionResultRange(context, result)
    let defaultCommitChars = result.itemDefaults?.commitCharacters

    return {
      from, to,
      options: result.items.map<Completion>(item => {
        let text = item.textEdit?.newText || item.textEditText || item.insertText || item.label
        let option: Completion = {
          label: text,
          type: item.kind && kindToType[item.kind],
        }
        if (item.commitCharacters && item.commitCharacters != defaultCommitChars)
          option.commitCharacters = item.commitCharacters
        if (item.detail) option.detail = item.detail
        // FIXME compare allowed syntax. catch errors
        if (item.insertTextFormat == 2 /* Snippet */) option.apply = (view, c, from, to) => snippet(text)(view, c, from, to)
        if (item.documentation) option.info = () => renderDocInfo(client, context.view!, item.documentation!)
        return option
      }),
      commitCharacters: defaultCommitChars,
      validFor: /^\.?\w*$/, // FIXME
      map: (result, changes) => ({...result, from: changes.mapPos(result.from)}),
    }
  })
}

function completionResultRange(cx: CompletionContext, result: lsp.CompletionList): {from: number, to: number} {
  if (!result.items.length) return {from: cx.pos, to: cx.pos}
  let defaultRange = result.itemDefaults?.editRange, item0 = result.items[0]
  let range = defaultRange ? ("insert" in defaultRange ? defaultRange.insert : defaultRange)
    : item0.textEdit ? ("range" in item0.textEdit ? item0.textEdit.range : item0.textEdit.insert)
    : null
  if (!range) return cx.state.wordAt(cx.pos) || {from: cx.pos, to: cx.pos}
  let line = cx.state.doc.lineAt(cx.pos)
  return {from: line.from + range.start.character, to: line.from + range.end.character}
}

function renderDocInfo(client: LSPClient, view: EditorView, doc: string | lsp.MarkupContent) {
  let elt = document.createElement("div")
  elt.className = "cm-lsp-documentation cm-lsp-completion-documentation"
  elt.innerHTML = client.docToHTML(view, doc)
  return elt
}

const kindToType: {[kind: number]: string} = {
  1: "text", // Text
  2: "method", // Method
  3: "function", // Function
  4: "class", // Constructor
  5: "property", // Field
  6: "variable", // Variable
  7: "class", // Class
  8: "interface", // Interface
  9: "namespace", // Module
  10: "property", // Property
  11: "keyword", // Unit
  12: "constant", // Value
  13: "constant", // Enum
  14: "keyword", // Keyword
  16: "constant", // Color
  20: "constant", // EnumMember
  21: "constant", // Constant
  22: "class", // Struct
  25: "type" // TypeParameter
}
