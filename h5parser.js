// h5parser.js - Handles parsing h5ad files using h5wasm

// Import h5wasm from CDN
const h5wasmUrl = "https://cdn.jsdelivr.net/npm/h5wasm@0.4.9/dist/esm/hdf5_hl.js";

// Global variables to store h5wasm and file references
let h5wasm = null;
let FS = null;
let h5File = null;
let isFileLoaded = false;
let fileName = 'h5ad_data.h5';

// Initialize h5wasm
async function initH5wasm() {
    if (h5wasm !== null) return;
    
    try {
        // Dynamically import h5wasm
        const h5wasmModule = await import(h5wasmUrl);
        h5wasm = h5wasmModule.default;
        
        // Wait for h5wasm to be ready
        const module = await h5wasm.ready;
        FS = module.FS;
        
        console.log("h5wasm initialized successfully");
    } catch (error) {
        console.error("Error initializing h5wasm:", error);
        throw error;
    }
}

// Load h5ad file into memory
async function loadH5ADFile(file) {
    try {
        // Initialize h5wasm if not already done
        await initH5wasm();
        
        // Close existing file if open
        if (h5File) {
            try {
                h5File.close();
                console.log("Closed existing file");
            } catch (e) {
                console.warn("Error closing existing file:", e);
            }
            
            // Clean up previous file
            try {
                FS.unlink(fileName);
            } catch (e) {
                console.warn("Could not unlink previous file:", e);
            }
        }
        
        // Read the file into an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Write the file to the virtual filesystem
        FS.writeFile(fileName, new Uint8Array(arrayBuffer));
        
        // Open the file for reading
        h5File = new h5wasm.File(fileName, "r");
        isFileLoaded = true;
        
        console.log("H5AD file loaded successfully");
        return true;
    } catch (error) {
        console.error("Error loading h5ad file:", error);
        isFileLoaded = false;
        return false;
    }
}

// Function to parse h5ad file and extract obs and obsm keys
async function parseH5AD(file) {
    try {
        // Load the file if not already loaded
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }
        
        // Initialize results object
        const result = {
            obs: [],
            obsm: [],
            error: null
        };
        
        // Extract obs keys
        try {
            if (h5File.get('obs') !== null) {
                result.obs = h5File.get('obs').keys();
            }
        } catch (error) {
            console.warn("Could not read obs keys:", error);
        }
        
        // Extract obsm keys
        try {
            if (h5File.get('obsm') !== null) {
                result.obsm = h5File.get('obsm').keys();
            }
        } catch (error) {
            console.warn("Could not read obsm keys:", error);
        }
        
        return result;
    } catch (error) {
        console.error("Error parsing h5ad file:", error);
        return {
            obs: [],
            obsm: [],
            error: error.toString()
        };
    }
}

// Function to get file metadata and UMAP data
async function getH5ADMetadata(file) {
    try {
        // Load the file if not already loaded
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }
        
        // Get root keys
        const rootKeys = h5File.keys();
        
        // Initialize metadata object
        const metadata = {
            rootKeys: rootKeys,
            shape: null,
            version: null,
            umapData: null
        };
        
        // Try to get shape information
        try {
            if (h5File.get('X') !== null) {
                metadata.shape = h5File.get('X').shape;
            }
        } catch (error) {
            console.warn("Could not read shape:", error);
        }
        
        // Try to get version information
        try {
            if (h5File.attrs && h5File.attrs['encoding-version']) {
                metadata.version = h5File.attrs['encoding-version'].value;
            }
        } catch (error) {
            console.warn("Could not read version:", error);
        }
        
        // Try to get UMAP data
        try {
            if (h5File.get('obsm') !== null && h5File.get('obsm').keys().includes('X_umap')) {
                const umapData = h5File.get('obsm/X_umap');
                if (umapData) {
                    metadata.umapData = {
                        shape: umapData.shape,
                        value: umapData.value,
                        dimensions: umapData.shape[1]
                    };
                }
            }
        } catch (error) {
            console.warn("Could not read UMAP data:", error);
        }
        
        return metadata;
    } catch (error) {
        console.error("Error getting h5ad metadata:", error);
        return {
            rootKeys: [],
            shape: null,
            version: null,
            umapData: null,
            error: error.toString()
        };
    }
}

