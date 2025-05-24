import os
from flask import Flask, request, jsonify, render_template
import scanpy as sc
import anndata as ad
import pandas as pd
import numpy as np
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 * 1024  # 100GB GB limit for uploads

# Ensure upload folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Store AnnData object in memory after upload for quick access
# For a multi-user or production app, this would need a more robust session/storage mechanism
adata_cache = {} # Using a simple dict for caching, key by filename or session ID

@app.route('/')
def index():
    """Serves the main HTML page."""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handles .h5ad file uploads."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and (file.filename.endswith('.h5ad') or file.filename.endswith('.h5')):
        try:
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
            file.save(filepath)
            logger.info(f"File {file.filename} uploaded successfully.")

            # Read the AnnData object and cache it
            adata = sc.read_h5ad(filepath)
            adata_cache['current_adata'] = adata # Simple cache key for single-user demo
            logger.info(f"AnnData object read and cached: {adata.shape}")

            # Basic preprocessing if not already done (optional, depends on input data)
            # Example: Ensure counts for rank_genes_groups if using raw data
            # if 'counts' not in adata.layers and adata.X.min() >= 0:
            #     adata.layers['counts'] = adata.X.copy()
            # sc.pp.normalize_total(adata, target_sum=1e4)
            # sc.pp.log1p(adata)


            # Extract available observation keys for clustering/grouping
            obs_keys = list(adata.obs.columns)

            # Check for UMAP coordinates
            umap_available = 'X_umap' in adata.obsm

            return jsonify({
                "message": "File uploaded and processed successfully",
                "filename": file.filename,
                "shape": {"cells": adata.n_obs, "genes": adata.n_vars},
                "obs_keys": obs_keys,
                "umap_available": umap_available
            }), 200
        except Exception as e:
            logger.error(f"Error processing uploaded file: {e}", exc_info=True)
            return jsonify({"error": f"Error processing file: {str(e)}"}), 500
    else:
        return jsonify({"error": "Invalid file type. Please upload .h5ad or .h5 files"}), 400

@app.route('/get_analysis_data', methods=['GET'])
def get_analysis_data():
    """Provides UMAP coordinates and cluster data."""
    if 'current_adata' not in adata_cache:
        return jsonify({"error": "No data loaded. Please upload a file first."}), 400

    adata = adata_cache['current_adata']
    cluster_key = request.args.get('cluster_key', None)

    if not cluster_key or cluster_key not in adata.obs.columns:
        # Try to find a default or first suitable key
        potential_keys = [k for k in adata.obs.columns if adata.obs[k].nunique() < adata.n_obs / 2 and adata.obs[k].nunique() < 100]
        if potential_keys:
            cluster_key = potential_keys[0]
        else: # Fallback if no obvious cluster key
            adata.obs['default_cluster'] = 'All Cells'
            cluster_key = 'default_cluster'
        logger.info(f"No cluster_key provided or invalid, using: {cluster_key}")


    response_data = {}

    # UMAP Data
    if 'X_umap' in adata.obsm:
        umap_coords = adata.obsm['X_umap'][:, :2].tolist() # Get first two components
        response_data["umap_coords"] = umap_coords
    else:
        # If no UMAP, compute it (can be slow for large datasets)
        logger.info("X_umap not found, computing UMAP...")
        if 'X_pca' not in adata.obsm:
            logger.info("PCA not found, computing PCA...")
            sc.tl.pca(adata, svd_solver='arpack', n_comps=min(50, adata.n_obs-1, adata.n_vars-1))
        sc.pp.neighbors(adata, n_neighbors=10, n_pcs=min(30, adata.obsm['X_pca'].shape[1])) # Adjust n_pcs
        sc.tl.umap(adata)
        umap_coords = adata.obsm['X_umap'][:, :2].tolist()
        response_data["umap_coords"] = umap_coords
        logger.info("UMAP computation complete.")

    # Cluster Data for UMAP coloring
    if cluster_key in adata.obs:
        clusters = adata.obs[cluster_key].astype(str).tolist() # Ensure string for JSON
        response_data["clusters"] = clusters
        response_data["cluster_key_used"] = cluster_key
        response_data["unique_cluster_values"] = sorted(list(adata.obs[cluster_key].astype(str).unique()))
    else:
        return jsonify({"error": f"Cluster key '{cluster_key}' not found in observations."}), 400

    # Gene Names
    response_data["gene_names"] = list(adata.var_names)

    return jsonify(response_data), 200


