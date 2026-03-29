import argparse
import json
import csv
from pathlib import Path
from typing import List, Dict, Any
import networkx as nx
import matplotlib.pyplot as plt

import logging
logging.getLogger("matplotlib").setLevel(logging.WARNING)


def load_relations_from_json(json_path: Path) -> List[Dict[str, Any]]:
    """Load relations from JSON file."""
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_relations_from_csv(csv_path: Path) -> List[Dict[str, Any]]:
    """Load relations from CSV file."""
    relations = []
    with open(csv_path, 'r', encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert pipe-delimited activities back to list
            row['activities'] = row['activities'].split('|') if row['activities'] else []
            # Convert numeric fields
            for field in ['support', 'confidence', 'cardinality', 'trace_count', 
                         'support_count', 'violation_count', 'activation_count', 
                         'fulfillment_count', 'activation_trace_count']:
                try:
                    row[field] = float(row[field]) if row[field] and row[field].lower() != 'none' else None
                except (ValueError, AttributeError):
                    row[field] = None
            relations.append(row)
    return relations


def filter_relations(relations: List[Dict[str, Any]], 
                    min_support: float = None,
                    min_confidence: float = None,
                    rule_types: List[str] = None,
                    min_support_count: int = None,
                    activity_filter: str = None) -> List[Dict[str, Any]]:
    """
    Filter relations by various criteria.
    
    Args:
        relations: List of relation dicts
        min_support: Minimum support ratio (0-1)
        min_confidence: Minimum confidence ratio (0-1)
        rule_types: List of rule types to include (e.g., ['Condition', 'Response'])
        min_support_count: Minimum number of times this relation appears in traces
        activity_filter: Filter by activity name (substring match in activities list)
    
    Returns:
        Filtered list of relations
    """
    filtered = relations
    
    if min_support is not None:
        filtered = [r for r in filtered if r.get('support') and r['support'] >= min_support]
    
    if min_confidence is not None:
        filtered = [r for r in filtered if r.get('confidence') and r['confidence'] >= min_confidence]
    
    if rule_types is not None:
        filtered = [r for r in filtered if r.get('rule_type') in rule_types]
    
    if min_support_count is not None:
        filtered = [r for r in filtered 
                   if r.get('support_count') and int(r['support_count']) >= min_support_count]
    
    if activity_filter is not None:
        filtered = [r for r in filtered 
                   if any(activity_filter.lower() in str(a).lower() 
                         for a in r.get('activities', []))]
    
    return filtered


def visualize_relations_as_graph(relations: List[Dict[str, Any]], output_path: Path,
                                 figsize=(14, 10), font_size=8):
    """
    Visualize relations as a directed graph.
    
    Node size = support_count
    Edge thickness = support value
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Create directed graph
    G = nx.DiGraph()
    
    # Add edges from binary relations
    for rel in relations:
        acts = rel.get('activities', [])
        if len(acts) >= 2:
            source = str(acts[0])
            target = str(acts[1])
            support = float(rel.get('support', 0.1))
            support_count = int(rel.get('support_count', 1)) if rel.get('support_count') else 1
            
            G.add_edge(source, target, 
                      weight=support,
                      count=support_count,
                      rule_type=rel.get('rule_type', 'Unknown'),
                      rule_id=rel.get('rule_id', ''))
    
    if len(G.nodes()) == 0:
        print("No relations to visualize (empty graph)")
        return
    
    # Create visualization
    fig, ax = plt.subplots(figsize=figsize)
    
    # Layout
    pos = nx.spring_layout(G, k=2, iterations=50, seed=42)
    
    # Node sizes based on degree
    node_sizes = [G.degree(node) * 300 + 500 for node in G.nodes()]
    
    # Draw nodes
    nx.draw_networkx_nodes(G, pos, node_size=node_sizes, 
                          node_color='lightblue', ax=ax)
    
    # Draw edges with varying thickness
    edges = G.edges()
    weights = [G[u][v]['weight'] * 5 for u, v in edges]
    
    nx.draw_networkx_edges(G, pos, width=weights, alpha=0.6, 
                          edge_color='gray', ax=ax,
                          arrowsize=15, arrowstyle='->')
    
    # Draw labels
    nx.draw_networkx_labels(G, pos, font_size=font_size, ax=ax)
    
    ax.set_title(f"Process Relations Graph\n({len(G.nodes())} activities, {len(G.edges())} relations)")
    ax.axis('off')
    plt.tight_layout()
    
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    print(f">> Saved graph visualization to {output_path}")
    plt.close()


def print_relations_summary(relations: List[Dict[str, Any]]):
    """Print summary statistics of relations."""
    if not relations:
        print("No relations to display")
        return
    
    print(f"\n{'='*80}")
    print(f"RELATIONS SUMMARY ({len(relations)} total)")
    print(f"{'='*80}\n")
    
    # Group by rule type
    by_type = {}
    for rel in relations:
        rule_type = rel.get('rule_type', 'Unknown')
        by_type.setdefault(rule_type, []).append(rel)
    
    for rule_type in sorted(by_type.keys()):
        rels = by_type[rule_type]
        print(f"{rule_type}: {len(rels)} relations")
        print(f"  Support (min/avg/max): {min(r.get('support', 0) for r in rels):.3f} / "
              f"{sum(r.get('support', 0) for r in rels) / len(rels):.3f} / "
              f"{max(r.get('support', 0) for r in rels):.3f}")
        print()


def main():
    parser = argparse.ArgumentParser(
        description="Visualize and filter discovered process relations"
    )
    
    parser.add_argument("input", 
                       help="Path to JSON or CSV file with relations")
    
    parser.add_argument("--output", "-o",
                       help="Output path for visualization PNG (default: input_filtered.png)",
                       default=None)
    
    parser.add_argument("--min-support", type=float, default=None,
                       help="Minimum support ratio (0-1)")
    
    parser.add_argument("--min-confidence", type=float, default=None,
                       help="Minimum confidence ratio (0-1)")
    
    parser.add_argument("--rule-types", type=str, default=None,
                       help="Comma-separated rule types to include (e.g., 'Condition,Response')")
    
    parser.add_argument("--min-count", type=int, default=None,
                       help="Minimum support count (number of times relation appears)")
    
    parser.add_argument("--activity", "-a", type=str, default=None,
                       help="Filter by activity name (substring match)")
    
    parser.add_argument("--print-only", action="store_true",
                       help="Only print summary, don't create visualization")
    
    parser.add_argument("--figsize", type=str, default="14,10",
                       help="Figure size as 'width,height' (default: 14,10)")
    
    args = parser.parse_args()
    
    # Load relations
    input_path = Path(args.input)
    if input_path.suffix.lower() == '.json':
        relations = load_relations_from_json(input_path)
    elif input_path.suffix.lower() == '.csv':
        relations = load_relations_from_csv(input_path)
    else:
        print(f"Error: Unsupported file type {input_path.suffix}")
        return
    
    print(f">> Loaded {len(relations)} relations from {input_path}")
    
    # Parse filters
    rule_types = None
    if args.rule_types:
        rule_types = [t.strip() for t in args.rule_types.split(',')]
    
    figsize = tuple(map(int, args.figsize.split(',')))
    
    # Filter
    filtered = filter_relations(
        relations,
        min_support=args.min_support,
        min_confidence=args.min_confidence,
        rule_types=rule_types,
        min_support_count=args.min_count,
        activity_filter=args.activity
    )
    
    print(f">> After filtering: {len(filtered)} relations")
    
    # Print summary
    print_relations_summary(filtered)
    
    # Visualize
    if not args.print_only and len(filtered) > 0:
        if args.output:
            output_path = Path(args.output)
        else:
            stem = input_path.stem
            output_path = input_path.parent / f"{stem}_filtered.png"
        
        visualize_relations_as_graph(filtered, output_path, figsize=figsize)
    elif len(filtered) == 0:
        print("No relations to visualize after filtering")


if __name__ == "__main__":
    main()
