/**
 * Minimal JSX surface for the elements this plugin renders.
 *
 * OpenTUI's renderer supplies these intrinsics to TUI plugins at runtime, but
 * its typings are not part of the published plugin package. Declaring the few
 * elements actually used keeps `tsc` honest about our own code without
 * pretending to describe OpenTUI's full component API.
 */
import type { JSX as SolidJSX } from "solid-js"

type Color = string

interface Common {
  children?: SolidJSX.Element
  flexDirection?: "row" | "column"
  flexGrow?: number
  flexShrink?: number
  justifyContent?: "flex-start" | "flex-end" | "center" | "space-between"
  alignItems?: "flex-start" | "flex-end" | "center"
  gap?: number
  minWidth?: number
  width?: number | string
  height?: number
  paddingLeft?: number
  paddingRight?: number
  paddingTop?: number
  paddingBottom?: number
  border?: Array<"top" | "bottom" | "left" | "right">
  borderColor?: Color
  fg?: Color
  bg?: Color
  onMouseDown?: () => void
  onMouseUp?: () => void
}

declare global {
  namespace JSX {
    /** Rendered output is Solid's, even though the elements are OpenTUI's. */
    type Element = SolidJSX.Element

    /** Tells tsc that component children arrive as a `children` prop. */
    interface ElementChildrenAttribute {
      children: unknown
    }

    interface IntrinsicElements {
      box: Common
      text: Common & { attributes?: number }
      span: Common & { style?: { fg?: Color; bg?: Color } }
      b: { children?: SolidJSX.Element }
      scrollbox: Common & { scrollbarOptions?: { visible?: boolean } }
      markdown: Common & {
        content: string
        conceal?: boolean
        internalBlockMode?: string
        syntaxStyle?: unknown
        tableOptions?: Record<string, unknown>
        streaming?: boolean
      }
    }
  }
}