// Function to extract UMAP data for plotting
async function extractUMAPData(file) {
    try {
        // Load the file if not already loaded
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }
        
        // Initialize result object
        const result = {
            umapData: null,
            cellCount: 0,
            hasUMAP: false,
            error: null
        };
        
        // Try to get UMAP data
        try {
            if (h5File.get('obsm') !== null) {
                const obsmKeys = h5File.get('obsm').keys();
                result.hasUMAP = obsmKeys.includes('X_umap');
                
                if (result.hasUMAP) {
                    const umapDataset = h5File.get('obsm/X_umap');
                    if (umapDataset) {
                        const rawData = umapDataset.value;
                        const shape = umapDataset.shape;
                        result.cellCount = shape[0];
                        
                        // Convert to x,y coordinates for plotting
                        const points = [];
                        for (let i = 0; i < shape[0]; i++) {
                            points.push({
                                x: rawData[i * shape[1]],
                                y: rawData[i * shape[1] + 1]
                            });
                        }
                        result.umapData = points;
                    }
                }
            }
        } catch (error) {
            console.warn("Could not extract UMAP data:", error);
            result.error = error.toString();
        }
        
        return result;
    } catch (error) {
        console.error("Error extracting UMAP data:", error);
        return {
            umapData: null,
            cellCount: 0,
            hasUMAP: false,
            error: error.toString()
        };
    }
}

// Function to extract observation values for a specific key˝
async function getObservationValues(file, obsKey) {
    try {
        // Load the file if not already loaded
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }
        
        // Initialize result object
        const result = {
            key: obsKey,
            values: null,
            uniqueValues: [],
            isCategorical: false,
            isNumeric: false,
            error: null
        };
        
        // Try to get observation values for the specified key
        try {
            if (h5File.get('obs') !== null && h5File.get('obs').keys().includes(obsKey)) {
                const obsDataset = h5File.get(`obs/${obsKey}`);
                if (obsDataset) {
                    result.values = obsDataset.value;
                    
                    // Check if values are categorical or numeric
                    // Convert values to strings if they're not already
                    const stringValues = Array.from(result.values).map(v => String(v));
                    
                    // Check if this appears to be categorical data
                    const uniqueSet = new Set(stringValues);
                    const uniqueValues = Array.from(uniqueSet);
                    
                    // If there are relatively few unique values compared to total values,
                    // or if the values are strings that don't look like numbers,
                    // treat it as categorical
                    const isMostlyNumeric = uniqueValues.every(v => !isNaN(Number(v)));
                    const fewUniqueValues = uniqueValues.length < Math.min(20, result.values.length * 0.1);
                    
                    if (!isMostlyNumeric || fewUniqueValues) {
                        result.isCategorical = true;
                        result.values = stringValues;
                        result.uniqueValues = uniqueValues;
                    } else {
                        // Treat as numeric data
                        result.isNumeric = true;
                        
                        // Convert to numbers for numeric data
                        const numericValues = Array.from(result.values).map(v => Number(v));
                        result.values = numericValues;
                        
                        // For numeric data, we'll create a color scale
                        const min = Math.min(...numericValues);
                        const max = Math.max(...numericValues);
                        result.range = { min, max };
                    }
                }
            }
        } catch (error) {
            console.warn(`Could not read values for ${obsKey}:`, error);
            result.error = error.toString();
        }
        
        return result;
    } catch (error) {
        console.error("Error extracting observation values:", error);
        return {
            key: obsKey,
            values: null,
            uniqueValues: [],
            isCategorical: false,
            isNumeric: false,
            error: error.toString()
        };
    }
}

