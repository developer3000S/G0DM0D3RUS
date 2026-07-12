import json
import os
import re
from pathlib import Path

# Paths
out_dir = Path('/root/soft/G0DM0D3RUS/graphify-out')
os.chdir(out_dir)

# Load files
extraction = json.loads(Path('.graphify_extract.json').read_text(encoding='utf-8'))
detection = json.loads(Path('.graphify_detect.json').read_text(encoding='utf-8'))

# Setup graph and cluster
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

print("Building graph...")
G = build_from_json(extraction)
print(f"Graph loaded with {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

print("Clustering graph...")
communities = cluster(G)
cohesion = score_all(G, communities)
tokens = {'input': extraction.get('input_tokens', 0), 'output': extraction.get('output_tokens', 0)}
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

# Generate temporary suggested questions for analysis saving
print("Suggesting initial questions...")
temp_labels = {cid: f'Community {cid}' for cid in communities}
temp_questions = suggest_questions(G, communities, temp_labels)

# Save analysis to .graphify_analysis.json
analysis = {
    'communities': {str(k): v for k, v in communities.items()},
    'cohesion': {str(k): v for k, v in cohesion.items()},
    'gods': gods,
    'surprises': surprises,
    'questions': temp_questions,
}
Path('.graphify_analysis.json').write_text(json.dumps(analysis, indent=2, ensure_ascii=False), encoding='utf-8')
print("Analysis saved to .graphify_analysis.json")

# Smart Auto-Labeling Function
def generate_label(cid, node_ids):
    nodes = []
    for nid in node_ids:
        node_obj = next((n for n in extraction['nodes'] if n['id'] == nid), None)
        if node_obj:
            nodes.append(node_obj)
            
    if not nodes:
        return f"Community {cid}"
        
    # If size 1, use its label directly but cleaned up
    if len(nodes) == 1:
        label = nodes[0].get('label', '')
        # Clean up () or .ts or file path additions
        label = re.sub(r'\(\)', '', label)
        label = re.sub(r'\.tsx?$', '', label)
        label = re.sub(r'\.json$', '', label)
        return label.strip()
        
    # Check for strong themes
    labels_text = " ".join([n.get('label', '') for n in nodes]).lower()
    files_text = " ".join([n.get('source_file', '') or '' for n in nodes]).lower()
    
    if 'ratelimit' in files_text or 'rate limit' in labels_text:
        return "Rate Limiting & Traffic Control"
    if 'auth' in files_text or 'tier' in files_text or 'api key auth' in labels_text:
        return "Authentication & Tier Management"
    if 'autotune' in files_text or 'autotune' in labels_text:
        if 'feedback' in files_text or 'feedback' in labels_text:
            return "Adaptive AutoTune Feedback Loop"
        return "Pre-Generation Parameter AutoTuning"
    if 'feedback' in files_text or 'feedback' in labels_text:
        return "User Feedback Collection & Analysis"
    if 'dataset' in files_text or 'dataset' in labels_text:
        return "Open Dataset Collection & Caching"
    if 'parseltongue' in files_text or 'parseltongue' in labels_text:
        return "Parseltongue Compiler & Evaluator"
    if 'stm' in files_text or 'transform' in files_text:
        return "Short-Term Memory & STM Modules"
    if 'chatinput' in files_text or 'chatarea' in files_text or 'chatmessage' in files_text:
        return "Chat Area & Chat UI Components"
    if 'sidebar' in files_text or 'selector' in files_text:
        return "Sidebar Navigation & Model Selector"
    if 'telemetry' in files_text:
        return "Privacy-Preserving Harm Telemetry"
    if 'research/' in files_text or 'eval_' in files_text:
        return "Performance Evaluation & Benchmarks"
    if 'components/' in files_text:
        return "Client-Side Frontend Components"
    if 'favicon' in files_text or 'favicon' in labels_text:
        return "Favicon & Asset Media Elements"
    if 'docker-compose' in files_text:
        return "Docker Deployment Configurations"
    if 'next.config' in files_text:
        return "Next.js Build Configurations"
    if 'libertas' in files_text or 'libertas' in labels_text:
        return "Model De-censorship and Libertas Injection"
    if 'openrouter' in files_text or 'openrouter' in labels_text:
        return "OpenRouter API Integration Proxies"
    if 'start.sh' in files_text:
        return "Server Startup Configurations"
    if 'update.sh' in files_text:
        return "Server Update Configurations"
    if 'tailwind' in files_text:
        return "Tailwind CSS Configuration Tokens"
        
    # Default: Use the label of the first node (highest degree/representative) cleaned up
    first_label = nodes[0].get('label', f"Community {cid}")
    first_label = re.sub(r'\(\)', '', first_label)
    first_label = re.sub(r'\.tsx?$', '', first_label)
    first_label = re.sub(r'\.json$', '', first_label)
    return first_label.strip()

# Construct LABELS_DICT
labels = {}
for cid, node_ids in communities.items():
    labels[cid] = generate_label(cid, node_ids)

# Save labels to file
Path('.graphify_labels.json').write_text(json.dumps({str(k): v for k, v in labels.items()}, indent=2, ensure_ascii=False), encoding='utf-8')
print("Community labels generated and saved successfully!")

# Regenerate report with community labels
print("Generating final GRAPH_REPORT.md...")
questions = suggest_questions(G, communities, labels)
report = generate(G, communities, cohesion, labels, gods, surprises, detection, tokens, '/root/soft/G0DM0D3RUS', suggested_questions=questions)
Path('GRAPH_REPORT.md').write_text(report, encoding='utf-8')
print("GRAPH_REPORT.md updated with community labels.")

# Generate HTML file
print("Generating final graph.html visualizer...")
to_html(G, communities, 'graph.html', community_labels=labels or None)
print("graph.html written successfully.")
