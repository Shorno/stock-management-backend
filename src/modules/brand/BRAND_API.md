# Brand API Documentation

## Base URL
All endpoints are prefixed with `/api/brands`

---

## Endpoints

### 1. Create Brand
**POST** `/api/brands`

**Request Body:**
```json
{
  "name": "Samsung"
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung",
    "slug": "samsung",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  },
  "message": "Brand created successfully"
}
```

---

### 2. Get All Brands
**GET** `/api/brands`

**Query Parameters:**
- `search` (optional): Search by brand name
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/brands?search=sam&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Samsung",
      "slug": "samsung",
      "createdAt": "2025-12-13T10:00:00.000Z",
      "updatedAt": "2025-12-13T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 3. Get Brand by ID
**GET** `/api/brands/:id`

**Example:** `/api/brands/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung",
    "slug": "samsung",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  }
}
```

---

### 4. Update Brand
**PUT** `/api/brands/:id`

**Request Body:**
```json
{
  "name": "Samsung Electronics"
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Samsung Electronics",
    "slug": "samsung-electronics",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:30:00.000Z"
  },
  "message": "Brand updated successfully"
}
```

---

### 5. Delete Brand
**DELETE** `/api/brands/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "Brand deleted successfully"
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
      "message": "Brand name is required"
    }
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "Brand not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create brand"
}
```

---

## Features

- ✅ **Automatic Slug Generation**: Slugs are automatically generated from names
  - Example: "Samsung Electronics" → "samsung-electronics"
- ✅ **Validation**: Input validation using Zod
  - Name is required (1-100 characters)
- ✅ **Search**: Full-text search on brand names
- ✅ **Pagination**: Support for limit and offset parameters
- ✅ **Cascade Delete**: Deleting a brand will cascade to related products
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
- [Category API](../category/CATEGORY_API.md)
- [Product API](../products/README.md)

