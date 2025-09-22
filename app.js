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
        this.isExistingProduct = false;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.setupQuickActions();
        this.setupDemoMode();
        this.loadSavedConfig();
        
        // Ensure loading overlay is hidden on startup
        this.hideLoading();
        
        // Initialize form state
        this.resetFormValidation();
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
        document.getElementById('productColor').addEventListener('change', (e) => this.handleColorChange(e));
        document.getElementById('productSize').addEventListener('change', (e) => this.validateFormFields());
        document.getElementById('customColor').addEventListener('input', (e) => this.validateFormFields());
    }
    
    setupQuickActions() {
        const quickButtons = document.querySelectorAll('.quick-btn');
        quickButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Remove active class from all buttons
                quickButtons.forEach(b => b.classList.remove('active'));
                
                // Add active class to clicked button
                btn.classList.add('active');
                
                const value = parseInt(btn.dataset.value);
                const quantityInput = document.getElementById('quantityChange');
                
                // Update the quantity input field with absolute value
                quantityInput.value = Math.abs(value);
                
                // Clear any previous status messages
                const updateStatus = document.getElementById('updateStatus');
                updateStatus.classList.add('hidden');
                
                // Auto-prepare the inventory update based on positive/negative value
                setTimeout(() => {
                    if (value > 0) {
                        this.prepareInventoryUpdate('add');
                    } else {
                        this.prepareInventoryUpdate('subtract');
                    }
                }, 150);
            });
        });
    }
    
    setupDemoMode() {
        const demoBarcodeButtons = document.querySelectorAll('.demo-barcode-btn');
        demoBarcodeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const barcode = btn.dataset.barcode;
                this.simulateBarcodeScann(barcode);
            });
        });
    }
    
    handleColorChange(e) {
        const customColorGroup = document.getElementById('customColorGroup');
        const customColorInput = document.getElementById('customColor');
        
        if (e.target.value === 'Custom') {
            customColorGroup.style.display = 'block';
            customColorInput.focus();
            customColorInput.required = true;
        } else {
            customColorGroup.style.display = 'none';
            customColorInput.value = '';
            customColorInput.required = false;
        }
        
        // Small delay to ensure DOM is updated
        setTimeout(() => {
            this.validateFormFields();
        }, 50);
    }
    
    validateFormFields() {
        const productName = document.getElementById('productName').value.trim();
        const productColor = document.getElementById('productColor').value;
        const productSize = document.getElementById('productSize').value;
        const customColor = document.getElementById('customColor').value.trim();
        
        const hasValidName = productName.length > 0;
        const hasValidColor = productColor && (productColor !== 'Custom' || customColor.length > 0);
        const hasValidSize = productSize.length > 0;
        
        // For existing products, we only require quantity changes
        const isFormValid = this.isExistingProduct ? hasValidName : 
                           hasValidName && hasValidColor && hasValidSize;
        
        const addBtn = document.getElementById('addInventory');
        const subtractBtn = document.getElementById('subtractInventory');
        
        if (addBtn && subtractBtn) {
            addBtn.disabled = !isFormValid;
            subtractBtn.disabled = !isFormValid;
        }
        
        // Add visual feedback
        this.updateFieldValidation('productName', hasValidName);
        if (!this.isExistingProduct) {
            this.updateFieldValidation('productColor', hasValidColor);
            this.updateFieldValidation('productSize', hasValidSize);
            if (productColor === 'Custom') {
                this.updateFieldValidation('customColor', customColor.length > 0);
            }
        }
        
        return isFormValid;
    }
    
    updateFieldValidation(fieldId, isValid) {
        const field = document.getElementById(fieldId);
        if (field) {
            field.classList.remove('invalid', 'valid');
            if (!this.isExistingProduct) {
                if (isValid) {
                    field.classList.add('valid');
                } else {
                    field.classList.add('invalid');
                }
            }
        }
    }
    
    resetFormValidation() {
        const fields = ['productName', 'productColor', 'productSize', 'customColor'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.classList.remove('valid', 'invalid');
            }
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
                this.showStatus('configStatus', 'success', 'Demo mode: Connection test successful! Ready to scan with expanded Color & Size tracking including Women\'s sizes 4-26.');
            } else {
                const response = await this.makeAirtableRequest('GET', `/${this.config.baseId}/${this.config.tableName}?maxRecords=1`);
                
                this.hideLoading();
                if (response.records !== undefined) {
                    this.showStatus('configStatus', 'success', 'Connection successful! Ready to scan barcodes with enhanced inventory tracking including expanded size options.');
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
        // Always allow demo scanning, even without full configuration for testing purposes
        
        // Provide haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
        this.currentBarcode = barcode;
        
        // Show scanned result
        document.getElementById('barcodeValue').textContent = barcode;
        document.getElementById('scanResult').classList.remove('hidden');
        
        // Clear any existing status messages
        document.getElementById('updateStatus').classList.add('hidden');
        document.getElementById('configStatus').classList.add('hidden');
        
        // Look up product in demo data or Airtable
        this.showLoading('Searching for existing product...');
        setTimeout(() => {
            this.simulateProductLookup(barcode);
        }, 1000);
    }
    
    async onScanSuccess(decodedText, decodedResult) {
        this.simulateBarcodeScann(decodedText);
    }
    
    simulateProductLookup(barcode) {
        this.hideLoading();
        
        // Enhanced demo products with expanded color and size options including women's sizes
        const demoProducts = {
            '123456789012': { 
                name: 'Demo Dress A', 
                quantity: 15, 
                color: 'Blue', 
                size: '12' // Women's size
            },
            '987654321098': { 
                name: 'Demo Jeans B', 
                quantity: 8, 
                color: 'Black', 
                size: '16' // Women's size
            },
            '456789123456': { 
                name: 'Demo Youth Shirt C', 
                quantity: 3, 
                color: 'Red', 
                size: '10y' // Youth size
            }
        };
        
        if (demoProducts[barcode]) {
            // Existing product found
            this.currentProduct = {
                id: 'demo_' + barcode,
                fields: {
                    'Barcode': barcode,
                    'Product Name': demoProducts[barcode].name,
                    'Quantity': demoProducts[barcode].quantity,
                    'Color': demoProducts[barcode].color,
                    'Size': demoProducts[barcode].size,
                    'Last Updated': new Date().toISOString()
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
        this.isExistingProduct = true;
        const product = this.currentProduct;
        const productName = product.fields['Product Name'] || 'Unknown Product';
        const quantity = product.fields['Quantity'] || 0;
        const color = product.fields['Color'] || 'Not specified';
        const size = product.fields['Size'] || 'Not specified';
        
        // Update section title
        document.getElementById('productSectionTitle').textContent = '🔄 Update Existing Product';
        
        // Show existing product info panel
        document.getElementById('existingProductInfo').classList.remove('hidden');
        document.getElementById('existingProductName').textContent = productName;
        document.getElementById('existingProductColor').textContent = color;
        document.getElementById('existingProductSize').textContent = size;
        document.getElementById('existingProductQuantity').textContent = quantity;
        
        // Pre-fill form fields (read-only for existing products)
        document.getElementById('productName').value = productName;
        document.getElementById('productName').readOnly = true;
        
        // Set color dropdown to existing color value
        const colorSelect = document.getElementById('productColor');
        colorSelect.value = color;
        colorSelect.disabled = true;
        
        // Set size dropdown to existing size value
        const sizeSelect = document.getElementById('productSize');
        sizeSelect.value = size;
        sizeSelect.disabled = true;
        
        document.getElementById('currentQuantity').textContent = quantity;
        
        // Hide custom color field if it was showing
        document.getElementById('customColorGroup').style.display = 'none';
        
        // Clear form validation styles for existing products
        this.resetFormValidation();
        
        this.showStatus('updateStatus', 'success', `✅ Existing product found! Current stock: ${quantity} units (${color}, Size ${size}). You can now add or subtract inventory.`);
        
        // Enable action buttons
        this.validateFormFields();
    }
    
    showNewProduct() {
        this.isExistingProduct = false;
        
        // Update section title
        document.getElementById('productSectionTitle').textContent = '➕ Add New Product';
        
        // Hide existing product info panel
        document.getElementById('existingProductInfo').classList.add('hidden');
        
        // Clear and enable form fields
        document.getElementById('productName').value = '';
        document.getElementById('productName').readOnly = false;
        document.getElementById('productName').focus();
        
        const colorSelect = document.getElementById('productColor');
        colorSelect.value = '';
        colorSelect.disabled = false;
        
        const sizeSelect = document.getElementById('productSize');
        sizeSelect.value = '';
        sizeSelect.disabled = false;
        
        document.getElementById('currentQuantity').textContent = '0';
        
        // Hide custom color field initially
        document.getElementById('customColorGroup').style.display = 'none';
        document.getElementById('customColor').value = '';
        
        // Reset form validation
        this.resetFormValidation();
        
        this.showStatus('updateStatus', 'info', '📦 New product detected! Please enter product name, select color and size (including Youth 6y-12y, Women\'s 4-26, or Standard XS-6XL), then set initial quantity.');
        
        // Disable action buttons until form is complete
        setTimeout(() => {
            this.validateFormFields();
        }, 100);
    }
    
    prepareInventoryUpdate(action) {
        if (!this.validateFormFields()) {
            const missingFields = [];
            if (!document.getElementById('productName').value.trim()) missingFields.push('Product Name');
            if (!this.isExistingProduct) {
                if (!document.getElementById('productColor').value || 
                    (document.getElementById('productColor').value === 'Custom' && 
                     !document.getElementById('customColor').value.trim())) {
                    missingFields.push('Color');
                }
                if (!document.getElementById('productSize').value) missingFields.push('Size');
            }
            
            this.showStatus('updateStatus', 'error', `Please fill in required fields: ${missingFields.join(', ')}`);
            return;
        }
        
        const quantityChange = parseInt(document.getElementById('quantityChange').value) || 0;
        
        if (quantityChange <= 0) {
            this.showStatus('updateStatus', 'error', 'Please enter a valid quantity greater than 0');
            document.getElementById('quantityChange').focus();
            return;
        }
        
        this.pendingAction = { action, quantityChange };
        
        // Show the update button and hide action buttons
        document.getElementById('addInventory').classList.add('hidden');
        document.getElementById('subtractInventory').classList.add('hidden');
        document.getElementById('updateInventory').classList.remove('hidden');
        
        const actionText = action === 'add' ? 'Add' : 'Subtract';
        const operationType = this.isExistingProduct ? 'Update' : 'Create';
        document.getElementById('updateInventory').textContent = `${actionText} ${quantityChange} - ${operationType} Record`;
        
        const currentQty = parseInt(document.getElementById('currentQuantity').textContent) || 0;
        const newQty = action === 'add' ? currentQty + quantityChange : Math.max(0, currentQty - quantityChange);
        
        this.showStatus('updateStatus', 'info', 
            `Ready to ${action} ${quantityChange} units${this.isExistingProduct ? 
            ` (${currentQty} → ${newQty})` : ` as new product`}. Click button to confirm.`);
    }
    
    async updateInventory() {
        if (!this.pendingAction) return;
        
        const { action, quantityChange } = this.pendingAction;
        const productName = document.getElementById('productName').value.trim();
        const currentQuantity = parseInt(document.getElementById('currentQuantity').textContent) || 0;
        
        // Get color value (handle custom color)
        let color = document.getElementById('productColor').value;
        if (color === 'Custom') {
            color = document.getElementById('customColor').value.trim();
        }
        const size = document.getElementById('productSize').value;
        
        let newQuantity;
        if (action === 'add') {
            newQuantity = currentQuantity + quantityChange;
        } else {
            newQuantity = Math.max(0, currentQuantity - quantityChange);
            if (currentQuantity < quantityChange) {
                this.showStatus('updateStatus', 'info', `Adjusted: Cannot subtract ${quantityChange} from ${currentQuantity}. Setting quantity to 0.`);
            }
        }
        
        this.showLoading(`${this.isExistingProduct ? 'Updating' : 'Creating'} inventory record...`);
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // For demo purposes, just update the UI
            if (!this.isConfigured() || this.config.baseId.includes('demo') || this.config.apiKey.includes('demo') ||
                this.config.baseId === 'app123456789012345' || this.config.apiKey === 'pat123456789012345') {
                // Demo mode - just update UI
                this.handleInventoryUpdateSuccess(newQuantity, action, quantityChange, { color, size });
            } else {
                // Real API call
                const now = new Date().toISOString();
                const fields = {
                    'Barcode': this.currentBarcode,
                    'Product Name': productName,
                    'Quantity': newQuantity,
                    'Color': color,
                    'Size': size,
                    'Last Updated': now
                };
                
                let response;
                if (this.currentProduct && !this.currentProduct.id.startsWith('demo_')) {
                    // Update existing record using PATCH
                    response = await this.makeAirtableRequest(
                        'PATCH',
                        `/${this.config.baseId}/${this.config.tableName}/${this.currentProduct.id}`,
                        { fields: { 'Quantity': newQuantity, 'Last Updated': now } }
                    );
                } else {
                    // Create new record
                    response = await this.makeAirtableRequest(
                        'POST',
                        `/${this.config.baseId}/${this.config.tableName}`,
                        { fields }
                    );
                }
                
                this.handleInventoryUpdateSuccess(newQuantity, action, quantityChange, { color, size });
            }
            
        } catch (error) {
            this.hideLoading();
            this.showStatus('updateStatus', 'error', `Failed to ${this.isExistingProduct ? 'update' : 'create'} inventory: ${this.getErrorMessage(error)}`);
        }
    }
    
    handleInventoryUpdateSuccess(newQuantity, action, quantityChange, productDetails) {
        this.hideLoading();
        
        // Update UI
        document.getElementById('currentQuantity').textContent = newQuantity;
        
        if (this.isExistingProduct) {
            // Update existing product display
            document.getElementById('existingProductQuantity').textContent = newQuantity;
            this.showStatus('updateStatus', 'success', 
                `✅ Successfully ${action === 'add' ? 'added' : 'subtracted'} ${quantityChange} units! New quantity: ${newQuantity}`);
        } else {
            // Show success for new product
            this.showStatus('updateStatus', 'success', 
                `✅ New product created successfully! Initial quantity: ${newQuantity} units (Color: ${productDetails.color}, Size: ${productDetails.size})`);
        }
        
        // Reset form
        this.resetInventoryForm();
        
        // Provide success feedback
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
        
        // Auto-hide success message and reset after delay
        setTimeout(() => {
            this.resetForNextScan();
        }, 4000);
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
        
        // Remove validation classes
        this.resetFormValidation();
    }
    
    resetForNextScan() {
        document.getElementById('scanResult').classList.add('hidden');
        document.getElementById('updateStatus').classList.add('hidden');
        document.getElementById('existingProductInfo').classList.add('hidden');
        document.getElementById('productSectionTitle').textContent = '📋 Product Management';
        
        // Reset form
        document.getElementById('productName').value = '';
        document.getElementById('productName').readOnly = false;
        document.getElementById('productColor').value = '';
        document.getElementById('productColor').disabled = false;
        document.getElementById('productSize').value = '';
        document.getElementById('productSize').disabled = false;
        document.getElementById('customColorGroup').style.display = 'none';
        document.getElementById('customColor').value = '';
        document.getElementById('currentQuantity').textContent = '0';
        
        // Reset state
        this.currentBarcode = null;
        this.currentProduct = null;
        this.isExistingProduct = false;
        
        // Remove validation classes
        this.resetFormValidation();
        
        this.showStatus('configStatus', 'info', 'Ready for next scan. Use demo barcodes or start camera to continue.');
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
        this.validateFormFields();
    }
    
    showStatus(elementId, type, message) {
        const statusEl = document.getElementById(elementId);
        if (statusEl) {
            statusEl.className = `status-message ${type}`;
            statusEl.textContent = message;
            statusEl.classList.remove('hidden');
            
            // Auto-hide success and info messages (but keep error messages visible)
            if (type === 'success') {
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, 6000);
            } else if (type === 'info') {
                setTimeout(() => {
                    statusEl.classList.add('hidden');
                }, 5000);
            }
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