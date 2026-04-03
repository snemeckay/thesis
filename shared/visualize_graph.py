"""Graph-based visualisation of a Declare4Py DECLARE model.

Parses the serialised constraint strings from a ``DeclareModel`` and
builds a directed NetworkX graph where activities are nodes and binary
constraints are labelled edges.  Unary constraints (e.g. Existence,
Init) are rendered as small text annotations below the corresponding
node.

Output is a PNG saved to the requested path.
"""

from pathlib import Path
import re

import networkx as nx
import matplotlib.pyplot as plt

# matches ``Response[A,B]`` or ``Existence1[A]``.
CONSTRAINT_RE = re.compile(r"^(\w+)\[([^\]]*)\]")


def visualize_declare_graph(model, out_path: Path) -> None:
    """Render a Declare4Py DeclareModel as a directed activity graph.

    Parses ``model.serialized_constraints``, adds each activity as a node,
    and each binary constraint as a directed edge labelled with the template
    name.  Unary constraints are shown as text annotations on the node.

    Args:
        model:    A Declare4Py ``DeclareModel`` with a
                  ``serialized_constraints`` attribute.
        out_path: Destination path for the PNG image.  Parent directories
                  are created automatically.
    """
    G = nx.DiGraph()

    for s in model.serialized_constraints:
        if not isinstance(s, str):
            continue

        m = CONSTRAINT_RE.match(s.strip())
        if not m:
            continue

        template = m.group(1)
        args = [a.strip() for a in m.group(2).split(",") if a.strip()]

        if len(args) == 1:
            a1 = args[0]
            G.add_node(a1)
            existing = G.nodes[a1].get("unary", [])
            existing.append(template)
            G.nodes[a1]["unary"] = existing

        elif len(args) >= 2:
            a1, a2 = args[0], args[1]
            if a1:
                G.add_node(a1)
            if a2:
                G.add_node(a2)
            if a1 and a2 and a1 != a2:
                G.add_edge(a1, a2, label=template)

    if len(G.nodes) == 0:
        print("No nodes in graph after parsing constraints.")
        return

    pos = nx.spring_layout(G, seed=42)

    plt.figure(figsize=(10, 7))
    nx.draw_networkx_nodes(G, pos, node_size=2000, node_color="#99c2ff")
    nx.draw_networkx_labels(G, pos, font_size=9)
    nx.draw_networkx_edges(G, pos, arrows=True, arrowstyle="->", width=1.5)

    edge_labels = {(u, v): d.get("label", "") for u, v, d in G.edges(data=True)}
    nx.draw_networkx_edge_labels(G, pos, edge_labels=edge_labels, font_size=7)

    for node, (x, y) in pos.items():
        unary = G.nodes[node].get("unary")
        if unary:
            txt = ",".join(sorted(set(unary)))
            plt.text(x, y - 0.08, txt, fontsize=6, horizontalalignment="center")

    plt.axis("off")
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    plt.tight_layout()
    plt.savefig(out_path, dpi=300)
    plt.close()
