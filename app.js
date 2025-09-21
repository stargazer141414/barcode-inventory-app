class InventoryScanner {
    constructor() {
        this.config = {
            baseId: '',
            tableName: '',
            apiKey: ''
        };
        this.html5QrcodeScanner = null;
        this.isScanning = false;
        this.currentBarcode = null;
        this.currentProduct = null;
        this.pendingAction = null;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.setupQuickActions();
        this.setupDemoMode();
        this.loadSavedConfig();
        
        // Ensure loading overlay is hidden on startup
        this.hideLoading();
    }
    
    bindEvents() {
        // Configuration events
        document.getElementById('saveConfig').addEventListener('click', () => this.saveConfiguration());
        document.getElementById('testConnection').addEventListener('click', () => this.testConnection());
        
        // Scanner events
        document.getElementById('startCamera').addEventListener('click', () => this.startCamera());
        document.getElementById('stopCamera').addEventListener('click', () => this.stopCamera());
        
        // Inventory events
        document.getElementById('addInventory').addEventListener('click', () => this.prepareInventoryUpdate('add'));
        document.getElementById('subtractInventory').addEventListener('click', () => this.prepareInventoryUpdate('subtract'));
        document.getElementById('updateInventory').addEventListener('click', () => this.updateInventory());
        
        // Form events
        document.getElementById('quantityChange').addEventListener('input', (e) => this.validateQuantityInput(e));
        document.getElementById('productName').addEventListener('input', (e) => this.validateProductName(e));
    }
    
    setupQuickActions() {
        const quickButtons = document.querySelectorAll('.quick-btn');
        quickButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Remove active class from all buttons
                quickButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                e.target.classList.add('active');
                
                const value = parseInt(e.target.dataset.value);
                const quantityInput = document.getElementById('quantityChange');
                
                // Update the quantity input field with absolute value
                quantityInput.value = Math.abs(value);
                
                // Clear any previous status messages
                document.getElementById('updateStatus').classList.add('hidden');
                
                // Auto-prepare the inventory update based on positive/negative value
                setTimeout(() => {
                    if (value > 0) {
                        this.prepareInventoryUpdate('add');
                    } else {
                        this.prepareInventoryUpdate('subtract');
                    }
                }, 100);
            });
        });
    }
    
    setupDemoMode() {
        const demoBarcodeButtons = document.querySelectorAll('.demo-barcode-btn');
        demoBarcodeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const barcode = e.target.dataset.barcode;
                this.simulateBarcodeScann(barcode);
            });
        });
    }
    
    loadSavedConfig() {
        // For demo purposes, we won't use localStorage as per strict instructions
        // Instead, show helpful placeholder text
        document.getElementById('baseId').placeholder = 'app123456789012345 (demo)';
        document.getElementById('apiKey').placeholder = 'pat123456789012345 (demo)';
    }
    
    saveConfiguration() {
        const baseId = document.getElementById('baseId').value.trim();
        const tableName = document.getElementById('tableName').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!baseId || !tableName || !apiKey) {
            this.showStatus('configStatus', 'error', 'Please fill in all configuration fields');
            return;
        }
        
        if (!baseId.startsWith('app') || baseId.length < 17) {
            this.showStatus('configStatus', 'error', 'Base ID should start with "app" and be 17+ characters');
            return;
        }
        
        if (!apiKey.startsWith('pat') || apiKey.length < 17) {
            this.showStatus('configStatus', 'error', 'Personal Access Token should start with "pat" and be 17+ characters');
            return;
        }
        
        this.config = { baseId, tableName, apiKey };
        this.showStatus('configStatus', 'success', 'Configuration saved successfully! Click "Test Connection" to verify.');
    }
    
    async testConnection() {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please save configuration first');
            return;
        }
        
        this.showLoading('Testing connection...');
        
        try {
            // Simulate network delay for demo
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // For demo purposes, simulate different responses based on credentials
            if (this.config.baseId.includes('demo') || this.config.apiKey.includes('demo') || 
                this.config.baseId === 'app123456789012345' || this.config.apiKey === 'pat123456789012345') {
                this.hideLoading();
                this.showStatus('configStatus', 'success', 'Demo mode: Connection test successful! You can now use the scanner or demo barcodes.');
            } else {
                const response = await this.makeAirtableRequest('GET', `/${this.config.baseId}/${this.config.tableName}?maxRecords=1`);
                
                this.hideLoading();
                if (response.records !== undefined) {
                    this.showStatus('configStatus', 'success', 'Connection successful! Ready to scan barcodes.');
                } else {
                    throw new Error('Invalid response format');
                }
            }
            
        } catch (error) {
            this.hideLoading();
            this.showStatus('configStatus', 'error', `Connection failed: ${this.getErrorMessage(error)}. Try using demo credentials for testing.`);
        }
    }
    
    async startCamera() {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please configure Airtable connection first');
            return;
        }
        
        try {
            // Check if Html5Qrcode is available
            if (typeof Html5Qrcode === 'undefined') {
                throw new Error('Scanner library not loaded');
            }
            
            const config = {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E
                ]
            };
            
            this.html5QrcodeScanner = new Html5Qrcode("reader");
            
            // Show scanner and hide placeholder
            document.getElementById('reader').style.display = 'block';
            document.getElementById('scanner-placeholder').style.display = 'none';
            document.getElementById('startCamera').classList.add('hidden');
            document.getElementById('stopCamera').classList.remove('hidden');
            
            await this.html5QrcodeScanner.start(
                { facingMode: "environment" },
                config,
                (decodedText, decodedResult) => this.onScanSuccess(decodedText, decodedResult),
                (errorMessage) => {} // Silent error handling for continuous scanning
            );
            
            this.isScanning = true;
            this.showStatus('configStatus', 'info', 'Camera started successfully. Point camera at a barcode to scan.');
            
        } catch (error) {
            console.error('Failed to start camera:', error);
            this.showStatus('configStatus', 'error', 'Failed to start camera. Please check permissions or use demo barcodes below.');
            this.resetScanner();
        }
    }
    
    async stopCamera() {
        if (this.html5QrcodeScanner && this.isScanning) {
            try {
                await this.html5QrcodeScanner.stop();
                this.resetScanner();
                this.showStatus('configStatus', 'info', 'Camera stopped successfully.');
            } catch (error) {
                console.error('Error stopping camera:', error);
                this.resetScanner();
            }
        }
    }
    
    resetScanner() {
        this.isScanning = false;
        this.html5QrcodeScanner = null;
        
        document.getElementById('reader').style.display = 'none';
        document.getElementById('scanner-placeholder').style.display = 'flex';
        document.getElementById('startCamera').classList.remove('hidden');
        document.getElementById('stopCamera').classList.add('hidden');
        document.getElementById('scanResult').classList.add('hidden');
        document.getElementById('productSection').style.display = 'block'; // Keep visible for demo
    }
    
    simulateBarcodeScann(barcode) {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please configure Airtable connection first');
            return;
        }
        
        // Provide haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
        this.currentBarcode = barcode;
        
        // Show scanned result
        document.getElementById('barcodeValue').textContent = barcode;
        document.getElementById('scanResult').classList.remove('hidden');
        
        // Look up product in demo data or Airtable
        this.showLoading('Looking up product...');
        setTimeout(() => {
            this.simulateProductLookup(barcode);
        }, 1000);
    }
    
    async onScanSuccess(decodedText, decodedResult) {
        this.simulateBarcodeScann(decodedText);
    }
    
    simulateProductLookup(barcode) {
        this.hideLoading();
        
        // Simulate demo products
        const demoProducts = {
            '123456789012': { name: 'Demo Product A', quantity: 15 },
            '987654321098': { name: 'Demo Product B', quantity: 8 },
            '456789123456': { name: 'Demo Product C', quantity: 0 }
        };
        
        if (demoProducts[barcode]) {
            // Existing product
            this.currentProduct = {
                id: 'demo_' + barcode,
                fields: {
                    'Product Name': demoProducts[barcode].name,
                    'Quantity': demoProducts[barcode].quantity
                }
            };
            this.showExistingProduct();
        } else {
            // New product
            this.currentProduct = null;
            this.showNewProduct();
        }
        
        document.getElementById('productSection').style.display = 'block';
    }
    
    async lookupProduct(barcode) {
        try {
            const response = await this.makeAirtableRequest(
                'GET', 
                `/${this.config.baseId}/${this.config.tableName}?filterByFormula=({Barcode}='${barcode}')`
            );
            
            this.hideLoading();
            
            if (response.records && response.records.length > 0) {
                // Existing product found
                this.currentProduct = response.records[0];
                this.showExistingProduct();
            } else {
                // New product
                this.currentProduct = null;
                this.showNewProduct();
            }
            
            document.getElementById('productSection').style.display = 'block';
            
        } catch (error) {
            this.hideLoading();
            this.showStatus('updateStatus', 'error', `Failed to lookup product: ${this.getErrorMessage(error)}`);
            document.getElementById('productSection').style.display = 'block';
        }
    }
    
    showExistingProduct() {
        const product = this.currentProduct;
        const productName = product.fields['Product Name'] || 'Unknown Product';
        const quantity = product.fields['Quantity'] || 0;
        
        document.getElementById('productName').value = productName;
        document.getElementById('productName').readOnly = true;
        document.getElementById('currentQuantity').textContent = quantity;
        
        // Clear any error messages since product is found
        document.getElementById('updateStatus').classList.add('hidden');
        
        this.showStatus('updateStatus', 'info', `Found existing product: ${productName}`);
    }
    
    showNewProduct() {
        document.getElementById('productName').value = '';
        document.getElementById('productName').readOnly = false;
        document.getElementById('productName').focus();
        document.getElementById('currentQuantity').textContent = '0';
        
        this.showStatus('updateStatus', 'info', 'New product detected. Please enter the product name below.');
    }
    
    prepareInventoryUpdate(action) {
        const quantityChange = parseInt(document.getElementById('quantityChange').value) || 0;
        const productName = document.getElementById('productName').value.trim();
        
        if (!productName) {
            this.showStatus('updateStatus', 'error', 'Please enter a product name');
            document.getElementById('productName').focus();
            return;
        }
        
        if (quantityChange <= 0) {
            this.showStatus('updateStatus', 'error', 'Please enter a valid quantity');
            document.getElementById('quantityChange').focus();
            return;
        }
        
        this.pendingAction = { action, quantityChange };
        
        // Show the update button and hide action buttons
        document.getElementById('addInventory').classList.add('hidden');
        document.getElementById('subtractInventory').classList.add('hidden');
        document.getElementById('updateInventory').classList.remove('hidden');
        
        const actionText = action === 'add' ? 'Add' : 'Subtract';
        document.getElementById('updateInventory').textContent = `${actionText} ${quantityChange} to Inventory`;
        
        this.showStatus('updateStatus', 'info', `Ready to ${action} ${quantityChange} units. Click the button below to confirm.`);
    }
    
    async updateInventory() {
        if (!this.pendingAction) return;
        
        const { action, quantityChange } = this.pendingAction;
        const productName = document.getElementById('productName').value.trim();
        const currentQuantity = parseInt(document.getElementById('currentQuantity').textContent) || 0;
        
        let newQuantity;
        if (action === 'add') {
            newQuantity = currentQuantity + quantityChange;
        } else {
            newQuantity = Math.max(0, currentQuantity - quantityChange);
            if (currentQuantity < quantityChange) {
                this.showStatus('updateStatus', 'error', `Cannot subtract ${quantityChange} from ${currentQuantity}. Setting quantity to 0.`);
            }
        }
        
        this.showLoading('Updating inventory...');
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // For demo purposes, just update the UI
            if (this.config.baseId.includes('demo') || this.config.apiKey.includes('demo') ||
                this.config.baseId === 'app123456789012345' || this.config.apiKey === 'pat123456789012345') {
                // Demo mode - just update UI
                this.handleInventoryUpdateSuccess(newQuantity, action, quantityChange);
            } else {
                // Real API call
                const now = new Date().toISOString();
                const fields = {
                    'Barcode': this.currentBarcode,
                    'Product Name': productName,
                    'Quantity': newQuantity,
                    'Last Updated': now
                };
                
                let response;
                if (this.currentProduct && !this.currentProduct.id.startsWith('demo_')) {
                    // Update existing record
                    response = await this.makeAirtableRequest(
                        'PATCH',
                        `/${this.config.baseId}/${this.config.tableName}/${this.currentProduct.id}`,
                        { fields }
                    );
                } else {
                    // Create new record
                    response = await this.makeAirtableRequest(
                        'POST',
                        `/${this.config.baseId}/${this.config.tableName}`,
                        { fields }
                    );
                }
                
                this.handleInventoryUpdateSuccess(newQuantity, action, quantityChange);
            }
            
        } catch (error) {
            this.hideLoading();
            this.showStatus('updateStatus', 'error', `Failed to update inventory: ${this.getErrorMessage(error)}`);
        }
    }
    
    handleInventoryUpdateSuccess(newQuantity, action, quantityChange) {
        this.hideLoading();
        
        // Update UI
        document.getElementById('currentQuantity').textContent = newQuantity;
        this.showStatus('updateStatus', 'success', `Successfully ${action === 'add' ? 'added' : 'subtracted'} ${quantityChange} units! New quantity: ${newQuantity}`);
        
        // Reset form
        this.resetInventoryForm();
        
        // Provide success feedback
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
        
        // Auto-hide success message and reset after delay
        setTimeout(() => {
            this.resetForNextScan();
        }, 3000);
    }
    
    resetInventoryForm() {
        this.pendingAction = null;
        document.getElementById('quantityChange').value = '1';
        document.getElementById('addInventory').classList.remove('hidden');
        document.getElementById('subtractInventory').classList.remove('hidden');
        document.getElementById('updateInventory').classList.add('hidden');
        
        // Remove active class from quick buttons
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
    
    resetForNextScan() {
        document.getElementById('scanResult').classList.add('hidden');
        document.getElementById('updateStatus').classList.add('hidden');
        document.getElementById('productName').value = '';
        document.getElementById('productName').readOnly = false;
        document.getElementById('currentQuantity').textContent = '0';
        this.currentBarcode = null;
        this.currentProduct = null;
        
        this.showStatus('configStatus', 'info', 'Ready for next scan. Use demo barcodes or start camera.');
    }
    
    async makeAirtableRequest(method, endpoint, data = null) {
        const url = `https://api.airtable.com/v0${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json'
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    validateQuantityInput(e) {
        const value = parseInt(e.target.value);
        if (value < 1 || isNaN(value)) {
            e.target.value = 1;
        }
    }
    
    validateProductName(e) {
        const hasName = e.target.value.trim().length > 0;
        const addBtn = document.getElementById('addInventory');
        const subtractBtn = document.getElementById('subtractInventory');
        const updateStatus = document.getElementById('updateStatus');
        
        if (hasName) {
            addBtn.disabled = false;
            subtractBtn.disabled = false;
            // Clear error message when valid name is entered
            if (updateStatus.textContent.includes('Please enter a product name')) {
                updateStatus.classList.add('hidden');
            }
        } else {
            addBtn.disabled = true;
            subtractBtn.disabled = true;
        }
    }
    
    showStatus(elementId, type, message) {
        const statusEl = document.getElementById(elementId);
        statusEl.className = `status-message ${type}`;
        statusEl.textContent = message;
        statusEl.classList.remove('hidden');
        
        // Auto-hide success and info messages (but keep error messages visible)
        if (type === 'success') {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 5000);
        } else if (type === 'info') {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 4000);
        }
    }
    
    showLoading(message = 'Loading...') {
        document.getElementById('loadingMessage').textContent = message;
        document.getElementById('loadingOverlay').classList.remove('hidden');
    }
    
    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    }
    
    getErrorMessage(error) {
        if (error.message) {
            return error.message;
        }
        
        if (typeof error === 'string') {
            return error;
        }
        
        return 'An unexpected error occurred';
    }
    
    isConfigured() {
        return this.config.baseId && this.config.tableName && this.config.apiKey;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const scanner = new InventoryScanner();
    
    // Add global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
    });
    
    // Handle page visibility changes to manage camera
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && scanner.isScanning) {
            scanner.stopCamera();
        }
    });
    
    // Handle beforeunload to clean up camera
    window.addEventListener('beforeunload', () => {
        if (scanner.isScanning) {
            scanner.stopCamera();
        }
    });
});