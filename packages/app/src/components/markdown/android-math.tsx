// Android's release APK omits the optional native TeX library.
// Other platforms keep their existing Markdown renderer.
export function splitMath(source: string): { kind: string; source: string }[] {
  return [{ kind: "markdown", source }];
}
export function MathParagraph(_props: { html: string }) { return null; }