// Function to get gene names from /var/_index
async function getGeneNames(file) {
    try {
        // Load the file if not already loaded
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }
        
        // Initialize result object
        const result = {
            geneNames: [],
            count: 0,
            error: null
        };
        
        // Try to get gene names from /var/_index
        try {
            if (h5File.get('var') !== null && h5File.get('var/_index') !== null) {
                const geneDataset = h5File.get('var/_index');
                if (geneDataset) {
                    // Get the gene names and sort them alphabetically
                    // result.geneNames = Array.from(geneDataset.value)
                    //     .map(name => String(name))
                    //     .sort((a, b) => a.localeCompare(b));
                    result.geneNames = Array.from(geneDataset.value)
                    result.count = result.geneNames.length;
                    console.log(`Found ${result.count} gene names (sorted alphabetically)`);
                    console.log("First 10 gene names:", result.geneNames.slice(0, 10));
                }
            } else {
                console.warn("Could not find /var/_index in the h5ad file");
                result.error = "Gene names not found in the expected location";
            }
        } catch (error) {
            console.warn("Could not extract gene names:", error);
            result.error = error.toString();
        }
        
        return result;
    } catch (error) {
        console.error("Error extracting gene names:", error);
        return {
            geneNames: [],
            count: 0,
            error: error.toString()
        };
    }
}
async function getGeneExpression(file, geneName) {
    try {
        if (!isFileLoaded || !h5File) {
            const success = await loadH5ADFile(file);
            if (!success) throw new Error("Failed to load h5ad file");
        }

        const result = {
            gene: geneName,
            values: null,
            range: { min: 0, max: 0 },
            error: null
        };

        // Step 1: Get gene index from gene names
        const geneNames = window.geneNames;
        if (!geneNames || geneNames.length === 0) {
            result.error = "Gene names not available. Please reload the page.";
            return result;
        }
        
        const geneIndex = geneNames.indexOf(geneName);
        if (geneIndex === -1) {
            result.error = `Gene "${geneName}" not found in the dataset.`;
            return result;
        }
        
        console.log(`Found gene "${geneName}" at index ${geneIndex}`);

        // Step 2: Check if X exists in the h5ad file
        if (!h5File.get('X')) {
            result.error = "Expression matrix (X) not found in the h5ad file.";
            return result;
        }

        // Step 3: Determine if X is a dense or sparse matrix
        const X = h5File.get('X');
        console.log("X dataset:", X);
        
        // Debug: Print all keys in the X group
        if (X.keys) {
            console.log("X keys:", X.keys());
        }
        
        // Try to determine the matrix format and extract gene expression
        try {
            // Check if X is a dense matrix (has direct values)
            if (X.value) {
                console.log("Processing dense expression matrix");
                const shape = X.shape;
                const cellCount = shape[0];
                const geneCount = shape[1];
                
                if (geneIndex >= geneCount) {
                    result.error = `Gene index ${geneIndex} is out of bounds for expression matrix with ${geneCount} genes.`;
                    return result;
                }
                
                // Extract expression values for the specific gene (column)
                const expressionValues = [];
                const expressionMatrix = X.value;
                
                for (let i = 0; i < cellCount; i++) {
                    expressionValues.push(expressionMatrix[i * geneCount + geneIndex]);
                }
                
                result.values = expressionValues;
            } 
            // Check if X is a sparse matrix with format stored in attrs
            else if (X.attrs && X.attrs.format) {
                console.log("Matrix format from attrs:", X.attrs.format);
                result.error = `Matrix format '${X.attrs.format}' is not yet supported.`;
                return result;
            }
            // Try to detect CSR format by checking for specific keys
            else if (X.keys && Array.isArray(X.keys())) {
                const xKeys = X.keys();
                console.log("X contains these keys:", xKeys);
                
                // Check for CSR format (data, indices, indptr)
                if (xKeys.includes('data') && xKeys.includes('indices') && xKeys.includes('indptr')) {
                    console.log("Detected CSR sparse matrix format");
                    
                    // Get shape information
                    let shape;
                    if (xKeys.includes('shape')) {
                        const shapeObj = h5File.get('X/shape');
                        if (shapeObj && shapeObj.value) {
                            shape = shapeObj.value;
                        } else {
                            console.log("Shape object exists but couldn't read value");
                        }
                    }
                    
                    if (!shape) {
                        // Try to get shape from other sources
                        if (h5File.get('shape')) {
                            shape = h5File.get('shape').value;
                        } else {
                            // Fallback: try to infer from obs and var counts
                            const obsCount = window.geneNames ? window.geneNames.length : 0;
                            shape = [0, obsCount]; // We don't know cell count yet
                        }
                    }
                    
                    console.log("Matrix shape:", shape);
                    
                    // Get data, indices, and indptr
                    const dataObj = h5File.get('X/data');
                    const indicesObj = h5File.get('X/indices');
                    const indptrObj = h5File.get('X/indptr');
                    
                    console.log("CSR components:", { 
                        dataObj: dataObj ? "found" : "missing", 
                        indicesObj: indicesObj ? "found" : "missing", 
                        indptrObj: indptrObj ? "found" : "missing" 
                    });
                    
                    if (!dataObj || !indicesObj || !indptrObj) {
                        result.error = "Could not read sparse matrix components";
                        return result;
                    }
                    
                    // Debug the objects
                    console.log("Data object properties:", Object.keys(dataObj));
                    console.log("Indices object properties:", Object.keys(indicesObj));
                    console.log("Indptr object properties:", Object.keys(indptrObj));
                    
                    // Try to read values
                    const data = dataObj.value;
                    const indices = indicesObj.value;
                    const indptr = indptrObj.value;
                    
                    if (!data || !indices || !indptr) {
                        result.error = "Could not read sparse matrix data values";
                        return result;
                    }
                    
                    const nCells = indptr.length - 1; // Number of cells is indptr.length - 1
                    const nGenes = shape ? shape[1] : window.geneNames.length;
                    
                    console.log(`Matrix dimensions: ${nCells} cells × ${nGenes} genes`);
                    
                    if (geneIndex >= nGenes) {
                        result.error = `Gene index ${geneIndex} is out of bounds for expression matrix with ${nGenes} genes.`;
                        return result;
                    }
                    
                    // Reconstruct expression vector for the specific gene
                    const expressionValues = new Array(nCells).fill(0);
                    
                    for (let cellIdx = 0; cellIdx < nCells; cellIdx++) {
                        const rowStart = indptr[cellIdx];
                        const rowEnd = indptr[cellIdx + 1];
                        
                        for (let j = rowStart; j < rowEnd; j++) {
                            if (indices[j] === geneIndex) {
                                expressionValues[cellIdx] = data[j];
                                break;
                            }
                        }
                    }
                    
                    result.values = expressionValues;
                } else {
                    result.error = "Unrecognized matrix format. Could not find expected keys for CSR format.";
                    return result;
                }
            } else {
                result.error = "Could not determine matrix format. X object doesn't have expected properties.";
                return result;
            }
            
            // Calculate min and max for color scaling
            if (result.values && result.values.length > 0) {
                // Set min to 0 as requested
                const min = 0;
                
                // Calculate 90th percentile for max
                const sortedValues = [...result.values].sort((a, b) => a - b);
                const index = Math.floor(sortedValues.length * 0.9);
                const max = sortedValues[index];
                
                // Calculate mean
                const sum = result.values.reduce((acc, val) => acc + val, 0);
                const mean = sum / result.values.length;
                
                // Calculate standard deviation
                const squaredDiffs = result.values.map(val => Math.pow(val - mean, 2));
                const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / result.values.length;
                const std = Math.sqrt(variance);
                
                result.range = { min, max };
                result.stats = { mean, std };
                
                console.log(`Extracted expression values for gene '${geneName}' (index: ${geneIndex})`);
                console.log(`Expression range: ${min} to ${max}`);
                console.log(`Mean: ${mean.toFixed(4)}, Standard Deviation: ${std.toFixed(4)}`);
                console.log(`Non-zero values: ${result.values.filter(v => v > 0).length} out of ${result.values.length} (${((result.values.filter(v => v > 0).length / result.values.length) * 100).toFixed(2)}%)`);
            } else {
                result.error = "No expression values were extracted";
                return result;
            }
        } catch (error) {
            console.error("Error processing expression matrix:", error);
            result.error = `Error processing expression matrix: ${error.message}`;
            return result;
        }
        
        return result;
    } catch (error) {
        console.error("Error extracting gene expression:", error);
        return {
            gene: geneName,
            values: null,
            range: { min: 0, max: 0 },
            error: error.toString()
        };
    }
}


