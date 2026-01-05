from pathlib import Path
import re

import networkx as nx
import matplotlib.pyplot as plt

CONSTRAINT_RE = re.compile(r"^(\w+)\[([^\]]*)\]")


def visualize_declare_graph(model, out_path: Path):
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
