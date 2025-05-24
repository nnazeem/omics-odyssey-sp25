import { hdf5 } from 'https://unpkg.com/h5wasm@0.11.0?module';

export async function processH5ADFile(uploadedFile) {
    const outputDiv = document.getElementById('h5adContent');
    if (!outputDiv) {
        console.error('Could not find output div with ID "h5adContent"');
        return;
    }

    // Clear previous output and show loading state
    outputDiv.innerHTML = '<p>Loading file metadata...</p>';

    try {
        // Wait for h5wasm to be ready
        await hdf5.ready;

        // Read the file as ArrayBuffer
        const fileBuffer = await uploadedFile.arrayBuffer();
        const fileData = new Uint8Array(fileBuffer);

        // Mount the file to the virtual filesystem
        const filename = '/uploaded_file.h5ad';
        hdf5.FS.writeFile(filename, fileData);

        try {
            // Open the HDF5 file
            const file = new hdf5.File(filename, 'r');

            // Start building the output
            let output = '<h3>File Metadata</h3>';

            // Get top-level groups/keys
            output += '<h4>Top-level groups/keys:</h4><ul>';
            const keys = file.keys();
            keys.forEach(key => {
                output += `<li>${key}</li>`;
            });
            output += '</ul>';

            // Get shape of /X dataset if it exists
            if (keys.includes('X')) {
                try {
                    const xDataset = file.get('X');
                    output += `<h4>X dataset shape:</h4><p>${JSON.stringify(xDataset.shape)}</p>`;
                    xDataset.close();
                } catch (e) {
                    output += '<p>Could not read /X dataset shape</p>';
                }
            }

            // Get number of rows in /obs and /var
            const getRowCount = (groupName) => {
                if (keys.includes(groupName)) {
                    try {
                        const group = file.get(groupName);
                        const obsKeys = group.keys();
                        const rowCount = obsKeys.length;
                        group.close();
                        return rowCount;
                    } catch (e) {
                        return 'Error reading group';
                    }
                }
                return 'Not found';
            };

            output += `<h4>Row counts:</h4>`;
            output += `<p>/obs: ${getRowCount('obs')} rows</p>`;
            output += `<p>/var: ${getRowCount('var')} rows</p>`;

            // Clean up
            file.close();

            // Update the output div
            outputDiv.innerHTML = output;

        } catch (e) {
            outputDiv.innerHTML = `<p class="error">Error reading H5AD file: ${e.message}</p>`;
            console.error('Error processing H5AD file:', e);
        } finally {
            // Clean up the virtual file
            try {
                hdf5.FS.unlink(filename);
            } catch (e) {
                console.warn('Could not clean up virtual file:', e);
            }
        }

    } catch (e) {
        outputDiv.innerHTML = `<p class="error">Failed to process file: ${e.message}</p>`;
        console.error('File processing failed:', e);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Get stored file metadata
    const fileInfo = JSON.parse(sessionStorage.getItem('fileInfo'));

    if (!fileInfo) {
        document.getElementById('h5adContent').innerHTML = '<p class="error">No file info found.</p>';
        return;
    }

    // Ask user to reupload the file — h5ad cannot be persisted through sessionStorage (only file metadata is)
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = '.h5ad';

    uploadInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            await processH5ADFile(file);
        }
    };

    const prompt = document.createElement('p');
    prompt.textContent = `Please re-select the file "${fileInfo.name}" to continue:`;
    
    document.getElementById('h5adContent').appendChild(prompt);
    document.getElementById('h5adContent').appendChild(uploadInput);
});
