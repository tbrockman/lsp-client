import {type LSPClient} from "./client"
import {Extension} from "@codemirror/state"

export type LSPFeature = LSPFeature[] | {
  extension: (client: LSPClient) => Extension
}
