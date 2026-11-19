// Any paragraph or list item that starts with "TODO(harshitha)" gets class="todo",
// so unfinished placeholders are impossible to miss on the page.
const text = (n) => (n.type === 'text' ? n.value : (n.children || []).map(text).join(''));
export function rehypeTodo() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'element' && ['p', 'li'].includes(node.tagName) && text(node).trim().startsWith('TODO(harshitha)')) {
        node.properties ||= {};
        node.properties.className = [...(node.properties.className || []), 'todo'];
      }
      (node.children || []).forEach(walk);
    };
    walk(tree);
  };
}
