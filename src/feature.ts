import {type LSPClient} from "./client"
import {Extension} from "@codemirror/state"

export type LSPFeature = LSPFeature[] | {
  // FIXME let them fetch client from view?
  extension: (client: LSPClient) => Extension
}
