import json
import glob
import os
import re
from pathlib import Path

# Set up paths relative to G0DM0D3RUS/graphify-out
out_dir = Path('/root/soft/G0DM0D3RUS/graphify-out')
os.chdir(out_dir)

# Step 1: Merge Chunks into .graphify_semantic_new.json
chunks = sorted(glob.glob('.graphify_chunk_*.json'))
print(f"Found {len(chunks)} chunks to merge.")

all_nodes, all_edges, all_hyperedges = [], [], []
total_in, total_out = 0, 0
for c in chunks:
    try:
        d = json.loads(Path(c).read_text(encoding='utf-8'))
        all_nodes += d.get('nodes', [])
        all_edges += d.get('edges', [])
        all_hyperedges += d.get('hyperedges', [])
        total_in += d.get('input_tokens', 0)
        total_out += d.get('output_tokens', 0)
    except Exception as e:
        print(f"Error loading {c}: {e}")

# Deduplicate semantic nodes
seen_nodes = set()
dedup_nodes = []
for n in all_nodes:
    if n['id'] not in seen_nodes:
        seen_nodes.add(n['id'])
        dedup_nodes.append(n)

semantic_new = {
    'nodes': dedup_nodes,
    'edges': all_edges,
    'hyperedges': all_hyperedges,
    'input_tokens': total_in,
    'output_tokens': total_out
}

Path('.graphify_semantic_new.json').write_text(json.dumps(semantic_new, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"Merged semantic_new: {len(dedup_nodes)} nodes, {len(all_edges)} edges")

# Step 2: Save to Cache
from graphify.cache import save_semantic_cache
saved = save_semantic_cache(semantic_new.get('nodes', []), semantic_new.get('edges', []), semantic_new.get('hyperedges', []))
print(f"Cached {saved} files")

# Step 3: Merge cached + new results into .graphify_semantic.json
cached = json.loads(Path('.graphify_cached.json').read_text(encoding='utf-8')) if Path('.graphify_cached.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}
new = json.loads(Path('.graphify_semantic_new.json').read_text(encoding='utf-8')) if Path('.graphify_semantic_new.json').exists() else {'nodes':[],'edges':[],'hyperedges':[]}

all_nodes_cached = cached['nodes'] + new.get('nodes', [])
all_edges_cached = cached['edges'] + new.get('edges', [])
all_hyperedges_cached = cached.get('hyperedges', []) + new.get('hyperedges', [])

seen_cached = set()
dedup_cached_nodes = []
for n in all_nodes_cached:
    if n['id'] not in seen_cached:
        seen_cached.add(n['id'])
        dedup_cached_nodes.append(n)

merged_semantic = {
    'nodes': dedup_cached_nodes,
    'edges': all_edges_cached,
    'hyperedges': all_hyperedges_cached,
    'input_tokens': new.get('input_tokens', 0),
    'output_tokens': new.get('output_tokens', 0)
}
Path('.graphify_semantic.json').write_text(json.dumps(merged_semantic, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"Extraction complete - {len(dedup_cached_nodes)} nodes, {len(all_edges_cached)} edges")

# Step 4: Merge AST + Semantic into final .graphify_extract.json
ast = json.loads(Path('.graphify_ast.json').read_text(encoding='utf-8'))
sem = json.loads(Path('.graphify_semantic.json').read_text(encoding='utf-8'))

seen_extract = {n['id'] for n in ast['nodes']}
merged_nodes = list(ast['nodes'])
for n in sem['nodes']:
    if n['id'] not in seen_extract:
        merged_nodes.append(n)
        seen_extract.add(n['id'])

merged_edges = ast['edges'] + sem['edges']
merged_hyperedges = sem.get('hyperedges', [])

merged_extract = {
    'nodes': merged_nodes,
    'edges': merged_edges,
    'hyperedges': merged_hyperedges,
    'input_tokens': sem.get('input_tokens', 0),
    'output_tokens': sem.get('output_tokens', 0),
}
Path('.graphify_extract.json').write_text(json.dumps(merged_extract, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"Merged final extract: {len(merged_nodes)} nodes, {len(merged_edges)} edges")

# Step 5: Build graph and cluster to find communities
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json

extraction = json.loads(Path('.graphify_extract.json').read_text(encoding='utf-8'))
detection = json.loads(Path('.graphify_detect.json').read_text(encoding='utf-8'))

G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

print(f"Found {len(communities)} communities.")
# Print top nodes for each community to help us auto-label them
for cid, nodes in sorted(communities.items()):
    print(f"\nCommunity {cid} (size: {len(nodes)}):")
    # print top 10 nodes
    for nid in nodes[:15]:
        node_obj = next((n for n in extraction['nodes'] if n['id'] == nid), None)
        if node_obj:
            print(f"  - {node_obj.get('label')} ({node_obj.get('source_file')})")
        else:
            print(f"  - {nid}")
