document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const uploadButton = document.getElementById('upload-button');
    const fileInfo = document.getElementById('file-info');
    const loader = document.getElementById('loader');

    const analysisControlsSection = document.getElementById('analysis-controls');
    const clusterSelectUmap = document.getElementById('cluster-select-umap');
    const fetchAnalysisDataButton = document.getElementById('fetch-analysis-data-button');
    const umapPlotDiv = document.getElementById('umap-plot');

    const deSection = document.getElementById('de-section');
    const group1Select = document.getElementById('group1-select');
    const group2Select = document.getElementById('group2-select');
    const pvalThresholdInput = document.getElementById('pval-threshold');
    const logfcThresholdInput = document.getElementById('logfc-threshold');
    const topKGenesInput = document.getElementById('top-k-genes');
    const runDEbutton = document.getElementById('run-de-button');
    const volcanoPlotDiv = document.getElementById('volcano-plot');
    const deStatus = document.getElementById('de-status');

    let currentObsKeys = [];
    let currentGeneNames = [];
    let currentUniqueClusterValuesForDE = {}; // Store unique values for each obs_key for DE dropdowns

    function showLoader(text = "Processing...") {
        loader.textContent = text;
        loader.style.display = 'block';
    }

    function hideLoader() {
        loader.style.display = 'none';
    }

    uploadButton.addEventListener('click', async () => {
        if (!fileInput.files || fileInput.files.length === 0) {
            fileInfo.textContent = 'Please select a file first.';
            return;
        }
        const file = fileInput.files[0];
        if (!file.name.endsWith('.h5ad') && !file.name.endsWith('.h5')) {
            fileInfo.textContent = 'Error: Please upload a .h5ad or .h5 file.';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        showLoader(`Uploading and processing ${file.name}...`);
        fileInfo.textContent = `Uploading ${file.name}...`;
        uploadButton.disabled = true;

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                fileInfo.textContent = `File ${result.filename} processed. Shape: ${result.shape.cells} cells x ${result.shape.genes} genes.`;
                currentObsKeys = result.obs_keys || [];
                populateClusterUmapSelector(currentObsKeys);
                analysisControlsSection.style.display = 'block';
                deSection.style.display = 'block'; // Show DE section for group selection
                // Trigger fetching initial UMAP/DE group data
                if (currentObsKeys.length > 0) {
                    fetchAndDisplayAnalysisData(currentObsKeys[0]);
                }
            } else {
                fileInfo.textContent = `Error: ${result.error || 'Upload failed'}`;
                analysisControlsSection.style.display = 'none';
                deSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Upload error:', error);
            fileInfo.textContent = 'Upload error. See console for details.';
            analysisControlsSection.style.display = 'none';
            deSection.style.display = 'none';
        } finally {
            hideLoader();
            uploadButton.disabled = false;
        }
    });

    function populateClusterUmapSelector(obsKeys) {
        clusterSelectUmap.innerHTML = '';
        obsKeys.forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            clusterSelectUmap.appendChild(option);
        });
    }

    fetchAnalysisDataButton.addEventListener('click', () => {
        const selectedKey = clusterSelectUmap.value;
        if (selectedKey) {
            fetchAndDisplayAnalysisData(selectedKey);
        } else {
            fileInfo.textContent = "Please select a clustering key first.";
        }
    });

    async function fetchAndDisplayAnalysisData(clusterKey) {
        showLoader(`Fetching UMAP and group data for '${clusterKey}'...`);
        try {
            const response = await fetch(`/get_analysis_data?cluster_key=${encodeURIComponent(clusterKey)}`);
            const data = await response.json();

            if (response.ok) {
                if (data.umap_coords && data.clusters) {
                    plotUmap(data.umap_coords, data.clusters, data.cluster_key_used);
                } else {
                    umapPlotDiv.innerHTML = "UMAP data not available or not computed.";
                }
                currentGeneNames = data.gene_names || [];
                populateDEGroupSelectors(data.cluster_key_used, data.unique_cluster_values || []);
                currentUniqueClusterValuesForDE[data.cluster_key_used] = data.unique_cluster_values || [];

            } else {
                fileInfo.textContent = `Error fetching analysis data: ${data.error || 'Unknown error'}`;
                umapPlotDiv.innerHTML = '';
            }
        } catch (error) {
            console.error('Error fetching analysis data:', error);
            fileInfo.textContent = 'Error fetching analysis data. See console.';
            umapPlotDiv.innerHTML = '';
        } finally {
            hideLoader();
        }
    }
    
    clusterSelectUmap.addEventListener('change', () => {
        // When UMAP coloring key changes, also update DE group dropdowns if those values are already fetched
        const selectedKey = clusterSelectUmap.value;
        if (currentUniqueClusterValuesForDE[selectedKey]) {
            populateDEGroupSelectors(selectedKey, currentUniqueClusterValuesForDE[selectedKey]);
        } else {
            // If not fetched yet, the "Show UMAP / Update Groups" button will trigger it
            group1Select.innerHTML = '<option value="">Select Group 1</option>';
            group2Select.innerHTML = '<option value="">Select Group 2</option>';
        }
    });


    function populateDEGroupSelectors(obsKey, uniqueValues) {
        group1Select.innerHTML = '';
        group2Select.innerHTML = '';

        uniqueValues.forEach(val => {
            const option = document.createElement('option');
            option.value = val;
            option.textContent = String(val); // Ensure it's a string
            group1Select.appendChild(option.cloneNode(true));
            group2Select.appendChild(option.cloneNode(true));
        });

        const allOtherOption = document.createElement('option');
        allOtherOption.value = "ALL_OTHER_CELLS";
        allOtherOption.textContent = "All Other Cells";
        group2Select.appendChild(allOtherOption);
        if (uniqueValues.length > 1) { // Sensible default if multiple groups exist
             group1Select.value = uniqueValues[0];
             group2Select.value = uniqueValues[1] || "ALL_OTHER_CELLS";
        } else if (uniqueValues.length === 1) {
            group1Select.value = uniqueValues[0];
            group2Select.value = "ALL_OTHER_CELLS";
        }
    }


    function plotUmap(umapCoords, clusters, clusterKey) {
        const uniqueClusterLabels = [...new Set(clusters)].sort();
        const traces = uniqueClusterLabels.map(label => {
            const indices = clusters.map((c, i) => String(c) === String(label) ? i : -1).filter(i => i !== -1);
            return {
                x: indices.map(i => umapCoords[i][0]),
                y: indices.map(i => umapCoords[i][1]),
                mode: 'markers',
                type: 'scattergl',
                name: String(label),
                text: indices.map(i => `Cell Index: ${i}<br>Cluster: ${label}`),
                marker: { size: 5, opacity: 0.8 }
            };
        });

        const layout = {
            title: `UMAP colored by ${clusterKey}`,
            xaxis: { title: 'UMAP 1' },
            yaxis: { title: 'UMAP 2' },
            margin: { t: 50, b: 40, l: 40, r: 20 },
            hovermode: 'closest',
            legend: { traceorder: 'normal' }
        };
        Plotly.newPlot(umapPlotDiv, traces, layout, {responsive: true});
    }

    runDEbutton.addEventListener('click', async () => {
        const groupByKey = clusterSelectUmap.value; // DE groups based on the UMAP coloring key
        const group1Value = group1Select.value;
        const group2Value = group2Select.value;

        if (!groupByKey || !group1Value || !group2Value) {
            deStatus.textContent = "Please select groups for DE analysis.";
            return;
        }
        if (group1Value === group2Value && group2Value !== "ALL_OTHER_CELLS") {
            deStatus.textContent = "Error: Group 1 and Group 2 cannot be the same unless comparing to 'All Other Cells'.";
            return;
        }

        showLoader("Running differential expression...");
        deStatus.textContent = "Running differential expression... this may take a moment.";
        volcanoPlotDiv.innerHTML = ''; // Clear previous plot
        runDEbutton.disabled = true;

        try {
            const response = await fetch('/run_de', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupByKey, group1Value, group2Value }),
            });
            const deResults = await response.json();

            if (response.ok) {
                if (deResults.length === 0) {
                     deStatus.textContent = "Differential expression complete. No differentially expressed genes found with current criteria or groups might be too similar.";
                } else {
                    deStatus.textContent = `Differential expression complete. ${deResults.length} gene results returned.`;
                }
                // Ensure gene names are mapped correctly if DE results don't include them directly
                // (Scanpy results from rank_genes_groups usually have 'names' which are gene names)
                const resultsWithNames = deResults.map(res => ({
                    ...res,
                    gene: res.gene || "Unknown Gene", // Fallback if gene name isn't in result object
                    negLog10AdjPValue: (res.adjPValue > 0 && res.adjPValue <= 1) ? -Math.log10(res.adjPValue) : (res.adjPValue === 0 ? 50 : 0) // Handle p_adj=0 as highly significant
                }));
                plotVolcano(resultsWithNames, parseFloat(pvalThresholdInput.value), parseFloat(logfcThresholdInput.value), parseInt(topKGenesInput.value));
            } else {
                deStatus.textContent = `Error running DE: ${deResults.error || 'Unknown error'}`;
            }
        } catch (error) {
            console.error('DE error:', error);
            deStatus.textContent = 'Error running DE. See console for details.';
        } finally {
            hideLoader();
            runDEbutton.disabled = false;
        }
    });

    function plotVolcano(deResults, adjPValNegLog10Thresh, logFCThresh, topK) {
        const significantUp = { x: [], y: [], text: [], genes: [] };
        const significantDown = { x: [], y: [], text: [], genes: [] };
        const notSignificant = { x: [], y: [], text: [], genes: [] };

        deResults.forEach(res => {
            // Ensure values are numbers before toFixed
            const logFC = Number(res.logFC);
            const negLog10AdjPVal = Number(res.negLog10AdjPValue);
            const adjPVal = Number(res.adjPValue);

            const geneInfo = `${res.gene}<br>logFC: ${logFC.toFixed(2)}<br>-log10(adjP): ${negLog10AdjPVal.toFixed(2)}<br>adjP: ${adjPVal !== null ? adjPVal.toExponential(2) : 'N/A'}`;

            if (negLog10AdjPVal >= adjPValNegLog10Thresh && Math.abs(logFC) >= logFCThresh) {
                if (logFC > 0) {
                    significantUp.x.push(logFC);
                    significantUp.y.push(negLog10AdjPVal);
                    significantUp.text.push(geneInfo);
                    significantUp.genes.push({name: res.gene, logFC: logFC, pvalScore: negLog10AdjPVal});
                } else {
                    significantDown.x.push(logFC);
                    significantDown.y.push(negLog10AdjPVal);
                    significantDown.text.push(geneInfo);
                    significantDown.genes.push({name: res.gene, logFC: logFC, pvalScore: negLog10AdjPVal});
                }
            } else {
                notSignificant.x.push(logFC);
                notSignificant.y.push(negLog10AdjPVal);
                notSignificant.text.push(geneInfo);
                 // notSignificant.genes.push({name: res.gene, logFC: logFC, pvalScore: negLog10AdjPVal}); // Not usually labeled
            }
        });

        const traces = [
            {
                x: notSignificant.x, y: notSignificant.y, text: notSignificant.text,
                mode: 'markers', type: 'scattergl', name: 'Not Significant',
                marker: { color: 'rgba(128,128,128,0.5)', size: 5 }
            },
            {
                x: significantDown.x, y: significantDown.y, text: significantDown.text,
                mode: 'markers', type: 'scattergl', name: `Down (adj.p < ${Math.pow(10, -adjPValNegLog10Thresh).toExponential(1)}, |logFC| >= ${logFCThresh})`,
                marker: { color: 'rgba(0,0,255,0.7)', size: 7 }
            },
            {
                x: significantUp.x, y: significantUp.y, text: significantUp.text,
                mode: 'markers', type: 'scattergl', name: `Up (adj.p < ${Math.pow(10, -adjPValNegLog10Thresh).toExponential(1)}, |logFC| >= ${logFCThresh})`,
                marker: { color: 'rgba(255,0,0,0.7)', size: 7 }
            }
        ];

        const annotations = [];
        // Label top K genes (more significant = higher -log10(adjP) and larger |logFC|)
        const combinedSignificant = [
            ...significantUp.genes.map(g => ({...g, score: g.pvalScore + Math.abs(g.logFC) * 2, color: 'red'})),
            ...significantDown.genes.map(g => ({...g, score: g.pvalScore + Math.abs(g.logFC) * 2, color: 'blue'}))
        ];
        combinedSignificant.sort((a, b) => b.score - a.score);

        const topGenesToLabel = combinedSignificant.slice(0, topK);

        topGenesToLabel.forEach(gene => {
            annotations.push({
                x: gene.logFC,
                y: gene.pvalScore,
                xref: 'x',
                yref: 'y',
                text: gene.name,
                showarrow: true,
                arrowhead: 2,
                ax: 0,
                ay: -25 - (Math.random() * 15), // Add some jitter to y offset
                font: {
                    color: gene.color, // Color label same as dot
                    size: 10
                },
                arrowcolor: gene.color,
            });
        });

        const allYValues = deResults.map(r => r.negLog10AdjPValue).filter(y => isFinite(y) && y !== null);
        const maxYValue = allYValues.length > 0 ? Math.max(...allYValues) : adjPValNegLog10Thresh + 5;
        const allXValues = deResults.map(r => r.logFC).filter(x => isFinite(x) && x !== null);
        const minXValue = allXValues.length > 0 ? Math.min(...allXValues) : -logFCThresh -1;
        const maxXValue = allXValues.length > 0 ? Math.max(...allXValues) : logFCThresh + 1;


        const layout = {
            title: `Volcano Plot: ${group1Select.selectedOptions[0].text} vs ${group2Select.selectedOptions[0].text}`,
            xaxis: { title: 'log2(Fold Change)', range: [minXValue - 0.5, maxXValue + 0.5]},
            yaxis: { title: '-log10(Adjusted P-value)', range: [0, maxYValue + maxYValue*0.1]}, // Add some padding to y-axis
            hovermode: 'closest',
            annotations: annotations,
            shapes: [
                { type: 'line', x0: logFCThresh, y0: 0, x1: logFCThresh, y1: maxYValue + maxYValue*0.1, line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash'} },
                { type: 'line', x0: -logFCThresh, y0: 0, x1: -logFCThresh, y1: maxYValue + maxYValue*0.1, line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash'} },
                { type: 'line', x0: minXValue - 0.5, y0: adjPValNegLog10Thresh, x1: maxXValue + 0.5, y1: adjPValNegLog10Thresh, line: { color: 'rgba(0,0,0,0.5)', width: 1, dash: 'dash'} }
            ],
            legend: {
                orientation: 'h',
                yanchor: 'bottom',
                y: 1.02,
                xanchor: 'right',
                x: 1
            }
        };
        Plotly.newPlot(volcanoPlotDiv, traces, layout, {responsive: true});

        // Interactive gene selection
        volcanoPlotDiv.on('plotly_click', function(data){
            if(data.points.length > 0) {
                const point = data.points[0];
                const geneName = point.text.split('<br>')[0]; // Extract gene name from hover text
                // You can do something with the geneName here, e.g., display more info, link to GeneCards, etc.
                alert(`You clicked on gene: ${geneName}\nlogFC: ${point.x.toFixed(3)}\n-log10(adjP): ${point.y.toFixed(3)}`);
            }
        });
    }
});