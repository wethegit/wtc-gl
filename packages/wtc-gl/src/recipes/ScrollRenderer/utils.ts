/**
 * Tagged template literal for inline GLSL. A no-op at runtime; exists so
 * editors with a GLSL extension can syntax-highlight the string contents.
 *
 * @example
 * const frag = glsl`
 *   #version 300 es
 *   precision highp float;
 *   out vec4 colour;
 *   void main() { colour = vec4(1.); }
 * `
 */
export const glsl = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): string =>
  strings.raw.reduce(
    (acc, str, i) => acc + str + (i < values.length ? String(values[i]) : ''),
    ''
  )

/**
 * Reads GLSL source from a `<script>` element in the page. Useful when you
 * want to keep shaders inline in HTML rather than in separate `.frag` files.
 *
 * @param selector - CSS selector for the script element containing the GLSL source.
 * @throws {Error} If no element is found for the given selector.
 *
 * @example
 * // HTML: <script type="x-shader/x-fragment" id="myFrag">...</script>
 * const frag = heredoc('#myFrag')
 */
export const heredoc = (selector: string): string => {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`heredoc: no element matches "${selector}"`)
  return el.textContent ?? ''
}
