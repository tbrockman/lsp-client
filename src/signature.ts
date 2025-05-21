import type * as lsp from "vscode-languageserver-protocol"
import {StateField, StateEffect, Prec, Extension} from "@codemirror/state"
import {EditorView, ViewPlugin, ViewUpdate, keymap, Tooltip, showTooltip, Command} from "@codemirror/view"
import {LSPClient} from "./client.js"
import {lspPlugin} from "./plugin.js"

const signaturePlugin = ViewPlugin.fromClass(class {
  activeRequest: {pos: number, drop: boolean} | null = null
  delayedRequest: number = 0

  update(update: ViewUpdate) {
    if (this.activeRequest) {
      if (update.selectionSet) {
        this.activeRequest.drop = true
        this.activeRequest = null
      } else if (update.docChanged) {
        this.activeRequest.pos = update.changes.mapPos(this.activeRequest.pos)
      }
    }

    const plugin = update.view.plugin(lspPlugin)
    if (!plugin) return
    let sigState = update.view.state.field(signatureState)
    if (sigState) {
      if (update.selectionSet) {
        if (this.delayedRequest) clearTimeout(this.delayedRequest)
        this.delayedRequest = setTimeout(() => {
          this.startRequest(plugin.client, update.view, {
            triggerKind: 3 /* ContentChange */,
            isRetrigger: true,
            activeSignatureHelp: sigState.data,
          })
        }, 250)
      }
    } else if (update.docChanged && update.transactions.some(tr => tr.isUserEvent("input.type"))) {
      const serverConf = plugin.client.serverCapabilities?.signatureHelpProvider
      if (serverConf && serverConf.triggerCharacters) {
        let triggered: string | undefined
        update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
          let ins = inserted.toString()
          if (ins) for (let ch of serverConf.triggerCharacters!) {
            if (ins.indexOf(ch) > -1) triggered = ch
          }
        })
        if (triggered) this.startRequest(plugin.client, update.view, {
          triggerKind: 2 /* TriggerCharacter */,
          isRetrigger: false,
          triggerCharacter: triggered,
        })
      }
    }
  }

  startRequest(client: LSPClient, view: EditorView, context: lsp.SignatureHelpContext) {
    if (this.delayedRequest) clearTimeout(this.delayedRequest)
    let pos = view.state.selection.main.head
    if (this.activeRequest) this.activeRequest.drop = true
    let req = this.activeRequest = {pos, drop: false}
    client.signatureHelp(view, pos, context).then(result => {
      if (req.drop) return
      if (result && result.signatures.length) {
        let cur = view.state.field(signatureState)
        let same = cur && sameSignatures(cur.data, result)
        let active = same && context.triggerKind == 3 ? cur!.active : result.activeSignature ?? 0
        // Don't update at all if nothing changed
        if (same && sameActiveParam(cur!.data, result, active)) return
        view.dispatch({effects: signatureEffect.of({
          data: result,
          active,
          pos: same ? cur!.tooltip.pos : req.pos
        })})
      } else if (view.state.field(signatureState)) {
        view.dispatch({effects: signatureEffect.of(null)})
      }
    })
  }

  destroy() {
    if (this.delayedRequest) clearTimeout(this.delayedRequest)
    if (this.activeRequest) this.activeRequest.drop = true
  }
})

function sameSignatures(a: lsp.SignatureHelp, b: lsp.SignatureHelp) {
  if (a.signatures.length != b.signatures.length) return false
  return a.signatures.every((s, i) => s.label == b.signatures[i].label)
}

function sameActiveParam(a: lsp.SignatureHelp, b: lsp.SignatureHelp, active: number) {
  return (a.signatures[active].activeParameter ?? a.activeParameter) ==
    (b.signatures[active].activeParameter ?? b.activeParameter)
}

class SignatureState {
  constructor(
    readonly data: lsp.SignatureHelp,
    readonly active: number,
    readonly tooltip: Tooltip
  ) {}
}