// // Function to get gene expression values for a specific gene
// async function getGeneExpression(file, geneName) {
//     try {
//         // Load the file if not already loaded
//         if (!isFileLoaded || !h5File) {
//             const success = await loadH5ADFile(file);
//             if (!success) throw new Error("Failed to load h5ad file");
//         }
        
//         // Initialize result object
//         const result = {
//             gene: geneName,
//             values: null,
//             range: { min: 0, max: 0 },
//             error: null
//         };
        
//         // Try to get gene expression values
//         try {
//             // Check if we already have the gene names stored in the results.html file
//             // If not, we'll need to fetch them
//             let geneIndex = -1;
//             console.log("Gene name:", geneName);
//             // First try to use the stored gene names from the window object
//             // This is set in the results.html file when getGeneNames is called
//             if (typeof window !== 'undefined' && window.geneNames && window.geneNames.length > 0) {
//                 console.log("Using stored gene names from window object");
//                 geneIndex = window.geneNames.indexOf(geneName);
//                 console.log("Gene index:", geneIndex);
                
//                 if (geneIndex === -1) {
//                     result.error = `Gene '${geneName}' not found in the dataset`;
//                     return result;
//                 }
//             } 
            
//             // Fallback: fetch gene names if they're not available in the window object
//             else if (h5File.get('var') !== null && h5File.get('var/_index') !== null) {
//                 console.log("Fetching gene names from h5ad file");
//                 const geneDataset = h5File.get('var/_index');
//                 if (geneDataset) {
//                     const geneNames = Array.from(geneDataset.value).map(name => String(name));
//                     geneIndex = geneNames.indexOf(geneName);
                    
