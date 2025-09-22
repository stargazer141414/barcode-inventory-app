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
    
    setProductNameFieldState(isExisting, productName = '') {
        const productNameField = document.getElementById('productName');
        const autoAssignedIndicator = document.getElementById('autoAssignedIndicator');
        const productNameIndicator = document.getElementById('productNameIndicator');
        
        if (isExisting) {
            // Auto-assigned state - existing product
            productNameField.value = productName;
            productNameField.readOnly = true;
            productNameField.classList.remove('manual-entry');
            productNameField.classList.add('auto-assigned');
            productNameField.setAttribute('title', 'Product name is auto-assigned from existing record');
            
            // Show auto-assigned indicator
            autoAssignedIndicator.classList.remove('hidden');
            
            // Update field indicator
            productNameIndicator.textContent = '🔒 Auto-assigned';
            productNameIndicator.classList.remove('manual-entry', 'hidden');
            productNameIndicator.classList.add('auto-assigned');
            
        } else {
            // Manual entry state - new product
            productNameField.value = '';
            productNameField.readOnly = false;
            productNameField.classList.remove('auto-assigned');
            productNameField.classList.add('manual-entry');
            productNameField.setAttribute('title', 'Enter product name manually for new product');
            productNameField.placeholder = 'Enter product name for new product';
            
            // Hide auto-assigned indicator
            autoAssignedIndicator.classList.add('hidden');
            
            // Update field indicator
            productNameIndicator.textContent = '✏️ Manual entry required';
            productNameIndicator.classList.remove('auto-assigned', 'hidden');
            productNameIndicator.classList.add('manual-entry');
            
            // Focus on the field for immediate input
            setTimeout(() => productNameField.focus(), 100);
        }
    }
    
    updateProductTypeIndicator(isExisting) {
        const indicator = document.getElementById('productTypeIndicator');
        const label = document.getElementById('productTypeLabel');
        
        if (isExisting) {
            label.textContent = '🔄 Existing Product - Name Auto-Assigned';
            label.classList.remove('new');
            label.classList.add('existing');
        } else {
            label.textContent = '➕ New Product - Manual Entry Required';
            label.classList.remove('existing');
            label.classList.add('new');
        }
        
        indicator.classList.remove('hidden');
    }
    
    validateFormFields() {
        const productName = document.getElementById('productName').value.trim();
        const productColor = document.getElementById('productColor').value;
        const productSize = document.getElementById('productSize').value;
        const customColor = document.getElementById('customColor').value.trim();
        
        const hasValidName = productName.length > 0;
        const hasValidColor = productColor && (productColor !== 'Custom' || customColor);
        const hasValidSize = productSize.length > 0;
        
        // For existing products, name is auto-assigned so we only require quantity changes
        // For new products, we require all fields including manual name entry
        const isFormValid = this.isExistingProduct ? 
            hasValidName : // Existing: just need the auto-assigned name (always true)
            hasValidName && hasValidColor && hasValidSize; // New: need all fields including manual name
        
        const addBtn = document.getElementById('addInventory');
        const subtractBtn = document.getElementById('subtractInventory');
        
        addBtn.disabled = !isFormValid;
        subtractBtn.disabled = !isFormValid;
        
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
        if (isValid) {
            field.classList.remove('invalid');
            field.classList.add('valid');
        } else {
            field.classList.remove('valid');
            field.classList.add('invalid');
        }
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
                this.showStatus('configStatus', 'success', 'Demo mode: Connection test successful! Ready to scan with automatic product name assignment.');
            } else {
                const response = await this.makeAirtableRequest('GET', `/${this.config.baseId}/${this.config.tableName}?maxRecords=1`);
                
                this.hideLoading();
                if (response.records !== undefined) {
                    this.showStatus('configStatus', 'success', 'Connection successful! Ready to scan barcodes with automatic product name assignment.');
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
        this.showLoading('Checking if product exists in database...');
        setTimeout(() => {
            this.simulateProductLookup(barcode);
        }, 1000);
    }
    
    async onScanSuccess(decodedText, decodedResult) {
        this.simulateBarcodeScann(decodedText);
    }
    
    simulateProductLookup(barcode) {
        this.hideLoading();
        
        // Enhanced demo products with color and size
        const demoProducts = {
            '123456789012': { 
                name: 'Classic Blue T-Shirt', 
                quantity: 15, 
                color: 'Blue', 
                size: 'M' 
            },
            '987654321098': { 
                name: 'Premium Black Jeans', 
                quantity: 8, 
                color: 'Black', 
                size: 'L' 
            },
            '456789123456': { 
                name: 'Cozy Red Sweater', 
                quantity: 3, 
                color: 'Red', 
                size: 'XL' 
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
        
        // Show product type indicator
        this.updateProductTypeIndicator(true);
        
        // Show existing product info panel
        document.getElementById('existingProductInfo').classList.remove('hidden');
        document.getElementById('existingProductName').textContent = productName;
        document.getElementById('existingProductColor').textContent = color;
        document.getElementById('existingProductSize').textContent = size;
        document.getElementById('existingProductQuantity').textContent = quantity;
        
        // Set product name field state (auto-assigned, read-only)
        this.setProductNameFieldState(true, productName);
        
        // Pre-fill other fields (but keep them editable for updates if needed)
        document.getElementById('productColor').value = color;
        document.getElementById('productColor').disabled = false; // Allow color updates
        document.getElementById('productSize').value = size;
        document.getElementById('productSize').disabled = false; // Allow size updates
        document.getElementById('currentQuantity').textContent = quantity;
        
        // Hide custom color field if it was showing
        document.getElementById('customColorGroup').style.display = 'none';
        
        this.showStatus('updateStatus', 'success', 
            `✅ Existing product found! Product name "${productName}" auto-assigned from database. Current stock: ${quantity} units. You can update quantity and optionally modify color/size.`);
        
        // Enable action buttons since we have all required data
        this.validateFormFields();
    }
    
    showNewProduct() {
        this.isExistingProduct = false;
        
        // Update section title
        document.getElementById('productSectionTitle').textContent = '➕ Add New Product';
        
        // Show product type indicator
        this.updateProductTypeIndicator(false);
        
        // Hide existing product info panel
        document.getElementById('existingProductInfo').classList.add('hidden');
        
        // Set product name field state (manual entry required)
        this.setProductNameFieldState(false);
        
        // Clear and enable other form fields
        document.getElementById('productColor').value = '';
        document.getElementById('productColor').disabled = false;
        document.getElementById('productSize').value = '';
        document.getElementById('productSize').disabled = false;
        document.getElementById('currentQuantity').textContent = '0';
        
        // Hide custom color field initially
        document.getElementById('customColorGroup').style.display = 'none';
        document.getElementById('customColor').value = '';
        
        this.showStatus('updateStatus', 'info', 
            '📦 New product detected! Please enter the product name manually, then select color and size to set initial quantity.');
        
        // Disable action buttons until form is complete (including manual name entry)
        this.validateFormFields();
    }
    
    prepareInventoryUpdate(action) {
        if (!this.validateFormFields()) {
            const missingFields = [];
            if (!document.getElementById('productName').value.trim()) {
                missingFields.push(this.isExistingProduct ? 'Product Name (should be auto-assigned)' : 'Product Name (manual entry required)');
            }
            if (!this.isExistingProduct) {
                if (!document.getElementById('productColor').value || 
                    (document.getElementById('productColor').value === 'Custom' && 
                     !document.getElementById('customColor').value.trim())) {
                    missingFields.push('Color');
                }
                if (!document.getElementById('productSize').value) missingFields.push('Size');
            }
            
            this.showStatus('updateStatus', 'error', `Please complete required fields: ${missingFields.join(', ')}`);
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
        const operationType = this.isExistingProduct ? 'Update Existing' : 'Create New';
        const productName = document.getElementById('productName').value.trim();
        document.getElementById('updateInventory').textContent = `${actionText} ${quantityChange} - ${operationType}`;
        
        const currentQty = parseInt(document.getElementById('currentQuantity').textContent) || 0;
        const newQty = action === 'add' ? currentQty + quantityChange : Math.max(0, currentQty - quantityChange);
        
        const assignmentInfo = this.isExistingProduct ? 
            `for "${productName}" (auto-assigned)` : 
            `for "${productName}" (manual entry)`;
        
        this.showStatus('updateStatus', 'info', 
            `Ready to ${action} ${quantityChange} units ${assignmentInfo}${this.isExistingProduct ? 
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
        
        const operationType = this.isExistingProduct ? 'Updating existing product' : 'Creating new product';
        this.showLoading(`${operationType}...`);
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // For demo purposes, just update the UI
            if (this.config.baseId.includes('demo') || this.config.apiKey.includes('demo') ||
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
                    const updateFields = { 
                        'Quantity': newQuantity, 
                        'Color': color,
                        'Size': size,
                        'Last Updated': now 
                    };
                    response = await this.makeAirtableRequest(
                        'PATCH',
                        `/${this.config.baseId}/${this.config.tableName}/${this.currentProduct.id}`,
                        { fields: updateFields }
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
        
        const productName = document.getElementById('productName').value.trim();
        
        // Update UI
        document.getElementById('currentQuantity').textContent = newQuantity;
        
        if (this.isExistingProduct) {
            // Update existing product display
            document.getElementById('existingProductQuantity').textContent = newQuantity;
            this.showStatus('updateStatus', 'success', 
                `✅ Successfully ${action === 'add' ? 'added' : 'subtracted'} ${quantityChange} units for "${productName}" (auto-assigned)! New quantity: ${newQuantity}`);
        } else {
            // Show success for new product
            this.showStatus('updateStatus', 'success', 
                `✅ New product "${productName}" created successfully! Initial quantity: ${newQuantity} units (Color: ${productDetails.color}, Size: ${productDetails.size})`);
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
        }, 5000);
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
        document.querySelectorAll('.form-control').forEach(field => {
            field.classList.remove('valid', 'invalid');
        });
    }
    
    resetForNextScan() {
        document.getElementById('scanResult').classList.add('hidden');
        document.getElementById('updateStatus').classList.add('hidden');
        document.getElementById('existingProductInfo').classList.add('hidden');
        document.getElementById('productTypeIndicator').classList.add('hidden');
        document.getElementById('productSectionTitle').textContent = '📋 Product Management';
        
        // Reset product name field state
        const productNameField = document.getElementById('productName');
        const autoAssignedIndicator = document.getElementById('autoAssignedIndicator');
        const productNameIndicator = document.getElementById('productNameIndicator');
        
        productNameField.value = '';
        productNameField.readOnly = false;
        productNameField.classList.remove('auto-assigned', 'manual-entry');
        productNameField.setAttribute('title', '');
        productNameField.placeholder = 'Enter product name';
        autoAssignedIndicator.classList.add('hidden');
        productNameIndicator.classList.add('hidden');
        
        // Reset other form fields
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
        document.querySelectorAll('.form-control').forEach(field => {
            field.classList.remove('valid', 'invalid');
        });
        
        this.showStatus('configStatus', 'info', 'Ready for next scan. Use demo barcodes above to test automatic name assignment vs manual entry.');
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
        statusEl.className = `status-message ${type}`;
        statusEl.textContent = message;
        statusEl.classList.remove('hidden');
        
        // Auto-hide success and info messages (but keep error messages visible)
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