@app.route('/run_de', methods=['POST'])
def run_differential_expression():
    """Runs differential expression using Scanpy."""
    if 'current_adata' not in adata_cache:
        return jsonify({"error": "No data loaded. Please upload a file first."}), 400

    adata = adata_cache['current_adata']
    data = request.get_json()

    group_by_key = data.get('groupByKey')
    group1_value = data.get('group1Value')
    group2_value = data.get('group2Value') # Can be "ALL_OTHER_CELLS"

    if not all([group_by_key, group1_value, group2_value]):
        return jsonify({"error": "Missing parameters: groupByKey, group1Value, or group2Value"}), 400

    if group_by_key not in adata.obs.columns:
        return jsonify({"error": f"Grouping key '{group_by_key}' not found in observations."}), 400

    try:
        logger.info(f"Running DE: Group Key='{group_by_key}', Group1='{group1_value}', Group2='{group2_value}'")

        # Ensure the grouping column is categorical and string type for safety with rank_genes_groups
        adata.obs[group_by_key] = adata.obs[group_by_key].astype('category').astype(str)

        if group2_value == "ALL_OTHER_CELLS":
            # rank_genes_groups handles 'rest' comparison directly if you give one group
            sc.tl.rank_genes_groups(adata, groupby=group_by_key, groups=[group1_value], reference='rest', method='wilcoxon', corr_method='benjamini-hochberg', use_raw=False)
            # use_raw=False means use adata.X (which might be log-normalized).
            # If you have raw counts in adata.layers['counts'] and want to use that, set up rank_genes_groups accordingly
            # or ensure adata.X contains the data you want for DE (e.g. normalized but not log-transformed for some methods)
            # Scanpy's default for wilcoxon often expects non-log data, but can work on log if interpretation is careful.
            # For simplicity, we use adata.X. If it's log-transformed, logFC might be differences of logs.
        else:
            sc.tl.rank_genes_groups(adata, groupby=group_by_key, groups=[group1_value], reference=group2_value, method='wilcoxon', corr_method='benjamini-hochberg', use_raw=False)

        # Extract results for the specified comparison
        # The results are structured by group. If group1_value was 'A', results for A vs ref are under 'A'.
        result_group_key = str(group1_value) # rank_genes_groups stores results under the group name

        de_results_df = pd.DataFrame({
            'gene': adata.uns['rank_genes_groups']['names'][result_group_key],
            'logFC': adata.uns['rank_genes_groups']['logfoldchanges'][result_group_key],
            'pValue': adata.uns['rank_genes_groups']['pvals'][result_group_key],
            'adjPValue': adata.uns['rank_genes_groups']['pvals_adj'][result_group_key],
            'scores': adata.uns['rank_genes_groups']['scores'][result_group_key] # Wilcoxon U-statistic or t-statistic
        })
        
        # Replace NaN with None for JSON compatibility, or handle them appropriately
        de_results_df = de_results_df.replace({np.nan: None})
        
        logger.info(f"DE complete. Found {len(de_results_df)} DE genes for group {group1_value}.")
        return jsonify(de_results_df.to_dict(orient='records')), 200

    except Exception as e:
        logger.error(f"Error during differential expression: {e}", exc_info=True)
        return jsonify({"error": f"Error during DE: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0') # host='0.0.0.0' to be accessible on network