# Product API Documentation

## Base URL
All endpoints are prefixed with `/api/products`

---

## Endpoints

### 1. Create Product
**POST** `/api/products`

**Request Body:**
```json
{
  "name": "Samsung Galaxy S24",
  "categoryId": 1,
  "brandId": 2,
  "supplierPrice": 800.00,
  "sellPrice": 1200.00,
  "quantity": 50
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung Galaxy S24",
    "categoryId": 1,
    "brandId": 2,
    "supplierPrice": "800.00",
    "sellPrice": "1200.00",
    "quantity": 50,
    "createdBy": "user-id-123",
    "createdAt": "2025-12-14T10:00:00.000Z",
    "updatedAt": "2025-12-14T10:00:00.000Z"
  },
  "message": "Product created successfully"
}
```

---

### 2. Get All Products
**GET** `/api/products`

**Query Parameters:**
- `search` (optional): Search by product name
- `categoryId` (optional): Filter by category ID
- `brandId` (optional): Filter by brand ID
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/products?search=samsung&categoryId=1&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Samsung Galaxy S24",
      "categoryId": 1,
      "brandId": 2,
      "supplierPrice": "800.00",
      "sellPrice": "1200.00",
      "quantity": 50,
      "createdBy": "user-id-123",
      "createdAt": "2025-12-14T10:00:00.000Z",
      "updatedAt": "2025-12-14T10:00:00.000Z",
      "category": {
        "id": 1,
        "name": "Smartphones",
        "slug": "smartphones"
      },
      "brand": {
        "id": 2,
        "name": "Samsung",
        "slug": "samsung"
      }
    }
  ],
  "total": 1
}
```

---

### 3. Get Product by ID
**GET** `/api/products/:id`

**Example:** `/api/products/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung Galaxy S24",
    "categoryId": 1,
    "brandId": 2,
    "supplierPrice": "800.00",
    "sellPrice": "1200.00",
    "quantity": 50,
    "createdBy": "user-id-123",
    "createdAt": "2025-12-14T10:00:00.000Z",
    "updatedAt": "2025-12-14T10:00:00.000Z",
    "category": {
      "id": 1,
      "name": "Smartphones",
      "slug": "smartphones"
    },
    "brand": {
      "id": 2,
      "name": "Samsung",
      "slug": "samsung"
    },
    "creator": {
      "id": "user-id-123",
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

---

### 4. Update Product
**PATCH** `/api/products/:id`

**Request Body:** (all fields optional)
```json
{
  "name": "Samsung Galaxy S24 Ultra",
  "categoryId": 1,
  "brandId": 2,
  "supplierPrice": 900.00,
  "sellPrice": 1400.00,
  "quantity": 30
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung Galaxy S24 Ultra",
    "categoryId": 1,
    "brandId": 2,
    "supplierPrice": "900.00",
    "sellPrice": "1400.00",
    "quantity": 30,
    "createdBy": "user-id-123",
    "createdAt": "2025-12-14T10:00:00.000Z",
    "updatedAt": "2025-12-14T11:30:00.000Z"
  },
  "message": "Product updated successfully"
}
```

---

### 5. Update Product Quantity
**PATCH** `/api/products/:id/quantity`

**Request Body:**
```json
{
  "quantity": 10
}
```

**Note:** The quantity value is added to the current quantity (can be negative to reduce stock).

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung Galaxy S24 Ultra",
    "categoryId": 1,
    "brandId": 2,
    "supplierPrice": "900.00",
    "sellPrice": "1400.00",
    "quantity": 40,
    "createdBy": "user-id-123",
    "createdAt": "2025-12-14T10:00:00.000Z",
    "updatedAt": "2025-12-14T12:00:00.000Z"
  },
  "message": "Product quantity updated successfully"
}
```

---

### 6. Delete Product
**DELETE** `/api/products/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "Product deleted successfully"
}
```

---

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "path": "name",
      "message": "Product name is required"
    },
    {
      "path": "supplierPrice",
      "message": "Supplier price must be a positive number"
    }
  ]
}
```

### Invalid ID (400)
```json
{
  "success": false,
  "message": "Invalid product ID"
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "Product not found"
}
```

### Unauthorized (401)
```json
{
  "success": false,
  "message": "Unauthorized. Please login to create products."
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create product"
}
```

---

## Features

- ✅ **Relational Data**: Products include category and brand information
- ✅ **User Tracking**: Tracks which user created each product
- ✅ **Validation**: Input validation using Zod
  - Name is required (1-255 characters)
  - Category ID and Brand ID must be positive integers
  - Prices must be positive numbers
  - Quantity must be non-negative integer
- ✅ **Search**: Full-text search on product names
- ✅ **Filtering**: Filter by category ID and brand ID
- ✅ **Pagination**: Support for limit and offset parameters
- ✅ **Quantity Management**: Dedicated endpoint for stock updates
- ✅ **Timestamps**: Automatic `createdAt` and `updatedAt` tracking

---

## Schema

```typescript
// Database Schema
{
  id: number;              // Auto-generated
  name: string;            // 1-255 characters
  categoryId: number;      // Foreign key to category
  brandId: number;         // Foreign key to brand
  supplierPrice: string;   // Decimal stored as string
  sellPrice: string;       // Decimal stored as string
  quantity: number;        // Non-negative integer
  createdBy: string;       // User ID who created the product
  createdAt: Date;         // Auto-managed
  updatedAt: Date;         // Auto-managed
}
```

---

## Validation Rules

### Create
- `name`: Required, 1-255 characters
- `categoryId`: Required, positive integer
- `brandId`: Required, positive integer
- `supplierPrice`: Required, positive number or string matching decimal format
- `sellPrice`: Required, positive number or string matching decimal format
- `quantity`: Optional, non-negative integer (default: 0)

### Update
- All fields are optional
- Same validation rules apply to provided fields

### Update Quantity
- `quantity`: Required, integer (can be negative to reduce stock)

---

## Related APIs
- [Brand API](../brand/BRAND_API.md)
- [Category API](../category/CATEGORY_API.md)
- [DSR API](../dsr/DSR_API.md)
- [Route API](../route/ROUTE_API.md)