//                     if (geneIndex === -1) {
//                         result.error = `Gene '${geneName}' not found in the dataset`;
//                         return result;
//                     }
//                 }
//             } else {
//                 result.error = "Gene names not found in the expected location";
                
//                 return result;
//             }
            
//             // Now get the expression values for this gene
//             // The exact path depends on the AnnData structure, but typically it's in X
//             if (h5File.get('X') !== null) {
//                 // Get the shape of the expression matrix
//                 const shape = h5File.get('X').shape;
//                 console.log("Shape:", shape);
//                 console.log(h5File.get('X'))
                
//                 // For sparse matrices, we need to handle differently
//                 // Dense matrix - extract the column for this gene
//                 const expressionMatrix = h5File.get('X').value;
//                 const cellCount = shape[0];
                
//                 // Extract expression values for the specific gene (column)
//                 const expressionValues = [];
//                 for (let i = 0; i < cellCount; i++) {
//                     expressionValues.push(expressionMatrix[i * shape[1] + geneIndex]);
//                 }
                
//                 result.values = expressionValues;
                
//                 // Calculate min and max for color scaling
//                 const min = Math.min(...expressionValues);
//                 const max = Math.max(...expressionValues);
//                 result.range = { min, max };
                
//                 console.log(`Extracted expression values for gene '${geneName}' (index: ${geneIndex})`);
//                 console.log(`Expression range: ${min} to ${max}`);
        
//             } else {
//                 result.error = "Expression matrix not found in the expected location";
//             }
//         } catch (error) {
//             console.warn(`Could not extract expression for gene '${geneName}':`, error);
//             result.error = error.toString();
//         }
        
//         return result;
//     } catch (error) {
//         console.error("Error extracting gene expression:", error);
//         return {
//             gene: geneName,
//             values: null,
//             range: { min: 0, max: 0 },
//             error: error.toString()
//         };
//     }
// }

// Function to clean up resources when done
async function cleanupH5AD() {
    try {
        if (h5File) {
            try {
                h5File.close();
                console.log("Closed h5ad file");
            } catch (e) {
                console.warn("Error closing h5ad file:", e);
            }
            
            // Clean up file from virtual filesystem
            if (FS) {
                try {
                    FS.unlink(fileName);
                    console.log("Removed h5ad file from virtual filesystem");
                } catch (e) {
                    console.warn("Could not unlink file:", e);
                }
            }
            
            // Reset globals
            h5File = null;
            isFileLoaded = false;
        }
        
        return true;
    } catch (error) {
        console.error("Error cleaning up h5ad resources:", error);
        return false;
    }
}

export { parseH5AD, getH5ADMetadata, extractUMAPData, getObservationValues, getGeneNames, getGeneExpression, cleanupH5AD };
