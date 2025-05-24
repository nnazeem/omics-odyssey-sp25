// h5parser.js - Handles parsing h5ad files using h5wasm

// Import h5wasm from CDN
const h5wasmUrl = "https://cdn.jsdelivr.net/npm/h5wasm@0.4.9/dist/esm/hdf5_hl.js";

// Function to parse h5ad file and extract obs and obsm keys
async function parseH5AD(file) {
    try {
        // Dynamically import h5wasm
        const h5wasmModule = await import(h5wasmUrl);
        const h5wasm = h5wasmModule.default;
        
        // Wait for h5wasm to be ready
        const { FS } = await h5wasm.ready;
        
        // Read the file into an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Write the file to the virtual filesystem
        const fileName = 'temp.h5ad';
        FS.writeFile(fileName, new Uint8Array(arrayBuffer));
        
        // Open the file for reading
        const h5File = new h5wasm.File(fileName, "r");
        
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
        
        // Close the file
        h5File.close();
        
        // Clean up
        try {
            FS.unlink(fileName);
        } catch (e) {
            console.warn("Could not unlink file:", e);
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
        // Dynamically import h5wasm
        const h5wasmModule = await import(h5wasmUrl);
        const h5wasm = h5wasmModule.default;
        
        // Wait for h5wasm to be ready
        const { FS } = await h5wasm.ready;
        
        // Read the file into an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Write the file to the virtual filesystem
        const fileName = 'temp.h5ad';
        FS.writeFile(fileName, new Uint8Array(arrayBuffer));
        
        // Open the file for reading
        const h5File = new h5wasm.File(fileName, "r");
        
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
        
        // Close the file
        h5File.close();
        
        // Clean up
        try {
            FS.unlink(fileName);
        } catch (e) {
            console.warn("Could not unlink file:", e);
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
        // Dynamically import h5wasm
        const h5wasmModule = await import(h5wasmUrl);
        const h5wasm = h5wasmModule.default;
        
        // Wait for h5wasm to be ready
        const { FS } = await h5wasm.ready;
        
        // Read the file into an ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Write the file to the virtual filesystem
        const fileName = 'temp.h5ad';
        FS.writeFile(fileName, new Uint8Array(arrayBuffer));
        
        // Open the file for reading
        const h5File = new h5wasm.File(fileName, "r");
        
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
        
        // Close the file
        h5File.close();
        
        // Clean up
        try {
            FS.unlink(fileName);
        } catch (e) {
            console.warn("Could not unlink file:", e);
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

export { parseH5AD, getH5ADMetadata, extractUMAPData };
