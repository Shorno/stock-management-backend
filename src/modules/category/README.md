# Category API Documentation

## Base URL
All endpoints are prefixed with `/api/categories`

---

## Endpoints

### 1. Create Category
**POST** `/api/categories`

**Request Body:**
```json
{
  "name": "Electronics"
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Electronics",
    "slug": "electronics",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  },
  "message": "Category created successfully"
}
```

---

### 2. Get All Categories
**GET** `/api/categories`

**Query Parameters:**
- `search` (optional): Search by category name
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/categories?search=elect&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Electronics",
      "slug": "electronics",
      "createdAt": "2025-12-13T10:00:00.000Z",
      "updatedAt": "2025-12-13T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 3. Get Category by ID
**GET** `/api/categories/:id`

**Example:** `/api/categories/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Electronics",
    "slug": "electronics",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  }
}
```

---

### 4. Update Category
**PUT** `/api/categories/:id`

**Request Body:**
```json
{
  "name": "Consumer Electronics"
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Consumer Electronics",
    "slug": "consumer-electronics",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:30:00.000Z"
  },
  "message": "Category updated successfully"
}
```

---

### 5. Delete Category
**DELETE** `/api/categories/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "Category deleted successfully"
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
      "message": "Category name is required"
    }
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "Category not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create category"
}
```

---

## Features

- ✅ **Automatic Slug Generation**: Slugs are automatically generated from names
  - Example: "Consumer Electronics" → "consumer-electronics"
- ✅ **Validation**: Input validation using Zod
  - Name is required (1-100 characters)
- ✅ **Search**: Full-text search on category names
- ✅ **Pagination**: Support for limit and offset parameters
- ✅ **Cascade Delete**: Deleting a category will cascade to related products
- ✅ **Timestamps**: Automatic `createdAt` and `updatedAt` tracking

---

## Schema

```typescript
// Database Schema
{
  id: number;           // Auto-generated
  name: string;         // 1-100 characters
  slug: string;         // Auto-generated, unique
  createdAt: Date;      // Auto-managed
  updatedAt: Date;      // Auto-managed
}
```

---

## Validation Rules

### Create/Update
- `name`: Required, 1-100 characters
- `slug`: Auto-generated (not user input)

---

## Related APIs
- [Brand API](../brand/README.md)
- [Product API](../products/README.md)

