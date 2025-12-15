# Wholesale API Documentation

## Base URL
All endpoints are prefixed with `/api/wholesale-orders`

---

## Endpoints

### 1. Create Wholesale Order
**POST** `/api/wholesale-orders`

**Request Body:**
```json
{
  "dsrId": 1,
  "routeId": 2,
  "orderDate": "2024-12-15",
  "categoryId": 1,
  "brandId": 2,
  "invoiceNote": "Urgent delivery required",
  "items": [
    {
      "productId": 10,
      "brandId": 2,
      "quantity": 10,
      "unit": "PCS",
      "totalQuantity": 10,
      "availableQuantity": 50,
      "freeQuantity": 2,
      "salePrice": 1500.00,
      "discount": 100.00
    }
  ]
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Urgent delivery required",
    "subtotal": "15000.00",
    "discount": "100.00",
    "total": "14900.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T10:00:00.000Z",
    "items": [
      {
        "id": 1,
        "orderId": 1,
        "productId": 10,
        "brandId": 2,
        "quantity": 10,
        "unit": "PCS",
        "totalQuantity": 10,
        "availableQuantity": 50,
        "freeQuantity": 2,
        "salePrice": "1500.00",
        "subtotal": "15000.00",
        "discount": "100.00",
        "net": "14900.00",
        "createdAt": "2024-12-15T10:00:00.000Z",
        "updatedAt": "2024-12-15T10:00:00.000Z",
        "product": {
          "id": 10,
          "name": "Samsung Galaxy S24"
        },
        "brand": {
          "id": 2,
          "name": "Samsung"
        }
      }
    ],
    "dsr": {
      "id": 1,
      "name": "John Doe"
    },
    "route": {
      "id": 2,
      "name": "Route A"
    },
    "category": {
      "id": 1,
      "name": "Electronics"
    },
    "brand": {
      "id": 2,
      "name": "Samsung"
    }
  },
  "message": "Wholesale order created successfully"
}
```

---

### 2. Get All Wholesale Orders
**GET** `/api/wholesale-orders`

**Query Parameters:**
- `search` (optional): Search by order number
- `dsrId` (optional): Filter by DSR ID
- `routeId` (optional): Filter by route ID
- `categoryId` (optional): Filter by category ID
- `brandId` (optional): Filter by brand ID
- `status` (optional): Filter by status (pending, confirmed, delivered, cancelled)
- `startDate` (optional): Filter by start date (YYYY-MM-DD)
- `endDate` (optional): Filter by end date (YYYY-MM-DD)
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/wholesale-orders?dsrId=1&status=pending&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "orderNumber": "WO-2024-0001",
      "dsrId": 1,
      "dsrName": "John Doe",
      "routeId": 2,
      "routeName": "Route A",
      "orderDate": "2024-12-15",
      "categoryId": 1,
      "categoryName": "Electronics",
      "brandId": 2,
      "brandName": "Samsung",
      "invoiceNote": "Urgent delivery required",
      "subtotal": "15000.00",
      "discount": "100.00",
      "total": "14900.00",
      "status": "pending",
      "itemCount": 1,
      "createdAt": "2024-12-15T10:00:00.000Z",
      "updatedAt": "2024-12-15T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 3. Get Wholesale Order by ID
**GET** `/api/wholesale-orders/:id`

**Example:** `/api/wholesale-orders/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Urgent delivery required",
    "subtotal": "15000.00",
    "discount": "100.00",
    "total": "14900.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T10:00:00.000Z",
    "items": [
      {
        "id": 1,
        "orderId": 1,
        "productId": 10,
        "brandId": 2,
        "quantity": 10,
        "unit": "PCS",
        "totalQuantity": 10,
        "availableQuantity": 50,
        "freeQuantity": 2,
        "salePrice": "1500.00",
        "subtotal": "15000.00",
        "discount": "100.00",
        "net": "14900.00",
        "createdAt": "2024-12-15T10:00:00.000Z",
        "updatedAt": "2024-12-15T10:00:00.000Z",
        "product": {
          "id": 10,
          "name": "Samsung Galaxy S24"
        },
        "brand": {
          "id": 2,
          "name": "Samsung"
        }
      }
    ],
    "dsr": {
      "id": 1,
      "name": "John Doe"
    },
    "route": {
      "id": 2,
      "name": "Route A"
    },
    "category": {
      "id": 1,
      "name": "Electronics"
    },
    "brand": {
      "id": 2,
      "name": "Samsung"
    }
  }
}
```

