import type * as lsp from "vscode-languageserver-protocol"
import {marked} from "marked"

export function docToHTML(value: string | lsp.MarkupContent, defaultKind: lsp.MarkupKind) {
  let kind = defaultKind, text = value
  if (typeof text != "string") {
    kind = text.kind
    text = text.value
  }
  if (kind == "plaintext") {
    return text.replace(/[\n<&]/g, ch => ch == "\n" ? "<br>" : ch == "<" ? "&lt;" : "&amp;")
  } else {
    return marked.parse(text, {async: false, })
  }
}
