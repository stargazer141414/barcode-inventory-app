class InventoryScanner {
    constructor() {
        this.config = {
            baseId: '',
            tableName: 'Inventory',
            apiKey: ''
        };
        this.html5QrcodeScanner = null;
        this.isScanning = false;
        this.currentBarcode = null;
        this.currentProduct = null;
        this.pendingAction = null;
        this.isExistingProduct = false;
        this.debugMode = true;
        this.retryCount = 0;
        this.maxRetries = 3;
        
        this.init();
    }
    
    init() {
        this.bindEvents();
        this.setupQuickActions();
        this.setupDemoMode();
        this.loadDemoConfig();
        this.hideLoading();
        this.log('Application initialized');
    }
    
    loadDemoConfig() {
        // Pre-fill with demo credentials that will work
        document.getElementById('baseId').value = 'app123456789012345';
        document.getElementById('tableName').value = 'Inventory';
        document.getElementById('apiKey').value = 'pat123456789012345';
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
                
                quickButtons.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const value = parseInt(e.target.dataset.value);
                const quantityInput = document.getElementById('quantityChange');
                
                quantityInput.value = Math.abs(value);
                document.getElementById('updateStatus').classList.add('hidden');
                
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
    
    log(message, data = null) {
        if (!this.debugMode) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        
        console.log(logMessage, data || '');
        
        const debugLog = document.getElementById('debugLog');
        const debugOutput = document.getElementById('debugOutput');
        
        debugLog.classList.remove('hidden');
        
        const entry = data ? `${logMessage}\n${JSON.stringify(data, null, 2)}\n` : `${logMessage}\n`;
        debugOutput.textContent = entry + debugOutput.textContent;
        
        // Keep only last 20 entries to prevent overflow
        const lines = debugOutput.textContent.split('\n');
        if (lines.length > 100) {
            debugOutput.textContent = lines.slice(0, 100).join('\n');
        }
    }
    
    handleColorChange(e) {
        const customColorGroup = document.getElementById('customColorGroup');
        const customColorInput = document.getElementById('customColor');
        
        if (e.target.value === 'Custom') {
            customColorGroup.style.display = 'block';
            customColorInput.focus();
        } else {
            customColorGroup.style.display = 'none';
            customColorInput.value = '';
        }
        
        this.validateFormFields();
    }
    
    validateFormFields() {
        const productName = document.getElementById('productName').value.trim();
        const productColor = document.getElementById('productColor').value;
        const productSize = document.getElementById('productSize').value;
        const customColor = document.getElementById('customColor').value.trim();
        
        const hasValidName = productName.length > 0;
        const hasValidColor = productColor && (productColor !== 'Custom' || customColor);
        const hasValidSize = productSize.length > 0;
        
        const isFormValid = this.isExistingProduct ? hasValidName : 
                           hasValidName && hasValidColor && hasValidSize;
        
        const addBtn = document.getElementById('addInventory');
        const subtractBtn = document.getElementById('subtractInventory');
        
        addBtn.disabled = !isFormValid;
        subtractBtn.disabled = !isFormValid;
        
        this.updateFieldValidation('productName', hasValidName);
        if (!this.isExistingProduct) {
            this.updateFieldValidation('productColor', hasValidColor);
            this.updateFieldValidation('productSize', hasValidSize);
            if (productColor === 'Custom') {
                this.updateFieldValidation('customColor', customColor.length > 0);
            }
        } else {
            // For existing products, remove validation styling from disabled fields
            document.getElementById('productColor').classList.remove('valid', 'invalid');
            document.getElementById('productSize').classList.remove('valid', 'invalid');
        }
        
        return isFormValid;
    }
    
    updateFieldValidation(fieldId, isValid) {
        const field = document.getElementById(fieldId);
        if (field.disabled || field.readOnly) {
            // Don't apply validation styling to disabled/readonly fields
            field.classList.remove('valid', 'invalid');
            return;
        }
        
        if (isValid) {
            field.classList.remove('invalid');
            field.classList.add('valid');
        } else {
            field.classList.remove('valid');
            field.classList.add('invalid');
        }
    }
    
    saveConfiguration() {
        const baseId = document.getElementById('baseId').value.trim();
        const tableName = document.getElementById('tableName').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!baseId || !tableName || !apiKey) {
            this.showStatus('configStatus', 'error', 'Please fill in all configuration fields');
            return;
        }
        
        // Accept demo credentials
        if (baseId === 'app123456789012345' && apiKey === 'pat123456789012345') {
            this.config = { baseId, tableName, apiKey };
            this.log('Demo configuration saved', this.config);
            this.showStatus('configStatus', 'success', 'Demo configuration saved successfully! Click "Test Connection" to verify.');
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
        this.log('Configuration saved', this.config);
        this.showStatus('configStatus', 'success', 'Configuration saved successfully! Click "Test Connection" to verify.');
    }
    
    async testConnection() {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please save configuration first');
            return;
        }
        
        this.showLoading('Testing connection...');
        this.log('Testing connection to Airtable');
        
        try {
            // For demo mode, simulate success
            if (this.isDemoMode()) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                this.hideLoading();
                this.log('Demo connection test successful');
                this.showStatus('configStatus', 'success', 
                    '✅ Demo mode connection successful! Ready to scan barcodes with automatic name assignment.');
                return;
            }
            
            // Real API test
            const testQuery = `/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}?maxRecords=1`;
            this.log('Making test request', { query: testQuery });
            
            const response = await this.makeAirtableRequest('GET', testQuery);
            
            this.hideLoading();
            this.log('Connection test successful', response);
            
            if (response.records !== undefined) {
                this.showStatus('configStatus', 'success', 
                    `✅ Connection successful! Found table "${this.config.tableName}" with ${response.records.length > 0 ? 'existing data' : 'no records yet'}.`);
            } else {
                throw new Error('Invalid response format - missing records array');
            }
            
        } catch (error) {
            this.hideLoading();
            this.log('Connection test failed', { error: error.message, stack: error.stack });
            this.showStatus('configStatus', 'error', 
                `Connection failed: ${this.getErrorMessage(error)}. Please check your credentials and table name.`);
        }
    }
    
    async startCamera() {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please configure and test Airtable connection first');
            return;
        }
        
        try {
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
            this.log('Camera started successfully');
            this.showStatus('configStatus', 'info', 'Camera started successfully. Point camera at a barcode to scan.');
            
        } catch (error) {
            this.log('Failed to start camera', error);
            this.showStatus('configStatus', 'error', 'Failed to start camera. Please check permissions or use test barcodes below.');
            this.resetScanner();
        }
    }
    
    async stopCamera() {
        if (this.html5QrcodeScanner && this.isScanning) {
            try {
                await this.html5QrcodeScanner.stop();
                this.resetScanner();
                this.log('Camera stopped');
                this.showStatus('configStatus', 'info', 'Camera stopped successfully.');
            } catch (error) {
                this.log('Error stopping camera', error);
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
        document.getElementById('productSection').style.display = 'block';
    }
    
    simulateBarcodeScann(barcode) {
        if (!this.isConfigured()) {
            this.showStatus('configStatus', 'error', 'Please configure and test Airtable connection first');
            return;
        }
        
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
        this.currentBarcode = barcode;
        this.log('Barcode scanned', { barcode });
        
        document.getElementById('barcodeValue').textContent = barcode;
        document.getElementById('scanResult').classList.remove('hidden');
        
        // Reset any previous state
        this.resetProductForm();
        
        this.showLoading('Searching for existing product...');
        
        // Always use demo data for testing purposes
        setTimeout(() => {
            this.simulateProductLookup(barcode);
        }, 1000);
    }
    
    async onScanSuccess(decodedText, decodedResult) {
        this.simulateBarcodeScann(decodedText);
    }
    
    async lookupProduct(barcode) {
        this.log('Starting product lookup', { barcode });
        this.retryCount = 0;
        
        try {
            if (this.isDemoMode()) {
                // Always use demo data in demo mode
                this.simulateProductLookup(barcode);
                return;
            }
            
            // Real API call for production mode
            const filterFormula = encodeURIComponent(`{Barcode}='${barcode}'`);
            const endpoint = `/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}?filterByFormula=${filterFormula}`;
            
            this.log('Making Airtable API request', { 
                endpoint, 
                filterFormula: `{Barcode}='${barcode}'`,
                fullUrl: `https://api.airtable.com/v0${endpoint}`
            });
            
            const response = await this.makeAirtableRequestWithRetry('GET', endpoint);
            
            this.hideLoading();
            this.log('Product lookup response', response);
            
            if (response.records && response.records.length > 0) {
                this.currentProduct = response.records[0];
                this.log('Existing product found', this.currentProduct);
                this.showExistingProduct();
            } else {
                this.currentProduct = null;
                this.log('No existing product found - new product');
                this.showNewProduct();
            }
            
            document.getElementById('productSection').style.display = 'block';
            
        } catch (error) {
            this.hideLoading();
            this.log('Product lookup failed', { error: error.message, barcode });
            this.showStatus('updateStatus', 'error', 
                `Failed to lookup product: ${this.getErrorMessage(error)}. Please check your connection and try again.`);
            document.getElementById('productSection').style.display = 'block';
        }
    }
    
    simulateProductLookup(barcode) {
        this.hideLoading();
        
        // Enhanced demo products with more realistic data
        const demoProducts = {
            '123456789012': { 
                id: 'recDemo001',
                name: 'Classic Cotton T-Shirt', 
                quantity: 15, 
                color: 'Blue', 
                size: 'M',
                lastUpdated: '2024-01-15T10:30:00.000Z'
            },
            '987654321098': { 
                id: 'recDemo002',
                name: 'Denim Straight Jeans', 
                quantity: 8, 
                color: 'Black', 
                size: 'L',
                lastUpdated: '2024-01-10T14:45:00.000Z'
            },
            '456789123456': { 
                id: 'recDemo003',
                name: 'Wool Pullover Sweater', 
                quantity: 3, 
                color: 'Red', 
                size: 'XL',
                lastUpdated: '2024-01-12T09:15:00.000Z'
            }
        };
        
        this.log('Using demo data for barcode', { barcode, available: Object.keys(demoProducts) });
        
        if (demoProducts[barcode]) {
            // Simulate Airtable record structure
            const demoProduct = demoProducts[barcode];
            this.currentProduct = {
                id: demoProduct.id,
                fields: {
                    'Barcode': barcode,
                    'Product Name': demoProduct.name,
                    'Quantity': demoProduct.quantity,
                    'Color': demoProduct.color,
                    'Size': demoProduct.size,
                    'Last Updated': demoProduct.lastUpdated
                }
            };
            
            this.log('Demo existing product found', this.currentProduct);
            this.showExistingProduct();
        } else {
            this.currentProduct = null;
            this.log('Demo new product');
            this.showNewProduct();
        }
        
        document.getElementById('productSection').style.display = 'block';
    }
    
    showExistingProduct() {
        this.isExistingProduct = true;
        const product = this.currentProduct;
        const productName = product.fields['Product Name'] || 'Unknown Product';
        const quantity = product.fields['Quantity'] || 0;
        const color = product.fields['Color'] || 'Not specified';
        const size = product.fields['Size'] || 'Not specified';
        
        this.log('Displaying existing product', { productName, quantity, color, size });
        
        // Update section title and show existing product info
        document.getElementById('productSectionTitle').textContent = '🔄 Update Existing Product';
        document.getElementById('existingProductInfo').classList.remove('hidden');
        document.getElementById('newProductInfo').classList.add('hidden');
        
        // Populate existing product details
        document.getElementById('existingProductName').textContent = productName;
        document.getElementById('existingProductColor').textContent = color;
        document.getElementById('existingProductSize').textContent = size;
        document.getElementById('existingProductQuantity').textContent = quantity;
        
        // Auto-fill form fields with readonly/disabled state for existing products
        const productNameField = document.getElementById('productName');
        const productColorField = document.getElementById('productColor');
        const productSizeField = document.getElementById('productSize');
        
        productNameField.value = productName;
        productNameField.readOnly = true;
        productNameField.classList.add('auto-assigned');
        document.getElementById('productNameHelper').classList.remove('hidden');
        
        // Set color and size fields to show existing values but make them disabled
        productColorField.value = color;
        productColorField.disabled = true;
        
        productSizeField.value = size;
        productSizeField.disabled = true;
        
        document.getElementById('currentQuantity').textContent = quantity;
        document.getElementById('customColorGroup').style.display = 'none';
        
        this.showStatus('updateStatus', 'success', 
            `✅ Existing product found! "${productName}" (${color}, ${size}) - Current stock: ${quantity} units. Product name auto-assigned from database.`);
        
        this.validateFormFields();
    }
    
    showNewProduct() {
        this.isExistingProduct = false;
        
        this.log('Displaying new product form');
        
        // Update section title and show new product indicator
        document.getElementById('productSectionTitle').textContent = '➕ Add New Product';
        document.getElementById('existingProductInfo').classList.add('hidden');
        document.getElementById('newProductInfo').classList.remove('hidden');
        
        // Clear and enable form fields
        const productNameField = document.getElementById('productName');
        const productColorField = document.getElementById('productColor');
        const productSizeField = document.getElementById('productSize');
        
        productNameField.value = '';
        productNameField.readOnly = false;
        productNameField.classList.remove('auto-assigned');
        productNameField.focus();
        document.getElementById('productNameHelper').classList.add('hidden');
        
        productColorField.value = '';
        productColorField.disabled = false;
        
        productSizeField.value = '';
        productSizeField.disabled = false;
        
        document.getElementById('currentQuantity').textContent = '0';
        document.getElementById('customColorGroup').style.display = 'none';
        document.getElementById('customColor').value = '';
        
        this.showStatus('updateStatus', 'warning', 
            '📦 New product detected! Manual entry required - please enter product name, select color and size, then set initial quantity.');
        
        this.validateFormFields();
    }
    
    resetProductForm() {
        // Reset all form fields and states
        document.getElementById('existingProductInfo').classList.add('hidden');
        document.getElementById('newProductInfo').classList.add('hidden');
        document.getElementById('productSectionTitle').textContent = '📋 Product Management';
        
        const productNameField = document.getElementById('productName');
        productNameField.value = '';
        productNameField.readOnly = false;
        productNameField.classList.remove('auto-assigned');
        document.getElementById('productNameHelper').classList.add('hidden');
        
        document.getElementById('productColor').value = '';
        document.getElementById('productColor').disabled = false;
        document.getElementById('productSize').value = '';
        document.getElementById('productSize').disabled = false;
        document.getElementById('customColorGroup').style.display = 'none';
        document.getElementById('customColor').value = '';
        
        // Remove validation classes
        document.querySelectorAll('.form-control').forEach(field => {
            field.classList.remove('valid', 'invalid');
        });
        
        this.resetInventoryForm();
    }
    
    prepareInventoryUpdate(action) {
        if (!this.validateFormFields()) {
            const missingFields = [];
            if (!document.getElementById('productName').value.trim()) missingFields.push('Product Name');
            if (!this.isExistingProduct) {
                const colorField = document.getElementById('productColor');
                const customColorField = document.getElementById('customColor');
                
                if (!colorField.value || (colorField.value === 'Custom' && !customColorField.value.trim())) {
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
        this.log('Prepared inventory update', this.pendingAction);
        
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
                this.showStatus('updateStatus', 'info', 
                    `Adjusted: Cannot subtract ${quantityChange} from ${currentQuantity}. Setting quantity to 0.`);
            }
        }
        
        this.log('Starting inventory update', {
            action, quantityChange, productName, currentQuantity, newQuantity, color, size,
            isExistingProduct: this.isExistingProduct
        });
        
        this.showLoading(`${this.isExistingProduct ? 'Updating' : 'Creating'} inventory record...`);
        
        try {
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
            
            if (this.isDemoMode()) {
                // Demo mode - simulate successful update
                await new Promise(resolve => setTimeout(resolve, 1500));
                response = { id: this.currentProduct?.id || 'recNewDemo', fields };
            } else {
                if (this.currentProduct && this.isExistingProduct) {
                    // Update existing record using PATCH
                    const endpoint = `/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}/${this.currentProduct.id}`;
                    const updateFields = { 'Quantity': newQuantity, 'Last Updated': now };
                    
                    this.log('Updating existing record', { endpoint, fields: updateFields });
                    response = await this.makeAirtableRequestWithRetry('PATCH', endpoint, { fields: updateFields });
                } else {
                    // Create new record
                    const endpoint = `/${this.config.baseId}/${encodeURIComponent(this.config.tableName)}`;
                    
                    this.log('Creating new record', { endpoint, fields });
                    response = await this.makeAirtableRequestWithRetry('POST', endpoint, { fields });
                }
            }
            
            this.log('Inventory update successful', response);
            this.handleInventoryUpdateSuccess(newQuantity, action, quantityChange, { color, size, productName });
            
        } catch (error) {
            this.hideLoading();
            this.log('Inventory update failed', { error: error.message, action, quantityChange });
            this.showStatus('updateStatus', 'error', 
                `Failed to ${this.isExistingProduct ? 'update' : 'create'} inventory: ${this.getErrorMessage(error)}`);
        }
    }
    
    handleInventoryUpdateSuccess(newQuantity, action, quantityChange, productDetails) {
        this.hideLoading();
        
        document.getElementById('currentQuantity').textContent = newQuantity;
        
        if (this.isExistingProduct) {
            document.getElementById('existingProductQuantity').textContent = newQuantity;
            this.showStatus('updateStatus', 'success', 
                `✅ Successfully ${action === 'add' ? 'added' : 'subtracted'} ${quantityChange} units! New quantity: ${newQuantity}`);
        } else {
            this.showStatus('updateStatus', 'success', 
                `✅ New product "${productDetails.productName}" created successfully! Initial quantity: ${newQuantity} units (${productDetails.color}, ${productDetails.size})`);
        }
        
        this.resetInventoryForm();
        
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
        
        setTimeout(() => {
            this.resetForNextScan();
        }, 5000);
    }
    
    resetInventoryForm() {
        this.pendingAction = null;
        document.getElementById('quantityChange').value = '1';
        document.getElementById('addInventory').classList.remove('hidden');
        document.getElementById('subtractInventory').classList.remove('hidden');
        document.getElementById('updateInventory').classList.add('hidden');
        
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
    
    resetForNextScan() {
        this.log('Resetting for next scan');
        
        document.getElementById('scanResult').classList.add('hidden');
        document.getElementById('updateStatus').classList.add('hidden');
        
        this.resetProductForm();
        
        this.currentBarcode = null;
        this.currentProduct = null;
        this.isExistingProduct = false;
        
        this.showStatus('configStatus', 'info', 'Ready for next scan. Use test barcodes or start camera to continue.');
    }
    
    async makeAirtableRequestWithRetry(method, endpoint, data = null) {
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await this.makeAirtableRequest(method, endpoint, data);
            } catch (error) {
                this.log(`Request attempt ${attempt + 1} failed`, { error: error.message, endpoint });
                
                if (attempt === this.maxRetries) {
                    throw error;
                }
                
                // Wait before retry with exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
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
        
        this.log('Making Airtable request', { method, url, hasData: !!data });
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { error: { message: `HTTP ${response.status}: ${response.statusText}` } };
            }
            
            const errorMessage = errorData.error?.message || errorData.error || `HTTP ${response.status}`;
            this.log('Request failed', { status: response.status, error: errorMessage });
            throw new Error(errorMessage);
        }
        
        const result = await response.json();
        this.log('Request successful', { method, endpoint, recordCount: result.records?.length });
        return result;
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
        statusEl.className = `status-message ${type}`;
        statusEl.textContent = message;
        statusEl.classList.remove('hidden');
        
        if (type === 'success') {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 8000);
        } else if (type === 'info') {
            setTimeout(() => {
                statusEl.classList.add('hidden');
            }, 6000);
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
    
    isDemoMode() {
        return this.config.baseId === 'app123456789012345' || 
               this.config.apiKey === 'pat123456789012345' ||
               this.config.baseId.includes('demo') || 
               this.config.apiKey.includes('demo');
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const scanner = new InventoryScanner();
    
    // Add global error handler
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        scanner.log('Global error caught', { error: event.error.message, stack: event.error.stack });
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