---

### 4. Update Wholesale Order
**PUT** `/api/wholesale-orders/:id`

**Request Body:** (same as create)
```json
{
  "dsrId": 1,
  "routeId": 2,
  "orderDate": "2024-12-15",
  "categoryId": 1,
  "brandId": 2,
  "invoiceNote": "Updated note",
  "items": [
    {
      "productId": 10,
      "brandId": 2,
      "quantity": 20,
      "unit": "PCS",
      "totalQuantity": 20,
      "availableQuantity": 50,
      "freeQuantity": 4,
      "salePrice": 1500.00,
      "discount": 200.00
    }
  ]
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Updated note",
    "subtotal": "30000.00",
    "discount": "200.00",
    "total": "29800.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T11:00:00.000Z",
    "items": [...]
  },
  "message": "Wholesale order updated successfully"
}
```

---

### 5. Delete Wholesale Order
**DELETE** `/api/wholesale-orders/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "Wholesale order deleted successfully"
}
```

---

### 6. Add Item to Order
**POST** `/api/wholesale-orders/:orderId/items`

**Request Body:**
```json
{
  "productId": 15,
  "brandId": 3,
  "quantity": 5,
  "unit": "BOX",
  "totalQuantity": 60,
  "availableQuantity": 100,
  "freeQuantity": 1,
  "salePrice": 2000.00,
  "discount": 50.00
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Urgent delivery required",
    "subtotal": "25000.00",
    "discount": "150.00",
    "total": "24850.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T11:30:00.000Z",
    "items": [...]
  },
  "message": "Item added to order successfully"
}
```

---

### 7. Update Item in Order
**PATCH** `/api/wholesale-orders/:orderId/items/:itemId`

**Request Body:** (all fields optional)
```json
{
  "quantity": 15,
  "discount": 150.00
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Urgent delivery required",
    "subtotal": "30000.00",
    "discount": "250.00",
    "total": "29750.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T12:00:00.000Z",
    "items": [...]
  },
  "message": "Item updated successfully"
}
```

---

### 8. Delete Item from Order
**DELETE** `/api/wholesale-orders/:orderId/items/:itemId`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "orderNumber": "WO-2024-0001",
    "dsrId": 1,
    "routeId": 2,
    "orderDate": "2024-12-15",
    "categoryId": 1,
    "brandId": 2,
    "invoiceNote": "Urgent delivery required",
    "subtotal": "15000.00",
    "discount": "100.00",
    "total": "14900.00",
    "status": "pending",
    "createdAt": "2024-12-15T10:00:00.000Z",
    "updatedAt": "2024-12-15T12:30:00.000Z",
    "items": [...]
  },
  "message": "Item deleted successfully"
}
```

**Note:** Cannot delete the last item in an order. If you need to remove all items, delete the order instead.

---

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "dsrId",
      "message": "DSR ID must be positive"
    },
    {
      "path": "items",
      "message": "At least one item is required"
    }
  ]
}
```

### Invalid ID (400)
```json
{
  "success": false,
  "message": "Invalid order ID"
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "Wholesale order not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create wholesale order"
}
```

---

## Features

- ✅ **Automatic Order Number Generation**: Format WO-YYYY-NNNN (e.g., WO-2024-0001)
- ✅ **Relational Data**: Orders include DSR, Route, Category, Brand, and Product information
- ✅ **Nested Items**: Support for multiple order items with individual calculations
- ✅ **Individual Item Management**: Add, update, or delete individual items without replacing entire order
- ✅ **Automatic Calculations**: 
  - Item subtotal = quantity × salePrice
  - Item net = subtotal - discount
  - Item totalQuantity = quantity × unit multiplier
  - Order subtotal = sum of item subtotals
  - Order discount = sum of item discounts
  - Order total = order subtotal - order discount
  - **Automatic recalculation** when items are added, updated, or deleted
