document.addEventListener('DOMContentLoaded', () => {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const processBtn = document.getElementById('processBtn');
    
    let selectedFile = null;

    // Only run this code on the upload page
    if (dropArea && fileInput && browseBtn) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });

        // Highlight drop area when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, unhighlight, false);
        });

        // Handle dropped files
        dropArea.addEventListener('drop', handleDrop, false);
        
        // Open file dialog when browse button is clicked
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        
        // Handle file selection
        fileInput.addEventListener('change', handleFileSelect);
        
        // Make drop area clickable
        dropArea.addEventListener('click', () => {
            fileInput.click();
        });
        
        // Handle process button click if it exists
        if (processBtn) {
            processBtn.addEventListener('click', processFile);
        }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropArea.classList.add('dragover');
    }

    function unhighlight() {
        dropArea.classList.remove('dragover');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        
        if (!file) return;
        
        // Check if file has .h5ad extension
        if (!file.name.toLowerCase().endsWith('.h5ad')) {
            alert('Please upload a .h5ad file');
            return;
        }
        
        selectedFile = file;
        displayFileInfo(file);
    }

    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check if file has .h5ad extension
        if (!file.name.toLowerCase().endsWith('.h5ad')) {
            alert('Please upload a .h5ad file');
            return;
        }
        
        selectedFile = file;
        displayFileInfo(file);
    }

    function displayFileInfo(file) {
        // Get elements by ID in case they weren't found during initialization
        const fileInfoElement = fileInfo || document.getElementById('fileInfo');
        const fileNameElement = fileName || document.getElementById('fileName');
        const fileSizeElement = fileSize || document.getElementById('fileSize');
        const processBtnElement = processBtn || document.getElementById('processBtn');
        
        if (!fileInfoElement || !fileNameElement || !fileSizeElement) {
            console.error('Required DOM elements not found');
            return;
        }
        
        // Update file information
        fileNameElement.textContent = file.name;
        fileSizeElement.textContent = formatFileSize(file.size);
        fileInfoElement.style.display = 'block';
        
        // Enable the process button
        if (processBtnElement) {
            processBtnElement.disabled = false;
        }
        
        // Scroll to show the file info
        fileInfoElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }



    async function processFile() {
        if (!selectedFile) return;
        
        // Prepare file info object
        const fileInfo = {
            name: selectedFile.name,
            size: selectedFile.size,
            type: selectedFile.type || 'application/octet-stream',
            lastModified: selectedFile.lastModified
        };
        
        // Store file info in sessionStorage to pass to the results page
        sessionStorage.setItem('fileInfo', JSON.stringify(fileInfo));
        
        // Store the file in IndexedDB for access on the results page
        try {
            const fileRequest = indexedDB.open('h5adFileStorage', 1);
            
            fileRequest.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'name' });
                }
            };
            
            fileRequest.onsuccess = function(event) {
                const db = event.target.result;
                const transaction = db.transaction(['files'], 'readwrite');
                const store = transaction.objectStore('files');
                
                // Store the file object
                store.put({
                    name: selectedFile.name,
                    file: selectedFile
                });
                
                transaction.oncomplete = function() {
                    // Redirect to results page after file is stored
                    window.location.href = 'results.html';
                };
            };
            
            fileRequest.onerror = function(event) {
                console.error('Error opening IndexedDB:', event.target.error);
                // Redirect anyway, but the file won't be available
                window.location.href = 'results.html';
            };
        } catch (error) {
            console.error('Error storing file:', error);
            // Redirect anyway
            window.location.href = 'results.html';
        }
    }



    // Format file size from bytes to human readable format
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }




});
