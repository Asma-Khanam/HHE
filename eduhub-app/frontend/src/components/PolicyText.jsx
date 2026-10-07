// Renders the simple text format the team types in the Settings editor:
//   ## Heading      a section heading
//   - item          a bullet (consecutive lines make one list)
//   blank line      new paragraph
// Everything else is a paragraph. Plain text only -- nothing typed here can
// inject HTML.
export default function PolicyText({ text }) {
  const blocks = [];
  let list = null;
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "ul", items: list });
    list = null;
  };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
    } else if (line.startsWith("## ")) {
      flushPara();
      flushList();
      blocks.push({ type: "h", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      flushPara();
      (list = list || []).push(line.slice(2));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks.map((b, i) =>
    b.type === "h" ? (
      <h2 key={i}>{b.text}</h2>
    ) : b.type === "ul" ? (
      <ul key={i}>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
    ) : (
      <p key={i}>{b.text}</p>
    )
  );
}