- ✅ **Transaction Safety**: All create/update operations use database transactions
- ✅ **Validation**: Input validation using Zod
- ✅ **Search & Filtering**: Filter by DSR, Route, Category, Brand, Status, Date Range
- ✅ **Pagination**: Support for limit and offset parameters
- ✅ **Cascade Delete**: Deleting an order automatically deletes its items
- ✅ **Timestamps**: Automatic `createdAt` and `updatedAt` tracking

---

## Unit Multipliers

The system uses these multipliers to calculate `totalQuantity`:

```typescript
{
  "PCS": 1,      // 1 Piece = 1 unit
  "KG": 1,       // 1 Kilogram = 1 unit
  "LTR": 1,      // 1 Liter = 1 unit
  "BOX": 12,     // 1 Box = 12 units
  "CARTON": 24,  // 1 Carton = 24 units
  "DOZEN": 12    // 1 Dozen = 12 units
}
```

**Example**: If quantity = 2 and unit = "BOX", then totalQuantity = 2 × 12 = 24

---

## Schema

```typescript
// Wholesale Order
{
  id: number;                // Auto-generated
  orderNumber: string;       // Auto-generated (WO-YYYY-NNNN)
  dsrId: number;            // Foreign key to DSR
  routeId: number;          // Foreign key to Route
  orderDate: string;        // Date in YYYY-MM-DD format
  categoryId?: number;      // Optional foreign key to Category
  brandId?: number;         // Optional foreign key to Brand
  invoiceNote?: string;     // Optional notes
  subtotal: string;         // Calculated sum of item subtotals
  discount: string;         // Calculated sum of item discounts
  total: string;            // Calculated (subtotal - discount)
  status: string;           // Order status (default: "pending")
  createdAt: Date;          // Auto-managed
  updatedAt: Date;          // Auto-managed
}

// Wholesale Order Item
{
  id: number;               // Auto-generated
  orderId: number;          // Foreign key to Order
  productId: number;        // Foreign key to Product
  brandId: number;          // Foreign key to Brand
  quantity: number;         // Number of units
  unit: string;             // Unit type (PCS, KG, LTR, BOX, CARTON, DOZEN)
  totalQuantity: number;    // Calculated (quantity × unit multiplier)
  availableQuantity: number; // Stock available
  freeQuantity: number;     // Free items included
  salePrice: string;        // Price per unit
  subtotal: string;         // Calculated (quantity × salePrice)
  discount: string;         // Discount amount
  net: string;              // Calculated (subtotal - discount)
  createdAt: Date;          // Auto-managed
  updatedAt: Date;          // Auto-managed
}
```

---

## Validation Rules

### Create/Update Order
- `dsrId`: Required, positive integer
- `routeId`: Required, positive integer
- `orderDate`: Required, string (YYYY-MM-DD format)
- `categoryId`: Optional, positive integer
- `brandId`: Optional, positive integer
- `invoiceNote`: Optional, string
- `items`: Required, array with at least 1 item

### Order Item
- `productId`: Required, positive integer
- `brandId`: Required, positive integer
- `quantity`: Required, positive integer
- `unit`: Required, one of: PCS, KG, LTR, BOX, CARTON, DOZEN
- `totalQuantity`: Required, non-negative integer
- `availableQuantity`: Optional, non-negative integer (default: 0)
- `freeQuantity`: Optional, non-negative integer (default: 0)
- `salePrice`: Required, non-negative number
- `discount`: Optional, non-negative number (default: 0)

---

## Related APIs
- [Product API](../products/PRODUCT_API.md)
- [Brand API](../brand/BRAND_API.md)
- [Category API](../category/CATEGORY_API.md)
- [DSR API](../dsr/DSR_API.md)
- [Route API](../route/ROUTE_API.md)
