# Stock Management API Documentation

## 📚 Overview
This is the main API documentation index. Each module has its own detailed documentation.

## 🌐 Base URL
All endpoints are prefixed with `/api`

---

## 📦 Module Documentation

### Core Modules

| Module | Base Path | Documentation | Description |
|--------|-----------|---------------|-------------|
| **Category** | `/api/categories` | [View Docs](src/modules/category/README.md) | Manage product categories with CRUD operations |
| **Brand** | `/api/brands` | [View Docs](src/modules/brand/README.md) | Manage product brands with CRUD operations |
| **Product** | `/api/products` | [View Docs](src/modules/products/README.md) | Manage products with full inventory control |
| **Auth** | `/api/auth` | [View Docs](src/modules/auth/README.md) | Authentication and authorization |

---

## 🚀 Quick Start

### 1. Start the Server
```bash
bun run dev
```
Server runs at: `http://localhost:3000`

### 2. Test an Endpoint
```bash
# Create a category
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Electronics"}'

# Get all categories
curl http://localhost:3000/api/categories
```

---

## 📋 Common Patterns

### Response Format
All API responses follow this structure:

**Success Response:**
```json
{
  "success": true,
  "data": { /* response data */ },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    {
      "path": "fieldName",
      "message": "Validation error message"
    }
  ]
}
```

### HTTP Status Codes
- `200` - Success (GET, PUT, DELETE)
- `201` - Created (POST)
- `400` - Validation Error
- `404` - Not Found
- `500` - Server Error

### Pagination
Most list endpoints support pagination:
```
GET /api/categories?limit=10&offset=0
```

### Search
Most list endpoints support search:
```
GET /api/categories?search=electron
```

---

## ✨ Global Features

- ✅ **Type-Safe**: Full TypeScript coverage
- ✅ **Validated**: Zod schema validation on all inputs
- ✅ **Paginated**: All list endpoints support pagination
- ✅ **Searchable**: Full-text search on relevant fields
- ✅ **Auto-Timestamps**: `createdAt` and `updatedAt` managed automatically
- ✅ **Error Handling**: Consistent error responses
- ✅ **CORS Enabled**: Configured for your client app

---

## 🛠️ Technology Stack

- **Runtime**: Bun
- **Framework**: Hono
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Validation**: Zod
- **Auth**: Better-Auth

---

## 📂 Project Structure

```
src/
├── modules/
│   ├── category/
│   │   ├── README.md          # ← Module documentation
│   │   ├── controller.ts
│   │   ├── service.ts
│   │   ├── routes.ts
│   │   ├── validation.ts
│   │   └── types.ts
│   ├── brand/
│   │   ├── README.md          # ← Module documentation
│   │   └── ...
│   └── products/
│       ├── README.md          # ← Module documentation
│       └── ...
├── lib/
│   ├── auth.ts
│   └── slug.ts
└── index.ts
```

---

## 🔗 Related Documentation

- [Quick Start Guide](QUICK_START.md)
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md)
- [Update Pattern Explanation](UPDATE_PATTERN_EXPLAINED.md)

---

## 📞 Support

For issues or questions, please check the module-specific documentation or refer to the implementation guides.

