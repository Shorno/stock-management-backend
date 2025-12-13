# Route API Documentation

## Base URL
All endpoints are prefixed with `/api/routes`

---

## Overview
Route management API for sales/delivery routes. Manage route records with full CRUD operations and automatic slug generation.

---

## Endpoints

### 1. Create Route
**POST** `/api/routes`

**Request Body:**
```json
{
  "name": "Downtown Area"
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Downtown Area",
    "slug": "downtown-area",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  },
  "message": "Route created successfully"
}
```

---

### 2. Get All Routes
**GET** `/api/routes`

**Query Parameters:**
- `search` (optional): Search by route name
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/routes?search=downtown&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Downtown Area",
      "slug": "downtown-area",
      "createdAt": "2025-12-13T10:00:00.000Z",
      "updatedAt": "2025-12-13T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 3. Get Route by ID
**GET** `/api/routes/:id`

**Example:** `/api/routes/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Downtown Area",
    "slug": "downtown-area",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  }
}
```

---

### 4. Update Route
**PUT** `/api/routes/:id`

**Request Body:**
```json
{
  "name": "Central Downtown"
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Central Downtown",
    "slug": "central-downtown",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:30:00.000Z"
  },
  "message": "Route updated successfully"
}
```

---

### 5. Delete Route
**DELETE** `/api/routes/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "Route deleted successfully"
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
      "message": "Route name is required"
    }
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "Route not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create route"
}
```

---

## Features

- ✅ **Automatic Slug Generation**: Slugs are automatically generated from names
  - Example: "Downtown Area" → "downtown-area"
- ✅ **Validation**: Input validation using Zod
  - Name is required (1-100 characters)
- ✅ **Search**: Full-text search on route names
- ✅ **Pagination**: Support for limit and offset parameters
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

## Use Cases

- Manage delivery/sales routes
- Assign routes to DSRs
- Track route-based sales and inventory

---

## Related APIs
- [DSR API](../dsr/README.md)
- [Category API](../category/CATEGORY_API.md)
- [Brand API](../brand/BRAND_API.md)