const signatureState = StateField.define<SignatureState | null>({
  create() { return null },
  update(sig, tr) {
    for (let e of tr.effects) if (e.is(signatureEffect)) {
      if (e.value) {
        return new SignatureState(e.value.data, e.value.active, signatureTooltip(e.value.data, e.value.active, e.value.pos))
      } else {
        return null
      }
    }
    if (sig && tr.docChanged)
      return new SignatureState(sig.data, sig.active, {...sig.tooltip, pos: tr.changes.mapPos(sig.tooltip.pos)})
    return sig
  },
  provide: f => showTooltip.from(f, sig => sig && sig.tooltip)
})

const signatureEffect = StateEffect.define<{data: lsp.SignatureHelp, active: number, pos: number} | null>()

function signatureTooltip(data: lsp.SignatureHelp, active: number, pos: number): Tooltip {
  return {
    pos,
    above: true,
    create: view => drawSignatureTooltip(view, data, active)
  }
}

function drawSignatureTooltip(view: EditorView, data: lsp.SignatureHelp, active: number) {
  let dom = document.createElement("div")
  dom.className = "cm-lsp-signature-tooltip"
  if (data.signatures.length > 1) {
    dom.classList.add("cm-lsp-signature-multiple")
    let num = dom.appendChild(document.createElement("div"))
    num.className = "cm-lsp-signature-num"
    num.textContent = `${active + 1}/${data.signatures.length}`
  }

  let signature = data.signatures[active]
  let sig = dom.appendChild(document.createElement("div"))
  sig.className = "cm-lsp-signature"
  let activeFrom = 0, activeTo = 0
  let activeN = signature.activeParameter ?? data.activeParameter
  let activeParam = activeN != null && signature.parameters ? signature.parameters[activeN] : null
  if (activeParam && Array.isArray(activeParam.label)) {
    ;[activeFrom, activeTo] = activeParam.label
  } else if (activeParam) {
    let found = signature.label.indexOf(activeParam.label as string)
    if (found > -1) {
      activeFrom = found
      activeTo = found + activeParam.label.length
    }
  }
  if (activeTo) {
    sig.appendChild(document.createTextNode(signature.label.slice(0, activeFrom)))
    let activeElt = sig.appendChild(document.createElement("span"))
    activeElt.className = "cm-lsp-active-parameter"
    activeElt.textContent = signature.label.slice(activeFrom, activeTo)
    sig.appendChild(document.createTextNode(signature.label.slice(activeTo)))
  } else {
    sig.textContent = signature.label
  }
  if (signature.documentation) {
    let plugin = view.plugin(lspPlugin)
    if (plugin) {
      let docs = dom.appendChild(document.createElement("div"))
      docs.className = "cm-lsp-signature-documentation cm-lsp-documentation"
      docs.innerHTML = plugin.client.docToHTML(view, signature.documentation)
    }
  }
  return {dom}
}

export const showSignatureHelp: Command = view => {
  let plugin = view.plugin(signaturePlugin)
  let field = view.state.field(signatureState)
  if (!plugin || field === undefined) return false
  let client = view.plugin(lspPlugin)?.client
  if (!client) return false
  plugin.startRequest(client, view, {
    triggerKind: 1 /* Invoked */,
    activeSignatureHelp: field ? field.data : undefined,
    isRetrigger: !!field
  })
  return true
}

export const lspNextSignature: Command = view => {
  let field = view.state.field(signatureState)
  if (!field || field.active == field.data.signatures.length - 1) return false
  view.dispatch({effects: signatureEffect.of({data: field.data, active: field.active + 1, pos: field.tooltip.pos})})
  return true
}

export const lspPrevSignature: Command = view => {
  let field = view.state.field(signatureState)
  if (!field || field.active == 0) return false
  view.dispatch({effects: signatureEffect.of({data: field.data, active: field.active - 1, pos: field.tooltip.pos})})
  return true
}

export function signatureHelp(): Extension {
  return [
    signatureState,
    signaturePlugin,
    Prec.high(keymap.of([
      {key: "Mod-Shift-Space", run: showSignatureHelp},
      {key: "Mod-Shift-ArrowUp", run: lspPrevSignature},
      {key: "Mod-Shift-ArrowDown", run: lspNextSignature},
    ]))
  ]
}
