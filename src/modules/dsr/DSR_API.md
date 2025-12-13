# DSR API Documentation

## Base URL
All endpoints are prefixed with `/api/dsrs`

---

## Overview
DSR (Distribution Sales Representative) management API. Manage DSR records with full CRUD operations and automatic slug generation.

---

## Endpoints

### 1. Create DSR
**POST** `/api/dsrs`

**Request Body:**
```json
{
  "name": "John Doe"
}
```

**Response:** (201 Created)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "slug": "john-doe",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  },
  "message": "DSR created successfully"
}
```

---

### 2. Get All DSRs
**GET** `/api/dsrs`

**Query Parameters:**
- `search` (optional): Search by DSR name
- `limit` (optional): Number of results per page (default: 50)
- `offset` (optional): Number of results to skip (default: 0)

**Example:** `/api/dsrs?search=john&limit=10&offset=0`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "slug": "john-doe",
      "createdAt": "2025-12-13T10:00:00.000Z",
      "updatedAt": "2025-12-13T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

---

### 3. Get DSR by ID
**GET** `/api/dsrs/:id`

**Example:** `/api/dsrs/1`

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "slug": "john-doe",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:00:00.000Z"
  }
}
```

---

### 4. Update DSR
**PUT** `/api/dsrs/:id`

**Request Body:**
```json
{
  "name": "John Smith"
}
```

**Response:** (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Smith",
    "slug": "john-smith",
    "createdAt": "2025-12-13T10:00:00.000Z",
    "updatedAt": "2025-12-13T10:30:00.000Z"
  },
  "message": "DSR updated successfully"
}
```

---

### 5. Delete DSR
**DELETE** `/api/dsrs/:id`

**Response:** (200 OK)
```json
{
  "success": true,
  "message": "DSR deleted successfully"
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
      "message": "DSR name is required"
    }
  ]
}
```

### Not Found (404)
```json
{
  "success": false,
  "message": "DSR not found"
}
```

### Server Error (500)
```json
{
  "success": false,
  "message": "Failed to create DSR"
}
```

---

## Features

- ✅ **Automatic Slug Generation**: Slugs are automatically generated from names
  - Example: "John Doe" → "john-doe"
- ✅ **Validation**: Input validation using Zod
  - Name is required (1-100 characters)
- ✅ **Search**: Full-text search on DSR names
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

- Manage sales representatives
- Track DSR assignments
- Associate DSRs with routes and sales

---

## Related APIs
- [Route API](../route/ROUTE_API.md)
- [Category API](../category/CATEGORY_API.md)
- [Brand API](../brand/BRAND_API.md)

