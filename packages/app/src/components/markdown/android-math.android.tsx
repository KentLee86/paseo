import { useMemo, useState } from "react";
import { useUnistyles } from "react-native-unistyles";
import { WebView } from "react-native-webview";
import MarkdownIt from "markdown-it";
import katex from "katex";
import { fromMarkdown } from "mdast-util-from-markdown";

const parser = new MarkdownIt({ html: false, breaks: true });
parser.inline.ruler.before("escape", "paseo_math", (state, silent) => {
  const { src, pos, posMax } = state;
  if (src[pos] !== "$") return false;
  const block = src[pos + 1] === "$";
  const delimiter = block ? "$$" : "$";
  const start = pos + delimiter.length;
  if (!block && /\s/.test(src[start] ?? " ")) return false;
  let end = start;
  while (end < posMax) {
    if (src[end] === "\\") { end += 2; continue; }
    if (!block && src[end] === "\n") return false;
    if (src.startsWith(delimiter, end)) break;
    end++;
  }
  if (end >= posMax || end === start || (!block && (/\s/.test(src[end - 1]!) || /\d/.test(src[end + 1] ?? "")))) return false;
  if (!silent) {
    const token = state.push("paseo_math", "", 0);
    token.content = src.slice(start, end).trim();
    token.markup = delimiter;
  }
  state.pos = end + delimiter.length;
  return true;
});
parser.renderer.rules.paseo_math = (tokens, idx) => {
  const token = tokens[idx]!;
  return katex.renderToString(token.content, { output: "mathml", displayMode: token.markup === "$$", trust: false, throwOnError: false, maxSize: 20, maxExpand: 500 });
};

// Only replace math paragraphs. Keep the native handlers for links, images, code blocks and diagrams.
export function splitMath(source: string): { kind: string; source: string }[] {
  const plain = (s: string) => ({ kind: "markdown", source: s });
  if (!source.includes("$")) return [plain(source)];
  const result = [];
  let cursor = 0;
  for (const node of fromMarkdown(source).children) {
    if (node.type !== "paragraph" || !node.position) continue;
    const start = node.position.start.offset!, end = node.position.end.offset!;
    const text = source.slice(start, end);
    if (!text.includes("$")) continue;
    const env = {};
    const tokens = parser.parseInline(text, env);
    const children = tokens[0]?.children ?? [];
    if (!children.some(t => t.type === "paseo_math") || children.some(t => t.type === "link_open" || t.type === "image")) continue;
    if (source.slice(cursor, start).trim()) result.push(plain(source.slice(cursor, start)));
    result.push({ kind: "math", source: parser.renderer.render(tokens, parser.options, env) });
    cursor = end;
  }
  if (!result.length) return [plain(source)];
  if (source.slice(cursor).trim()) result.push(plain(source.slice(cursor)));
  return result;
}

export function MathParagraph({ html }: { html: string }) {
  const { theme } = useUnistyles();
  const [height, setHeight] = useState(32);
  const source = useMemo(() => ({ html: `<!DOCTYPE html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;color:${theme.colors.foreground};background:transparent;font:16px/1.45 sans-serif}main{overflow-x:auto;padding:2px 0}math[display=block]{margin:0.3em 0}</style><main>${html}</main>` }), [html, theme.colors.foreground]);
  return <WebView source={source} style={{ height, flex: 0, backgroundColor: "transparent" }} containerStyle={{ flex: 0, height }} scrollEnabled={false} originWhitelist={["*"]} allowFileAccess={false} allowUniversalAccessFromFileURLs={false} setSupportMultipleWindows={false} onShouldStartLoadWithRequest={({ url }) => url === "about:blank" || url === "about:srcdoc"} injectedJavaScript={'new ResizeObserver(()=>window.ReactNativeWebView.postMessage(String(Math.ceil(document.querySelector("main").getBoundingClientRect().height)))).observe(document.querySelector("main"));true;'} onMessage={({ nativeEvent }) => { const n = Number(nativeEvent.data); if (Number.isFinite(n) && n > 0) setHeight(n); }} />;
}
